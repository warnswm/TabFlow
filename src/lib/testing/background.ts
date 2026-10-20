import { type Background, createBackground, type MessageOrigin } from '../background';
import type { BackgroundContext } from '../background/context';
import { setupTestDb, type TestContext } from '../db/test-utils';
import type { Command, CommandResponse, VideoReport } from '../messages';
import type { BackgroundSettings } from '../settings';
import type { Language } from '../i18n';
import type { BadgeMode } from '../summary';
import type { AutoSleepSettings } from '../tidy/auto-sleep';
import { FakeExtensionUi } from './fake-extension-ui';
import { FakeTabsApi } from './fake-tabs-api';

export interface BackgroundTestContext extends TestContext {
  api: FakeTabsApi;
  /** What the badge and the context menu show. */
  ui: FakeExtensionUi;
  /**
   * Settings the background reads; change `mode`, then `bg.refreshUi()` (`lang` —
   * `bg.followLanguage()`). `sleep` — autosleep, read on every run.
   */
  settings: BackgroundSettings & { mode: BadgeMode; lang: Language; sleep: AutoSleepSettings };
  ctx: BackgroundContext;
  bg: Background;
  /** Sends a command and waits until the events it caused are handled. */
  command(command: Command): Promise<CommandResponse>;
  /** The content script of the page in `tabId` reports its video. */
  report(tabId: number, report: VideoReport): Promise<CommandResponse>;
  /** Waits until queued events are handled. */
  settle(): Promise<void>;
  /** Simulates a browser restart: new ids in Chrome, a fresh service worker that starts up. */
  restartBrowser(): Promise<void>;
  /** Simulates reloading the extension: Chrome closes its pages, a fresh service worker starts. */
  reloadExtension(): Promise<void>;
  /** A fresh service worker starts in the same browser session (after `api.sleepWorker()`). */
  wakeWorker(): Promise<void>;
}

/** A fake browser wired to a background with a fresh test database. */
export function setupBackground({ supportsGroups = true } = {}): BackgroundTestContext {
  const test = setupTestDb();
  const api = new FakeTabsApi(supportsGroups);
  api.clock = () => test.now.value;
  const ui = new FakeExtensionUi();
  const settings = {
    mode: 'today' as BadgeMode,
    lang: 'ru' as Language,
    sleep: { minutes: 30, sites: [] } as AutoSleepSettings,
    badgeMode: () => Promise.resolve(settings.mode),
    language: () => Promise.resolve(settings.lang),
    autoSleep: () => Promise.resolve(settings.sleep),
  };
  const ctx: BackgroundContext = {
    api,
    ui,
    db: test.db,
    repos: test,
    clock: () => test.now.value,
    settings,
  };

  const context: BackgroundTestContext = {
    ...test,
    api,
    ui,
    settings,
    ctx,
    bg: wire(),
    async command(command) {
      const response = await context.bg.handleMessage(command);
      await context.bg.idle();
      return response;
    },
    async report(tabId, report) {
      const origin: MessageOrigin = { kind: 'content', tabId };
      const response = await context.bg.handleMessage({ type: 'videoProgress', ...report }, origin);
      await context.bg.idle();
      return response;
    },
    settle: () => context.bg.idle(),
    async restartBrowser() {
      api.restart();
      context.bg = wire();
      await context.bg.start();
    },
    async reloadExtension() {
      api.reloadExtension();
      context.bg = wire();
      await context.bg.start();
    },
    async wakeWorker() {
      api.sleepWorker();
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
