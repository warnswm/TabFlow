import { type Background, createBackground } from '../background';
import type { BackgroundContext } from '../background/context';
import { setupTestDb, type TestContext } from '../db/test-utils';
import type { Command, CommandResponse } from '../messages';
import { FakeTabsApi } from './fake-tabs-api';

export interface BackgroundTestContext extends TestContext {
  api: FakeTabsApi;
  ctx: BackgroundContext;
  bg: Background;
  /** Sends a command and waits until the events it caused are handled. */
  command(command: Command): Promise<CommandResponse>;
  /** Waits until queued events are handled. */
  settle(): Promise<void>;
  /** Simulates a browser restart: new ids in Chrome, a fresh service worker that starts up. */
  restartBrowser(): Promise<void>;
}

/** A fake browser wired to a background with a fresh test database. */
export function setupBackground({ supportsGroups = true } = {}): BackgroundTestContext {
  const test = setupTestDb();
  const api = new FakeTabsApi(supportsGroups);
  const ctx: BackgroundContext = { api, db: test.db, repos: test, clock: () => test.now.value };

  const context: BackgroundTestContext = {
    ...test,
    api,
    ctx,
    bg: wire(),
    async command(command) {
      const response = await context.bg.handleMessage(command);
      await context.bg.idle();
      return response;
    },
    settle: () => context.bg.idle(),
    async restartBrowser() {
      api.restart();
      context.bg = wire();
      await context.bg.start();
    },
  };

  function wire(): Background {
    const bg = createBackground(ctx);
    api.onEvent((event) => void bg.handleEvent(event));
    return bg;
  }

  return context;
}

/** The only item of a list; fails the test if there are none or several. */
export function single<T>(items: readonly T[]): T {
  const [item, ...rest] = items;
  if (item === undefined || rest.length > 0) {
    throw new Error(`Expected exactly one item, got ${items.length}`);
  }
  return item;
}

/** Unwraps a successful response; fails the test otherwise. */
export function expectOk(response: CommandResponse) {
  if (!response.ok) throw new Error(`Command failed: ${response.code} ${response.message}`);
  return response.result;
}
