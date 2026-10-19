import { INBOX_NAMES, words } from '../../i18n/words';
import type { TabFlowDB } from '../db';
import type { Id, Space } from '../models';
import { ORDER_STEP, orderAfterLast, orderBetween, placeAt } from '../order';
import { type Clock, isLive, liveOnly, newId, RecordNotFoundError, systemClock } from './common';

/** Name of the default space in Russian (the tests' language); English — «Inbox» (`i18n/words`). */
export const DEFAULT_SPACE_NAME = 'Входящие';

export class SpaceRepository {
  constructor(
    private readonly db: TabFlowDB,
    private readonly clock: Clock = systemClock,
  ) {}

  /** Live spaces sorted by `order`. */
  async list(): Promise<Space[]> {
    return liveOnly(await this.db.spaces.orderBy('order').toArray());
  }

  async get(id: Id): Promise<Space | undefined> {
    const space = await this.db.spaces.get(id);
    return space && isLive(space) ? space : undefined;
  }

  async create(name: string): Promise<Space> {
    return this.db.transaction('rw', this.db.spaces, async () => {
      const now = this.clock();
      const space: Space = {
        id: newId(),
        name: name.trim(),
        order: orderAfterLast(await this.list()),
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      };
      await this.db.spaces.add(space);
      return space;
    });
  }

  /** Returns the default space («Входящие»), creating it first if needed. */
  async ensureDefault(): Promise<Space> {
    return this.db.transaction('rw', this.db.spaces, async () => {
      const spaces = await this.list();
      const existing = spaces.find((space) => space.isDefault);
      if (existing) return existing;

      const now = this.clock();
      const space: Space = {
        id: newId(),
        name: words().inbox,
        order: orderBetween(undefined, spaces[0]?.order),
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      };
      await this.db.spaces.add(space);
      return space;
    });
  }

  /**
   * The default space carries the name of the interface language («Входящие» / «Inbox») until it
   * is renamed: after the language changes, the stored name follows it.
   */
  async followLanguage(): Promise<void> {
    await this.db.transaction('rw', this.db.spaces, async () => {
      const inbox = (await this.list()).find((space) => space.isDefault);
      const name = words().inbox;
      if (!inbox || inbox.name === name || !INBOX_NAMES.some((known) => known === inbox.name)) {
        return;
      }
      await this.db.spaces.update(inbox.id, { name });
    });
  }

  async rename(id: Id, name: string): Promise<void> {
    await this.requireLive(id);
    await this.db.spaces.update(id, { name: name.trim(), updatedAt: this.clock() });
  }

  async move(id: Id, order: number): Promise<void> {
    await this.requireLive(id);
    await this.db.spaces.update(id, { order, updatedAt: this.clock() });
  }

  /**
   * Puts the space at `index` among the other spaces (drag & drop in the sidebar).
   * «Входящие» always stays first and is not counted.
   */
  async place(id: Id, index: number): Promise<void> {
    await this.db.transaction('rw', this.db.spaces, async () => {
      const space = await this.requireLive(id);
      if (space.isDefault) throw new Error('The default space stays first');

      const now = this.clock();
      const others = (await this.list()).filter((item) => !item.isDefault);
      const placement = placeAt(others, id, index);
      if ('order' in placement) {
        await this.db.spaces.update(id, { order: placement.order, updatedAt: now });
        return;
      }
      await this.db.spaces.bulkUpdate(
        placement.reorder.map((key, i) => ({ key, changes: { order: (i + 1) * ORDER_STEP } })),
      );
      await this.db.spaces.update(id, { updatedAt: now });
    });
  }

  /** Moves the space, its groups and their tabs to the trash with one shared `deletedAt`. */
  async remove(id: Id): Promise<void> {
    await this.db.transaction('rw', this.db.spaces, this.db.groups, this.db.tabs, async () => {
      const space = await this.requireLive(id);
      if (space.isDefault) throw new Error('The default space cannot be deleted');

      const deletedAt = this.clock();
      const groups = liveOnly(await this.db.groups.where('spaceId').equals(id).toArray());
      const groupIds = groups.map((group) => group.id);

      await this.db.spaces.update(id, { deletedAt });
      await this.db.groups.bulkUpdate(
        groups.map(({ id }) => ({ key: id, changes: { deletedAt } })),
      );
      await this.db.tabs.where('groupId').anyOf(groupIds).filter(isLive).modify({ deletedAt });
    });
  }

  /** Restores the space with everything that was deleted together with it. */
  async restore(id: Id): Promise<void> {
    await this.db.transaction('rw', this.db.spaces, this.db.groups, this.db.tabs, async () => {
      const space = await this.db.spaces.get(id);
      if (!space || space.deletedAt === undefined)
        throw new RecordNotFoundError('Deleted space', id);

      const { deletedAt } = space;
      const groups = await this.db.groups
        .where('spaceId')
        .equals(id)
        .filter((group) => group.deletedAt === deletedAt)
        .toArray();
      const groupIds = groups.map((group) => group.id);

      await this.db.spaces.update(id, { deletedAt: undefined, order: await this.nextOrder() });
      await this.db.groups.where('id').anyOf(groupIds).modify({ deletedAt: undefined });
      await this.db.tabs
        .where('groupId')
        .anyOf(groupIds)
        .filter((tab) => tab.deletedAt === deletedAt)
        .modify({ deletedAt: undefined });
    });
  }

  private async nextOrder(): Promise<number> {
    return orderAfterLast(await this.list());
  }

  private async requireLive(id: Id): Promise<Space> {
    const space = await this.get(id);
    if (!space) throw new RecordNotFoundError('Space', id);
    return space;
  }
}
