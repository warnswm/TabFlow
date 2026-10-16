import type { TabFlowDB } from '../db';
import type { QueueItem, SavedTab, Space, TabGroup, Timestamp } from '../models';
import { type Clock, systemClock } from './common';

/** Deleted records are kept for 30 days, then removed for good. */
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface TrashContents {
  spaces: Space[];
  groups: TabGroup[];
  tabs: SavedTab[];
  queue: QueueItem[];
}

export interface PurgeResult {
  spaces: number;
  groups: number;
  tabs: number;
  queue: number;
}

const newestFirst = (a: { deletedAt?: Timestamp }, b: { deletedAt?: Timestamp }) =>
  (b.deletedAt ?? 0) - (a.deletedAt ?? 0);

export class TrashRepository {
  constructor(
    private readonly db: TabFlowDB,
    private readonly clock: Clock = systemClock,
  ) {}

  /** Everything in the trash, newest first. Live records have no `deletedAt`, so they are not in that index. */
  async list(): Promise<TrashContents> {
    const [spaces, groups, tabs, queue] = await Promise.all([
      this.db.spaces.where('deletedAt').above(0).toArray(),
      this.db.groups.where('deletedAt').above(0).toArray(),
      this.db.tabs.where('deletedAt').above(0).toArray(),
      this.db.queue.where('deletedAt').above(0).toArray(),
    ]);
    return {
      spaces: spaces.sort(newestFirst),
      groups: groups.sort(newestFirst),
      tabs: tabs.sort(newestFirst),
      queue: queue.sort(newestFirst),
    };
  }

  /** Removes for good everything deleted more than 30 days ago. */
  async purgeExpired(): Promise<PurgeResult> {
    const cutoff = this.clock() - TRASH_RETENTION_MS;
    return this.db.transaction(
      'rw',
      [this.db.spaces, this.db.groups, this.db.tabs, this.db.queue],
      async () => ({
        spaces: await this.db.spaces.where('deletedAt').below(cutoff).delete(),
        groups: await this.db.groups.where('deletedAt').below(cutoff).delete(),
        tabs: await this.db.tabs.where('deletedAt').below(cutoff).delete(),
        queue: await this.db.queue.where('deletedAt').below(cutoff).delete(),
      }),
    );
  }
}
