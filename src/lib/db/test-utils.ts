import { afterEach } from 'vitest';
import { createRepositories, type Repositories, TabFlowDB } from './index';

export interface TestContext extends Repositories {
  db: TabFlowDB;
  /** Current fake time in ms; tests move it forward. */
  now: { value: number };
}

const opened: TabFlowDB[] = [];

afterEach(async () => {
  await Promise.all(opened.splice(0).map((db) => db.delete()));
});

/** A fresh, isolated database with a controllable clock. */
export function setupTestDb(): TestContext {
  const db = new TabFlowDB(`tabflow-test-${crypto.randomUUID()}`);
  opened.push(db);
  const now = { value: Date.UTC(2026, 9, 16) };
  return { db, now, ...createRepositories(db, () => now.value) };
}

export const DAY_MS = 24 * 60 * 60 * 1000;
