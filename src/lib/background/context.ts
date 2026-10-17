import type { ExtensionUi, TabsApi } from '../browser-api';
import type { Clock, Repositories, TabFlowDB } from '../db';
import type { BackgroundSettings } from '../settings';

/** Everything background logic works with; tests pass fakes for `api` and `ui` and a test database. */
export interface BackgroundContext {
  api: TabsApi;
  ui: ExtensionUi;
  db: TabFlowDB;
  repos: Repositories;
  clock: Clock;
  settings: BackgroundSettings;
}
