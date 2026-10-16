import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { APP_PAGE_PATH, getAppPageUrl, openAppPage } from './browser-api';

describe('browser-api', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('builds the main page URL inside the extension', () => {
    expect(getAppPageUrl().endsWith(APP_PAGE_PATH)).toBe(true);
  });

  it('opens the main page in a new tab', async () => {
    await openAppPage();

    const tabs = await browser.tabs.query({});
    expect(tabs.map((tab) => tab.url)).toContain(getAppPageUrl());
  });
});
