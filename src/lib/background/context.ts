import type { TabsApi } from '../browser-api';
import type { Clock, Repositories, TabFlowDB } from '../db';

/** Everything background logic works with; tests pass a fake `api` and a test database. */
export interface BackgroundContext {
  api: TabsApi;
  db: TabFlowDB;
  repos: Repositories;
  clock: Clock;
}
