import {
  isPaneArrangement,
  isTileCount,
  MAX_TILES,
  MIN_TILES,
  paneRects,
  type Rect,
} from '../../tiling/layout';
import type { TabFlowDB } from '../db';
import type { Id, LayoutLink, TileLayout } from '../models';
import { orderAfterLast } from '../order';
import { type Clock, newId, RecordNotFoundError, systemClock } from './common';

/** Saved layouts of «Рядом». */
export class LayoutRepository {
  constructor(
    private readonly db: TabFlowDB,
    private readonly clock: Clock = systemClock,
  ) {}

  /** Layouts sorted by `order` (the newest last). */
  list(): Promise<TileLayout[]> {
    return this.db.layouts.orderBy('order').toArray();
  }

  get(id: Id): Promise<TileLayout | undefined> {
    return this.db.layouts.get(id);
  }

  /** `rects` — where the panes are (one per link); kept only when they fit. */
  async create(
    name: string,
    links: readonly LayoutLink[],
    rects?: readonly Rect[],
  ): Promise<TileLayout> {
    if (!isTileCount(links.length)) {
      throw new RangeError(`A layout holds ${MIN_TILES}–${MAX_TILES} links, got ${links.length}`);
    }
    return this.db.transaction('rw', this.db.layouts, async () => {
      const now = this.clock();
      const layout: TileLayout = {
        id: newId(),
        name: name.trim(),
        order: orderAfterLast(await this.list()),
        links: links.map(({ tabId, url, title }) =>
          tabId === undefined ? { url, title } : { tabId, url, title },
        ),
        ...(isPaneArrangement(rects, links.length) ? { rects: copyRects(rects ?? []) } : {}),
        createdAt: now,
        updatedAt: now,
      };
      await this.db.layouts.add(layout);
      return layout;
    });
  }

  async rename(id: Id, name: string): Promise<void> {
    const changed = await this.db.layouts.update(id, {
      name: name.trim(),
      updatedAt: this.clock(),
    });
    if (changed === 0) throw new RecordNotFoundError('Layout', id);
  }

  /**
   * «Добавить» in the viewer of a saved layout: the links go to its end, up to nine in all. Moved
   * panes keep their places; the new ones get their places in the grid of the new number.
   */
  async addLinks(id: Id, links: readonly LayoutLink[]): Promise<TileLayout> {
    return this.db.transaction('rw', this.db.layouts, async () => {
      const layout = await this.db.layouts.get(id);
      if (!layout) throw new RecordNotFoundError('Layout', id);
      const known = new Set(layout.links.map((link) => link.url));
      const fresh = links
        .filter((link) => !known.has(link.url))
        .slice(0, MAX_TILES - layout.links.length);
      const all = [
        ...layout.links,
        ...fresh.map(({ tabId, url, title }) =>
          tabId === undefined ? { url, title } : { tabId, url, title },
        ),
      ];
      const arranged = isPaneArrangement(layout.rects, layout.links.length)
        ? layout.rects
        : undefined;
      const grid = paneRects(all.length);
      const rects = arranged && [...copyRects(arranged), ...grid.slice(arranged.length)];
      const changes = {
        links: all,
        rects: rects && isPaneArrangement(rects, all.length) ? rects : undefined,
        updatedAt: this.clock(),
      };
      await this.db.layouts.update(id, changes);
      return { ...layout, ...changes };
    });
  }

  /** Where the panes are now (moved or resized), one per link; `undefined` — back to the grid. */
  async setRects(id: Id, rects: readonly Rect[] | undefined): Promise<void> {
    await this.db.transaction('rw', this.db.layouts, async () => {
      const layout = await this.db.layouts.get(id);
      if (!layout) throw new RecordNotFoundError('Layout', id);
      const fits = isPaneArrangement(rects, layout.links.length);
      await this.db.layouts.update(id, {
        rects: fits ? copyRects(rects ?? []) : undefined,
        updatedAt: this.clock(),
      });
    });
  }

  /** Deletes the layout for good; returns it, so that undo can put it back with `restore`. */
  async remove(id: Id): Promise<TileLayout> {
    return this.db.transaction('rw', this.db.layouts, async () => {
      const layout = await this.db.layouts.get(id);
      if (!layout) throw new RecordNotFoundError('Layout', id);
      await this.db.layouts.delete(id);
      return layout;
    });
  }

  /** Puts a deleted layout back as it was (undo). */
  async restore(layout: TileLayout): Promise<void> {
    await this.db.layouts.put(layout);
  }
}

function copyRects(rects: readonly Rect[]): Rect[] {
  return rects.map(({ left, top, width, height }) => ({ left, top, width, height }));
}
