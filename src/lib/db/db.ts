import { Dexie, type EntityTable } from 'dexie';
import type { QueueItem, SavedTab, Space, TabGroup } from './models';

export const DB_NAME = 'tabflow';

/**
 * IndexedDB schema. Only indexed fields are listed; other fields are stored as is.
 * Changing an index means adding a new `this.version(N + 1)` block — never edit an old one.
 */
export class TabFlowDB extends Dexie {
  spaces!: EntityTable<Space, 'id'>;
  groups!: EntityTable<TabGroup, 'id'>;
  tabs!: EntityTable<SavedTab, 'id'>;
  queue!: EntityTable<QueueItem, 'id'>;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(1).stores({
      spaces: 'id, order, deletedAt',
      groups: 'id, spaceId, [spaceId+order], chromeGroupId, deletedAt',
      tabs: 'id, groupId, [groupId+order], url, chromeTabId, deletedAt',
      queue: 'id, order, status, url, videoId, deletedAt',
    });
  }
}
