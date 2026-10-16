import type { Id, Timestamp } from '../models';

/** Source of the current time; tests pass a fixed clock. */
export type Clock = () => Timestamp;

export const systemClock: Clock = () => Date.now();

export function newId(): Id {
  return crypto.randomUUID();
}

export function isLive<T extends { deletedAt?: Timestamp }>(record: T): boolean {
  return record.deletedAt === undefined;
}

export function liveOnly<T extends { deletedAt?: Timestamp }>(records: T[]): T[] {
  return records.filter(isLive);
}

export function byOrder<T extends { order: number }>(a: T, b: T): number {
  return a.order - b.order;
}

/**
 * Thrown when an operation refers to a record that does not exist or is in the trash.
 * Not named `NotFoundError`: Dexie replaces errors with that name by its own class inside transactions.
 */
export class RecordNotFoundError extends Error {
  constructor(entity: string, id: Id) {
    super(`${entity} ${id} not found`);
    this.name = 'RecordNotFoundError';
  }
}
