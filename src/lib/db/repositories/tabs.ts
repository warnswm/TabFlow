import { Dexie } from 'dexie';
import type { TabFlowDB } from '../db';
import type { Id, SavedTab, Timestamp } from '../models';
import { ORDER_STEP, orderAfterLast, orderBetween } from '../order';
import { type Clock, isLive, liveOnly, newId, RecordNotFoundError, systemClock } from './common';
import { GroupRepository } from './groups';

export interface NewTab {
  url: string;
  title: string;
  favIconUrl?: string;
  pinned?: boolean;
  chromeTabId?: number;
}

export type TabPatch = Partial<
  Pick<SavedTab, 'url' | 'title' | 'favIconUrl' | 'pinned' | 'chromeTabId'>
>;

export class TabRepository {
  constructor(
    private readonly db: TabFlowDB,
    private readonly clock: Clock = systemClock,
  ) {}

  /** Live tabs of a group sorted by `order`. */
  async listByGroup(groupId: Id): Promise<SavedTab[]> {
    const tabs = await this.db.tabs
      .where('[groupId+order]')
      .between([groupId, Dexie.minKey], [groupId, Dexie.maxKey])
      .toArray();
    return liveOnly(tabs);
  }

  /** All live tabs, any group — for the overview. */
  async listAll(): Promise<SavedTab[]> {
    return liveOnly(await this.db.tabs.toArray());
  }

  async get(id: Id): Promise<SavedTab | undefined> {
    const tab = await this.db.tabs.get(id);
    return tab && isLive(tab) ? tab : undefined;
  }

  /** Live tabs with exactly this URL — for duplicate checks. */
  async findByUrl(url: string): Promise<SavedTab[]> {
    return liveOnly(await this.db.tabs.where('url').equals(url).toArray());
  }

  async findByChromeTabId(chromeTabId: number): Promise<SavedTab | undefined> {
    const tabs = await this.db.tabs.where('chromeTabId').equals(chromeTabId).toArray();
    return tabs.find(isLive);
  }

  /** Appends tabs to the end of a group, keeping their order. One transaction for all of them. */
  async addMany(groupId: Id, inputs: readonly NewTab[]): Promise<SavedTab[]> {
    return this.db.transaction('rw', this.db.groups, this.db.tabs, async () => {
      const group = await this.db.groups.get(groupId);
      if (!group || !isLive(group)) throw new RecordNotFoundError('Group', groupId);

      const now = this.clock();
      let order = orderAfterLast(await this.listByGroup(groupId));
      const tabs = inputs.map((input): SavedTab => {
        const tab: SavedTab = {
          id: newId(),
          groupId,
          url: input.url,
          title: input.title,
          favIconUrl: input.favIconUrl,
          pinned: input.pinned ?? false,
          chromeTabId: input.chromeTabId,
          order,
          createdAt: now,
          updatedAt: now,
        };
        order = orderBetween(order, undefined);
        return tab;
      });
      await this.db.tabs.bulkAdd(tabs);
      return tabs;
    });
  }

  async update(id: Id, patch: TabPatch): Promise<void> {
    await this.requireLive(id);
    await this.db.tabs.update(id, { ...patch, updatedAt: this.clock() });
  }

  /** Moves the tab to another group (or another position); appends to the end by default. */
  async move(id: Id, groupId: Id, order?: number): Promise<void> {
    await this.db.transaction('rw', this.db.groups, this.db.tabs, async () => {
      await this.requireLive(id);
      const group = await this.db.groups.get(groupId);
      if (!group || !isLive(group)) throw new RecordNotFoundError('Group', groupId);

      await this.db.tabs.update(id, {
        groupId,
        order: order ?? orderAfterLast(await this.listByGroup(groupId)),
        updatedAt: this.clock(),
      });
    });
  }

  /** Rewrites `order` so that the group's tabs follow `ids` (e.g. the order on the tab strip). */
  async reorder(ids: readonly Id[]): Promise<void> {
    const now = this.clock();
    await this.db.tabs.bulkUpdate(
      ids.map((id, i) => ({ key: id, changes: { order: (i + 1) * ORDER_STEP, updatedAt: now } })),
    );
  }

  /**
   * Removes the tab for good, bypassing the trash. Only for tabs that are still open in Chrome
   * and simply left a mirrored group, so nothing is lost.
   */
  async forget(id: Id): Promise<void> {
    await this.db.tabs.delete(id);
  }

  /**
   * Brings back the group's tabs deleted at or after `since`. When a group is closed in Chrome,
   * its tabs disappear one by one before the group does; they are kept with the group.
   */
  async restoreDeletedSince(groupId: Id, since: Timestamp): Promise<number> {
    return this.db.tabs
      .where('groupId')
      .equals(groupId)
      .filter((tab) => tab.deletedAt !== undefined && tab.deletedAt >= since)
      .modify({ deletedAt: undefined, chromeTabId: undefined, updatedAt: this.clock() });
  }

  async remove(id: Id): Promise<void> {
    await this.requireLive(id);
    await this.db.tabs.update(id, { deletedAt: this.clock() });
  }

  /**
   * Restores the tab to the end of its group. If the group is in the trash,
   * the group is restored too (without its other deleted tabs).
   */
  async restore(id: Id): Promise<void> {
    await this.db.transaction('rw', this.db.spaces, this.db.groups, this.db.tabs, async () => {
      const tab = await this.db.tabs.get(id);
      if (!tab || tab.deletedAt === undefined) throw new RecordNotFoundError('Deleted tab', id);

      const group = await this.db.groups.get(tab.groupId);
      if (!group) throw new RecordNotFoundError('Group', tab.groupId);
      if (!isLive(group)) {
        await new GroupRepository(this.db, this.clock).restore(group.id);
      }

      await this.db.tabs.update(id, {
        deletedAt: undefined,
        chromeTabId: undefined,
        order: orderAfterLast(await this.listByGroup(tab.groupId)),
        updatedAt: this.clock(),
      });
    });
  }

  private async requireLive(id: Id): Promise<SavedTab> {
    const tab = await this.get(id);
    if (!tab) throw new RecordNotFoundError('Tab', id);
    return tab;
  }
}
