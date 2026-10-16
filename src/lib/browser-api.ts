/**
 * The only module that talks to the extension API (`chrome.*` / `browser.*`).
 * UI and background code call these functions instead of using `browser` directly,
 * so that Edge/Firefox support and Chrome-only APIs stay in one place.
 */
import { browser } from 'wxt/browser';

/** Path of the main TabFlow page inside the extension bundle. */
export const APP_PAGE_PATH = '/app.html';

export function getAppPageUrl(): string {
  return browser.runtime.getURL(APP_PAGE_PATH);
}

/** Opens the main TabFlow page in a new tab. */
export async function openAppPage(): Promise<void> {
  await browser.tabs.create({ url: getAppPageUrl() });
}

/** Registers a callback for the first install and updates of the extension. */
export function onInstalled(callback: (reason: string) => void): void {
  browser.runtime.onInstalled.addListener(({ reason }) => callback(reason));
}
