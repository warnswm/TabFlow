import { Dexie } from 'dexie';
import type { TabFlowDB } from '../db';
import type { GroupColor, GroupState, Id, TabGroup } from '../models';
import { byFavoriteThenOrder, indexInBlock, ORDER_STEP, orderAfterLast, placeAt } from '../order';
import { type Clock, isLive, liveOnly, newId, RecordNotFoundError, systemClock } from './common';
import { SpaceRepository } from './spaces';

export interface NewGroup {
  spaceId: Id;
  title: string;
  color: GroupColor;
  state?: GroupState;
  chromeGroupId?: number;
  windowId?: number;
}

export type GroupPatch = Partial<
  Pick<
    TabGroup,
    'title' | 'color' | 'note' | 'chromeGroupId' | 'windowId' | 'keepAwake' | 'autoSlept' | 'locked'
  >
>;

export interface ChromeLink {
  chromeGroupId: number;
  windowId: number;
  tabs: readonly { id: Id; chromeTabId: number }[];
}

export class GroupRepository {
  constructor(
    private readonly db: TabFlowDB,
    private readonly clock: Clock = systemClock,
  ) {}

  /** Live groups of a space: «В избранном» first, then by `order` (as the tiles stand). */
  async listBySpace(spaceId: Id): Promise<TabGroup[]> {
    const groups = await this.db.groups
      .where('[spaceId+order]')
      .between([spaceId, Dexie.minKey], [spaceId, Dexie.maxKey])
      .toArray();
    return liveOnly(groups).sort(byFavoriteThenOrder);
  }

  /** All live groups (any space, any state). */
  async listAll(): Promise<TabGroup[]> {
    return liveOnly(await this.db.groups.toArray());
  }

  async get(id: Id): Promise<TabGroup | undefined> {
    const group = await this.db.groups.get(id);
    return group && isLive(group) ? group : undefined;
  }

  /** The live group mirroring a native Chrome group. */
  async findByChromeGroupId(chromeGroupId: number): Promise<TabGroup | undefined> {
    const groups = await this.db.groups.where('chromeGroupId').equals(chromeGroupId).toArray();
    return groups.find(isLive);
  }

  async create(input: NewGroup): Promise<TabGroup> {
    return this.db.transaction('rw', this.db.spaces, this.db.groups, async () => {
      const space = await this.db.spaces.get(input.spaceId);
      if (!space || !isLive(space)) throw new RecordNotFoundError('Space', input.spaceId);

      const now = this.clock();
      const group: TabGroup = {
        id: newId(),
        spaceId: input.spaceId,
        title: input.title.trim(),
        color: input.color,
        state: input.state ?? 'active',
        stateChangedAt: now,
        order: orderAfterLast(await this.listBySpace(input.spaceId)),
        chromeGroupId: input.chromeGroupId,
        windowId: input.windowId,
        createdAt: now,
        updatedAt: now,
      };
      await this.db.groups.add(group);
      return group;
    });
  }

  async update(id: Id, patch: GroupPatch): Promise<void> {
    await this.requireLive(id);
    await this.db.groups.update(id, {
      ...patch,
      ...(patch.title !== undefined && { title: patch.title.trim() }),
      updatedAt: this.clock(),
    });
  }

  /**
   * Changes the lifecycle state. A stowed group is no longer on the tab strip,
   * so its links to Chrome (group, window and tab ids) are cleared. «Уснула сама» is forgotten.
   */
  async setState(id: Id, state: GroupState): Promise<void> {
    await this.db.transaction('rw', this.db.groups, this.db.tabs, async () => {
      await this.requireLive(id);
      const now = this.clock();
      if (state === 'stowed') {
        await this.db.groups.update(id, {
          state,
          stateChangedAt: now,
          chromeGroupId: undefined,
          windowId: undefined,
          autoSlept: undefined,
          updatedAt: now,
        });
        await this.db.tabs
          .where('groupId')
          .equals(id)
          .modify({ chromeTabId: undefined, updatedAt: now });
      } else {
        await this.db.groups.update(id, {
          state,
          stateChangedAt: now,
          autoSlept: undefined,
          updatedAt: now,
        });
      }
    });
  }

  /** Links a group that came back to the tab strip to its new native group and tabs. */
  async linkToChrome(id: Id, link: ChromeLink): Promise<void> {
    await this.db.transaction('rw', this.db.groups, this.db.tabs, async () => {
      await this.requireLive(id);
      const now = this.clock();
      await this.db.groups.update(id, {
        state: 'active',
        stateChangedAt: now,
        chromeGroupId: link.chromeGroupId,
        windowId: link.windowId,
        updatedAt: now,
      });
      await this.db.tabs.bulkUpdate(
        link.tabs.map(({ id, chromeTabId }) => ({
          key: id,
          changes: { chromeTabId, updatedAt: now },
        })),
      );
    });
  }

  /**
   * Forgets the Chrome ids of the group and its tabs but keeps the state.
   * Used at browser start: ids from the previous session may now point to other tabs.
   */
  async unlinkFromChrome(id: Id): Promise<void> {
    await this.db.transaction('rw', this.db.groups, this.db.tabs, async () => {
      await this.db.groups.update(id, { chromeGroupId: undefined, windowId: undefined });
      await this.db.tabs.where('groupId').equals(id).modify({ chromeTabId: undefined });
    });
  }

  /**
   * Removes the group and all its tabs for good, bypassing the trash.
   * Only for groups that hold nothing worth keeping (e.g. dissolved in Chrome, tabs still open).
   */
  async forget(id: Id): Promise<void> {
    await this.db.transaction('rw', this.db.groups, this.db.tabs, async () => {
      await this.db.groups.delete(id);
      await this.db.tabs.where('groupId').equals(id).delete();
    });
  }

  /** Moves the group to another space (or another position); appends to the end by default. */
  async move(id: Id, spaceId: Id, order?: number): Promise<void> {
    await this.db.transaction('rw', this.db.spaces, this.db.groups, async () => {
      const group = await this.requireLive(id);
      const space = await this.db.spaces.get(spaceId);
      if (!space || !isLive(space)) throw new RecordNotFoundError('Space', spaceId);

      if (order === undefined && group.favorite === true) {
        // A favorite goes to the end of the favorites of its new space.
        await this.placeInTransaction(group, spaceId, Number.MAX_SAFE_INTEGER);
        return;
      }
      await this.db.groups.update(id, {
        spaceId,
        order: order ?? orderAfterLast(await this.listBySpace(spaceId)),
        updatedAt: this.clock(),
      });
    });
  }

  /**
   * Puts the group at `index` among the groups of `spaceId` — its own space or another one
   * (drag & drop). Only the moved group is written, unless its neighbours leave no room for a key.
   * The group stays in its block: a favorite among the favorites, the others after them.
   */
  async place(id: Id, spaceId: Id, index: number): Promise<void> {
    await this.db.transaction('rw', this.db.spaces, this.db.groups, async () => {
      const group = await this.requireLive(id);
      const space = await this.db.spaces.get(spaceId);
      if (!space || !isLive(space)) throw new RecordNotFoundError('Space', spaceId);
      await this.placeInTransaction(group, spaceId, index);
    });
  }

  /**
   * «В избранном»: a favorite goes to the end of the favorites of its space, a group taken out of
   * them — to the start of the others. Its tiles and its place on the strip follow.
   */
  async setFavorite(id: Id, favorite: boolean): Promise<void> {
    await this.db.transaction('rw', this.db.groups, async () => {
      const group = await this.requireLive(id);
      const changed = { ...group, favorite: favorite || undefined };
      await this.db.groups.update(id, { favorite: changed.favorite });
      await this.placeInTransaction(changed, group.spaceId, favorite ? Number.MAX_SAFE_INTEGER : 0);
    });
  }

  private async placeInTransaction(group: TabGroup, spaceId: Id, index: number): Promise<void> {
    const now = this.clock();
    const list = await this.listBySpace(spaceId);
    const others = list.filter((item) => item.id !== group.id);
    const at = indexInBlock(others, group.favorite === true, index);
    // The moved group with its current flag: the list may still hold its old one.
    const placement = placeAt(
      list.map((item) => (item.id === group.id ? group : item)),
      group.id,
      at,
    );
    if ('order' in placement) {
      await this.db.groups.update(group.id, { spaceId, order: placement.order, updatedAt: now });
      return;
    }
    await this.db.groups.update(group.id, { spaceId, updatedAt: now });
    await this.db.groups.bulkUpdate(
      placement.reorder.map((key, i) => ({ key, changes: { order: (i + 1) * ORDER_STEP } })),
    );
  }

  /** «Оставить» in «Давно не открывали». Not a change of the group: `updatedAt` stays. */
  async markReviewed(id: Id): Promise<void> {
    await this.requireLive(id);
    await this.db.groups.update(id, { reviewedAt: this.clock() });
  }

  /** Moves the group and its live tabs to the trash with one shared `deletedAt`. */
  async remove(id: Id): Promise<void> {
    await this.db.transaction('rw', this.db.groups, this.db.tabs, async () => {
      await this.requireLive(id);
      const deletedAt = this.clock();
      await this.db.groups.update(id, { deletedAt });
      await this.db.tabs.where('groupId').equals(id).filter(isLive).modify({ deletedAt });
    });
  }

  /**
   * Restores the group with the tabs deleted together with it.
   * If its space is in the trash, the group goes to the default space instead.
   * The group comes back stowed: its Chrome tabs were closed in the meantime.
   */
  async restore(id: Id): Promise<void> {
    await this.db.transaction('rw', this.db.spaces, this.db.groups, this.db.tabs, async () => {
      const group = await this.db.groups.get(id);
      if (!group || group.deletedAt === undefined)
        throw new RecordNotFoundError('Deleted group', id);

      const space = await this.db.spaces.get(group.spaceId);
      const spaceId = space && isLive(space) ? space.id : await this.defaultSpaceId();
      const { deletedAt } = group;

      await this.db.groups.update(id, {
        deletedAt: undefined,
        spaceId,
        state: 'stowed',
        stateChangedAt: this.clock(),
        chromeGroupId: undefined,
        windowId: undefined,
        order: orderAfterLast(await this.listBySpace(spaceId)),
        updatedAt: this.clock(),
      });
      await this.db.tabs
        .where('groupId')
        .equals(id)
        .filter((tab) => tab.deletedAt === deletedAt)
        .modify({ deletedAt: undefined, chromeTabId: undefined });
    });
  }

  private async defaultSpaceId(): Promise<Id> {
    return (await new SpaceRepository(this.db, this.clock).ensureDefault()).id;
  }

  private async requireLive(id: Id): Promise<TabGroup> {
    const group = await this.get(id);
    if (!group) throw new RecordNotFoundError('Group', id);
    return group;
  }
}
