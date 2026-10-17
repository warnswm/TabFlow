/**
 * The only module that talks to the extension API (`chrome.*` / `browser.*`).
 * UI and background code call these functions instead of using `browser` directly,
 * so that Edge/Firefox support and Chrome-only APIs stay in one place.
 */
import { browser, type Browser } from 'wxt/browser';
import { GROUP_COLORS, type GroupColor } from './db/models';
import { cachedFaviconUrl, parsePlaceholderUrl, PLACEHOLDER_PAGE_PATH } from './placeholder';

/** Path of the main TabFlow page inside the extension bundle. */
export const APP_PAGE_PATH = '/app.html';

export function getAppPageUrl(): string {
  return browser.runtime.getURL(APP_PAGE_PATH);
}

/** Opens the main TabFlow page in a new tab. */
export async function openAppPage(): Promise<void> {
  await browser.tabs.create({ url: getAppPageUrl() });
}

/** Icon of a page from Chrome's favicon cache — served locally, no network request. */
export function faviconUrl(pageUrl: string, size = 32): string {
  return cachedFaviconUrl(new URL(browser.runtime.getURL('/')).origin, pageUrl, size);
}

// ---------------------------------------------------------------------------
// Settings (`storage.local` holds settings only; data lives in IndexedDB)
// ---------------------------------------------------------------------------

export async function readSetting(key: string): Promise<unknown> {
  return (await browser.storage.local.get(key))[key];
}

export async function writeSetting(key: string, value: unknown): Promise<void> {
  await browser.storage.local.set({ [key]: value });
}

/** Registers a callback for the first install and updates of the extension. */
export function onInstalled(callback: (reason: string) => void): void {
  browser.runtime.onInstalled.addListener(({ reason }) => callback(reason));
}

// ---------------------------------------------------------------------------
// Messages between extension pages and the background
// ---------------------------------------------------------------------------

/** Sends a message to the background and resolves with its response. */
export async function sendRuntimeMessage<R>(message: unknown): Promise<R> {
  return (await browser.runtime.sendMessage(message)) as R;
}

/**
 * Handles messages from extension pages. Messages from other extensions and web pages
 * never reach this listener (no `externally_connectable` in the manifest).
 */
export function onRuntimeMessage(handler: (message: unknown) => Promise<unknown>): void {
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id) return false;
    void handler(message).then(sendResponse);
    return true; // keeps the channel open for the async response
  });
}

// ---------------------------------------------------------------------------
// Tabs, native tab groups and windows
// ---------------------------------------------------------------------------

/** `tabGroups.TAB_GROUP_ID_NONE`: the tab is not in a group. */
export const NO_GROUP = -1;

export interface BrowserTab {
  id: number;
  windowId: number;
  index: number;
  /**
   * Committed URL, or the pending one while the first navigation is in progress; may be empty.
   * For a TabFlow placeholder — the real URL behind it (title and icon too).
   */
  url: string;
  /**
   * The tab has committed a real URL. A tab discarded before that loses its URL and becomes
   * `about:blank`, so a just opened tab must not be discarded until this is true.
   */
  committed: boolean;
  /** The page has finished loading (`status: complete`). */
  loaded: boolean;
  /** Chrome has applied the page's icon (for a placeholder — its own, not the saved one). */
  hasIcon: boolean;
  /** The tab shows a TabFlow placeholder that opens `url` when the tab is opened. */
  placeholder: boolean;
  title: string;
  favIconUrl?: string;
  pinned: boolean;
  active: boolean;
  discarded: boolean;
  /** Native group id or `NO_GROUP`. */
  groupId: number;
}

export interface BrowserGroup {
  id: number;
  windowId: number;
  title: string;
  color: GroupColor;
  collapsed: boolean;
}

export interface NewBrowserTab {
  windowId: number;
  url: string;
  active: boolean;
  /** Position in the window; appended at the end when omitted. */
  index?: number;
}

export type GroupUpdate = Partial<Pick<BrowserGroup, 'title' | 'color' | 'collapsed'>>;

/**
 * What happened in the browser. Handlers treat events as hints and re-read the current state,
 * because events arrive late and in bursts.
 */
export type TabsEvent =
  | { type: 'tabCreated'; tabId: number }
  /** URL, title, icon, group, pinned or discarded state changed, or the tab moved. */
  | { type: 'tabUpdated'; tabId: number }
  | { type: 'tabRemoved'; tabId: number; windowClosing: boolean }
  /** The tab was swapped for another one (prerendering, discarding). */
  | { type: 'tabReplaced'; addedTabId: number; removedTabId: number }
  | { type: 'groupChanged'; groupId: number }
  | { type: 'groupRemoved'; groupId: number }
  | { type: 'windowRemoved'; windowId: number };

/** Tabs, groups and windows. The background works only through this interface; tests use a fake. */
export interface TabsApi {
  /** False where `chrome.tabGroups` is missing (Firefox, older browsers): no native groups then. */
  readonly supportsGroups: boolean;
  /** The URL of the main TabFlow page, used to keep a window open and to skip own pages. */
  readonly appPageUrl: string;
  /** The URL of the placeholder page for tabs restored without loading (see `placeholder.ts`). */
  readonly placeholderPageUrl: string;

  /** The window the user works in (last focused normal window). */
  getCurrentWindowId(): Promise<number>;
  queryTabs(filter: { windowId?: number; groupId?: number }): Promise<BrowserTab[]>;
  getTab(tabId: number): Promise<BrowserTab | undefined>;
  createTab(input: NewBrowserTab): Promise<BrowserTab>;
  activateTab(tabId: number): Promise<void>;
  /**
   * Moves the tab to `index` (its final position) in `windowId` (default: its own window).
   * Like Chrome, a tab that lands outside its native group leaves the group, and a tab that lands
   * between two tabs of a group joins it.
   */
  moveTab(tabId: number, to: { index: number; windowId?: number }): Promise<void>;
  removeTabs(tabIds: readonly number[]): Promise<void>;
  /** Loads the tab's page again, in the background (also brings an unloaded tab back). */
  reloadTab(tabId: number): Promise<void>;
  /**
   * Unloads the tab from memory; it stays on the tab strip. Returns the tab (its id may change),
   * or `undefined` when Chrome refused to discard it — Chrome does not throw in that case.
   */
  discardTab(tabId: number): Promise<BrowserTab | undefined>;

  /** Puts tabs into a new native group in `windowId`; returns the group id. */
  groupTabs(tabIds: readonly number[], windowId: number): Promise<number>;
  /** Adds tabs to an existing native group. */
  addTabsToGroup(tabIds: readonly number[], groupId: number): Promise<void>;
  ungroupTabs(tabIds: readonly number[]): Promise<void>;
  queryGroups(filter: { windowId?: number }): Promise<BrowserGroup[]>;
  getGroup(groupId: number): Promise<BrowserGroup | undefined>;
  updateGroup(groupId: number, update: GroupUpdate): Promise<void>;

  /** Subscribes to browser events. Call synchronously at service worker start. */
  onEvent(listener: (event: TabsEvent) => void): void;

  /**
   * True on the first call in a browser session (also after the extension is reloaded):
   * tab and group ids saved earlier may now belong to other tabs. False when the service worker
   * merely woke up again. Backed by `storage.session`, which the browser clears on restart.
   */
  isFirstRunInSession(): Promise<boolean>;
}

const SESSION_MARKER_KEY = 'tabflow.sessionStartedAt';

function toGroupColor(color: string): GroupColor {
  return (GROUP_COLORS as readonly string[]).includes(color) ? (color as GroupColor) : 'grey';
}

function toBrowserTab(tab: Browser.tabs.Tab, placeholderPageUrl: string): BrowserTab | undefined {
  if (tab.id === undefined) return undefined;
  const raw = tab.url || tab.pendingUrl || '';
  const target = parsePlaceholderUrl(placeholderPageUrl, raw);
  return {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    url: target?.url ?? raw,
    committed: Boolean(tab.url) && !tab.pendingUrl && tab.url !== 'about:blank',
    loaded: tab.status === 'complete',
    hasIcon: Boolean(tab.favIconUrl),
    placeholder: target !== undefined,
    title: target?.title ?? tab.title ?? '',
    favIconUrl: target ? target.favIconUrl : tab.favIconUrl || undefined,
    pinned: tab.pinned,
    active: tab.active,
    discarded: tab.discarded,
    groupId: tab.groupId ?? NO_GROUP,
  };
}

function toBrowserGroup(group: Browser.tabGroups.TabGroup): BrowserGroup {
  return {
    id: group.id,
    windowId: group.windowId,
    title: group.title ?? '',
    color: toGroupColor(group.color),
    collapsed: group.collapsed,
  };
}

function compact<T>(items: readonly (T | undefined)[]): T[] {
  return items.filter((item): item is T => item !== undefined);
}

/** Tab changes that matter to TabFlow; loading status and audio changes are ignored. */
const RELEVANT_TAB_CHANGES = ['url', 'title', 'favIconUrl', 'groupId', 'pinned', 'discarded'];

/** `TabsApi` over the real browser. */
export function createBrowserTabsApi(): TabsApi {
  // `tabGroups` is Chrome-only and needs the `tabGroups` permission.
  const tabGroups = (browser as Partial<typeof browser>).tabGroups;
  const supportsGroups = tabGroups !== undefined && typeof browser.tabs.group === 'function';

  function requireGroups(): typeof browser.tabGroups {
    if (!tabGroups) throw new Error('Native tab groups are not supported in this browser');
    return tabGroups;
  }

  const placeholderPageUrl = browser.runtime.getURL(PLACEHOLDER_PAGE_PATH);

  return {
    supportsGroups,
    appPageUrl: getAppPageUrl(),
    placeholderPageUrl,

    async getCurrentWindowId() {
      const window = await browser.windows.getLastFocused({ windowTypes: ['normal'] });
      if (window.id === undefined) throw new Error('No browser window is open');
      return window.id;
    },

    async queryTabs(filter) {
      const query: Browser.tabs.QueryInfo = {};
      if (filter.windowId !== undefined) query.windowId = filter.windowId;
      if (filter.groupId !== undefined) query.groupId = filter.groupId;
      const tabs = await browser.tabs.query(query);
      return compact(tabs.map((tab) => toBrowserTab(tab, placeholderPageUrl))).sort(
        (a, b) => a.index - b.index,
      );
    },

    async getTab(tabId) {
      try {
        return toBrowserTab(await browser.tabs.get(tabId), placeholderPageUrl);
      } catch {
        return undefined; // closed
      }
    },

    async createTab(input) {
      const tab = toBrowserTab(await browser.tabs.create(input), placeholderPageUrl);
      if (!tab) throw new Error(`Could not open ${input.url}`);
      return tab;
    },

    async activateTab(tabId) {
      await browser.tabs.update(tabId, { active: true });
    },

    async moveTab(tabId, { index, windowId }) {
      await browser.tabs.move(tabId, windowId === undefined ? { index } : { index, windowId });
    },

    async reloadTab(tabId) {
      await browser.tabs.reload(tabId);
    },

    async removeTabs(tabIds) {
      if (tabIds.length > 0) await browser.tabs.remove([...tabIds]);
    },

    async discardTab(tabId) {
      const tab = await browser.tabs.discard(tabId);
      return tab ? toBrowserTab(tab, placeholderPageUrl) : undefined;
    },

    async groupTabs(tabIds, windowId) {
      const [first, ...rest] = tabIds;
      if (first === undefined) throw new Error('Cannot create an empty group');
      requireGroups();
      return browser.tabs.group({ tabIds: [first, ...rest], createProperties: { windowId } });
    },

    async addTabsToGroup(tabIds, groupId) {
      const [first, ...rest] = tabIds;
      if (first === undefined) return;
      requireGroups();
      await browser.tabs.group({ groupId, tabIds: [first, ...rest] });
    },

    async ungroupTabs(tabIds) {
      const [first, ...rest] = tabIds;
      if (first !== undefined) await browser.tabs.ungroup([first, ...rest]);
    },

    async queryGroups(filter) {
      if (!tabGroups) return [];
      const groups = await tabGroups.query(
        filter.windowId === undefined ? {} : { windowId: filter.windowId },
      );
      return groups.map(toBrowserGroup);
    },

    async getGroup(groupId) {
      if (!tabGroups) return undefined;
      try {
        return toBrowserGroup(await tabGroups.get(groupId));
      } catch {
        return undefined; // closed
      }
    },

    async updateGroup(groupId, update) {
      await requireGroups().update(groupId, update);
    },

    onEvent(listener) {
      browser.tabs.onCreated.addListener((tab) => {
        if (tab.id !== undefined) listener({ type: 'tabCreated', tabId: tab.id });
      });
      browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (RELEVANT_TAB_CHANGES.some((key) => key in changeInfo)) {
          listener({ type: 'tabUpdated', tabId });
        }
      });
      browser.tabs.onMoved.addListener((tabId) => listener({ type: 'tabUpdated', tabId }));
      browser.tabs.onAttached.addListener((tabId) => listener({ type: 'tabUpdated', tabId }));
      browser.tabs.onRemoved.addListener((tabId, info) =>
        listener({ type: 'tabRemoved', tabId, windowClosing: info.isWindowClosing }),
      );
      browser.tabs.onReplaced.addListener((addedTabId, removedTabId) =>
        listener({ type: 'tabReplaced', addedTabId, removedTabId }),
      );
      browser.windows.onRemoved.addListener((windowId) =>
        listener({ type: 'windowRemoved', windowId }),
      );
      if (tabGroups) {
        const changed = (group: Browser.tabGroups.TabGroup) =>
          listener({ type: 'groupChanged', groupId: group.id });
        tabGroups.onCreated.addListener(changed);
        tabGroups.onUpdated.addListener(changed);
        tabGroups.onMoved.addListener(changed);
        tabGroups.onRemoved.addListener((group) =>
          listener({ type: 'groupRemoved', groupId: group.id }),
        );
      }
    },

    async isFirstRunInSession() {
      const stored = await browser.storage.session.get(SESSION_MARKER_KEY);
      if (stored[SESSION_MARKER_KEY] !== undefined) return false;
      await browser.storage.session.set({ [SESSION_MARKER_KEY]: Date.now() });
      return true;
    },
  };
}
