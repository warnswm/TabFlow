import type { TabFlowDB } from '../db';
import type { Id, QueueItem, QueueStatus } from '../models';
import { videoKey } from '../../queue/video-url';
import { ORDER_STEP, orderAfterLast, orderBetween, placeAt } from '../order';
import {
  byOrder,
  type Clock,
  isLive,
  liveOnly,
  newId,
  RecordNotFoundError,
  systemClock,
} from './common';

export interface NewQueueItem {
  url: string;
  title: string;
  site: string;
  videoId?: string;
  channel?: string;
  collection?: string;
  durationSec?: number;
  favIconUrl?: string;
}

/** What the content script and the page learn about a video after it was added. */
export type QueueItemUpdate = Partial<
  Pick<QueueItem, 'title' | 'channel' | 'durationSec' | 'favIconUrl' | 'playerOrigins'>
>;

export interface AddResult {
  item: QueueItem;
  /** `false` when the video was already in the queue — the existing item is returned. */
  created: boolean;
}

export class QueueRepository {
  constructor(
    private readonly db: TabFlowDB,
    private readonly clock: Clock = systemClock,
  ) {}

  /** Live items with the given status sorted by priority (`order`). */
  async list(status: QueueStatus = 'queued'): Promise<QueueItem[]> {
    const items = await this.db.queue.where('status').equals(status).toArray();
    return liveOnly(items).sort(byOrder);
  }

  async get(id: Id): Promise<QueueItem | undefined> {
    const item = await this.db.queue.get(id);
    return item && isLive(item) ? item : undefined;
  }

  /**
   * Adds a video to the end of the queue (or to the top with `position: 'top'`).
   * A video already in the queue — same YouTube id or the same URL without `#anchor` and position
   * (`&t=95s`) — is not added twice.
   */
  async add(input: NewQueueItem, position: 'top' | 'end' = 'end'): Promise<AddResult> {
    return this.db.transaction('rw', this.db.queue, async () => {
      const existing = await this.findDuplicate(input);
      if (existing) return { item: existing, created: false };

      const queued = await this.list('queued');
      const now = this.clock();
      const item: QueueItem = {
        id: newId(),
        url: input.url,
        title: input.title,
        site: input.site,
        videoId: input.videoId,
        channel: input.channel,
        collection: input.collection,
        durationSec: input.durationSec,
        favIconUrl: input.favIconUrl,
        positionSec: 0,
        status: 'queued',
        order:
          position === 'top' ? orderBetween(undefined, queued[0]?.order) : orderAfterLast(queued),
        createdAt: now,
        updatedAt: now,
      };
      await this.db.queue.add(item);
      return { item, created: true };
    });
  }

  /** Sets a new priority position (see `orderBetween`). */
  async move(id: Id, order: number): Promise<void> {
    await this.requireLive(id);
    await this.db.queue.update(id, { order, updatedAt: this.clock() });
  }

  /** Puts a queued video at `index` (0 — top priority), as drag & drop does. */
  async place(id: Id, index: number): Promise<void> {
    await this.db.transaction('rw', this.db.queue, async () => {
      await this.requireLive(id);
      const now = this.clock();
      const placement = placeAt(await this.list('queued'), id, index);
      if ('order' in placement) {
        await this.db.queue.update(id, { order: placement.order, updatedAt: now });
        return;
      }
      await this.db.queue.update(id, { updatedAt: now });
      await this.db.queue.bulkUpdate(
        placement.reorder.map((key, i) => ({ key, changes: { order: (i + 1) * ORDER_STEP } })),
      );
    });
  }

  async update(id: Id, changes: QueueItemUpdate): Promise<void> {
    await this.requireLive(id);
    await this.db.queue.update(id, { ...changes, updatedAt: this.clock() });
  }

  /** The live video with the same key (see `videoKey`): another URL of it counts as the same. */
  async findByUrl(url: string): Promise<QueueItem | undefined> {
    const key = videoKey(url);
    const items = await this.db.queue.toArray();
    return items.find((item) => isLive(item) && videoKey(item.url) === key);
  }

  async updateProgress(id: Id, positionSec: number, durationSec?: number): Promise<void> {
    await this.requireLive(id);
    await this.db.queue.update(id, {
      positionSec: Math.max(0, positionSec),
      ...(durationSec !== undefined && { durationSec }),
      updatedAt: this.clock(),
    });
  }

  async markWatched(id: Id): Promise<void> {
    await this.requireLive(id);
    const now = this.clock();
    await this.db.queue.update(id, { status: 'watched', watchedAt: now, updatedAt: now });
  }

  /** Returns a watched video to the end of the queue. */
  async markUnwatched(id: Id): Promise<void> {
    await this.db.transaction('rw', this.db.queue, async () => {
      await this.requireLive(id);
      await this.db.queue.update(id, {
        status: 'queued',
        watchedAt: undefined,
        order: orderAfterLast(await this.list('queued')),
        updatedAt: this.clock(),
      });
    });
  }

  /** «Оставить» in «Давно не открывали». Not a change of the video: `updatedAt` stays. */
  async markReviewed(id: Id): Promise<void> {
    await this.requireLive(id);
    await this.db.queue.update(id, { reviewedAt: this.clock() });
  }

  async remove(id: Id): Promise<void> {
    await this.requireLive(id);
    await this.db.queue.update(id, { deletedAt: this.clock() });
  }

  async restore(id: Id): Promise<void> {
    const item = await this.db.queue.get(id);
    if (!item || item.deletedAt === undefined)
      throw new RecordNotFoundError('Deleted queue item', id);
    await this.db.queue.update(id, { deletedAt: undefined, updatedAt: this.clock() });
  }

  private async findDuplicate(input: NewQueueItem): Promise<QueueItem | undefined> {
    if (input.videoId) {
      const byVideo = await this.db.queue.where('videoId').equals(input.videoId).toArray();
      const live = byVideo.find(isLive);
      if (live) return live;
    }
    return this.findByUrl(input.url);
  }

  private async requireLive(id: Id): Promise<QueueItem> {
    const item = await this.get(id);
    if (!item) throw new RecordNotFoundError('Queue item', id);
    return item;
  }
}
