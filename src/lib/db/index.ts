import { TabFlowDB } from './db';
import { type Clock, systemClock } from './repositories/common';
import { GroupRepository } from './repositories/groups';
import { QueueRepository } from './repositories/queue';
import { SpaceRepository } from './repositories/spaces';
import { TabRepository } from './repositories/tabs';
import { TrashRepository } from './repositories/trash';

export * from './models';
export { TabFlowDB } from './db';
export { RecordNotFoundError, systemClock, type Clock } from './repositories/common';
export { DEFAULT_SPACE_NAME } from './repositories/spaces';
export { TRASH_RETENTION_MS } from './repositories/trash';
export { orderBetween } from './order';

export interface Repositories {
  spaces: SpaceRepository;
  groups: GroupRepository;
  tabs: TabRepository;
  queue: QueueRepository;
  trash: TrashRepository;
}

export function createRepositories(db: TabFlowDB, clock: Clock = systemClock): Repositories {
  return {
    spaces: new SpaceRepository(db, clock),
    groups: new GroupRepository(db, clock),
    tabs: new TabRepository(db, clock),
    queue: new QueueRepository(db, clock),
    trash: new TrashRepository(db, clock),
  };
}

/** The app database. Dexie opens it lazily on the first query. */
export const db = new TabFlowDB();
export const repositories = createRepositories(db);
