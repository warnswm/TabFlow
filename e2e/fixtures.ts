/**
 * A fresh Chromium profile with the built extension (`.output/chrome-mv3`) for every test, the id
 * of the extension and helpers for its pages. Chromium runs in Russian, so «Как в Chrome» — the
 * default language setting — shows the interface in Russian.
 */
import { type BrowserContext, chromium, type Page, test as base } from '@playwright/test';
import path from 'node:path';
import type { browser } from 'wxt/browser';
import { SITE_PORT } from '../playwright.config';

/** The `chrome.*` API as extension pages see it (typed as WXT's `browser`). */
export type Chrome = typeof browser;

export const SITE = `http://127.0.0.1:${SITE_PORT}`;
const EXTENSION = path.resolve(import.meta.dirname, '..', '.output', 'chrome-mv3');

interface Fixtures {
  context: BrowserContext;
  extensionId: string;
  /** Opens a page of the extension (`app.html#/settings`) in a new tab. */
  openPage: (pathAndHash: string) => Promise<Page>;
}

export const test = base.extend<Fixtures>({
  context: async ({ headless }, provide) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless,
      locale: 'ru-RU',
      args: [
        '--lang=ru',
        `--disable-extensions-except=${EXTENSION}`,
        `--load-extension=${EXTENSION}`,
      ],
    });
    await provide(context);
    await context.close();
  },
  extensionId: async ({ context }, provide) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await provide(new URL(worker.url()).host);
  },
  openPage: async ({ context, extensionId }, provide) => {
    await provide(async (pathAndHash) => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/${pathAndHash}`);
      return page;
    });
  },
});

export const expect = test.expect;

/** Opens site pages as tabs of the window of `page` (an extension page), waits until loaded. */
export async function openSiteTabs(page: Page, paths: readonly string[]): Promise<void> {
  await page.evaluate(
    async (urls) => {
      const chrome = (globalThis as unknown as { chrome: Chrome }).chrome;
      const windowId = (await chrome.tabs.getCurrent())?.windowId;
      const ids = await Promise.all(
        urls.map(async (url) => (await chrome.tabs.create({ url, windowId, active: false })).id),
      );
      // Until every tab has loaded its page: «Свернуть всё» saves committed addresses only.
      for (let i = 0; i < 100; i++) {
        const tabs = await Promise.all(ids.map((id) => chrome.tabs.get(id ?? -1)));
        if (tabs.every((tab) => tab.status === 'complete' && tab.url?.startsWith('http'))) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    },
    paths.map((p) => `${SITE}${p}`),
  );
}

/** Addresses of the open tabs of the browser (any window). */
export async function tabUrls(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const chrome = (globalThis as unknown as { chrome: Chrome }).chrome;
    return (await chrome.tabs.query({})).map((tab) => tab.url ?? tab.pendingUrl ?? '');
  });
}

/** Sends a command to the background as the pages do. */
export async function command(page: Page, message: Record<string, unknown>) {
  return page.evaluate(async (body) => {
    const chrome = (globalThis as unknown as { chrome: Chrome }).chrome;
    return chrome.runtime.sendMessage(body);
  }, message);
}

/** Text of the badge on the TabFlow icon. */
export async function badgeText(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const chrome = (globalThis as unknown as { chrome: Chrome }).chrome;
    return chrome.action.getBadgeText({});
  });
}
