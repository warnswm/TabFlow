/**
 * The only module that talks to the extension API (`chrome.*` / `browser.*`).
 * UI and background code call these functions instead of using `browser` directly,
 * so that Edge/Firefox support and Chrome-only APIs stay in one place.
 */
import { browser, type Browser } from 'wxt/browser';
import { GROUP_COLORS, type GroupColor } from './db/models';
import type { MenuClick, MenuItem } from './menus';
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

/** Calls back with the keys of settings changed on any page. */
export function onSettingsChanged(callback: (keys: string[]) => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') callback(Object.keys(changes));
  });
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

/** Who sent a message to the background. */
export type MessageSender = { kind: 'extension' } | { kind: 'content'; tabId: number };

/**
 * Handles messages from extension pages and from TabFlow's content scripts. Messages from other
 * extensions and web pages never reach this listener (no `externally_connectable` in the
 * manifest); a content script is told apart by its sender: a web page in a tab.
 */
export function onRuntimeMessage(
  handler: (message: unknown, sender: MessageSender) => Promise<unknown>,
): void {
  const extensionOrigin = browser.runtime.getURL('');
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id) return false;
    const fromPage = sender.url?.startsWith(extensionOrigin) ?? false;
    const tabId = sender.tab?.id;
    if (!fromPage && tabId === undefined) return false;
    const from: MessageSender =
      fromPage || tabId === undefined ? { kind: 'extension' } : { kind: 'content', tabId };
    void handler(message, from).then(sendResponse);
    return true; // keeps the channel open for the async response
  });
}

// ---------------------------------------------------------------------------
// Video pages: the content script, access to sites
// ---------------------------------------------------------------------------

/** The background asks the content script of a tab to report its video now. */
export const VIDEO_REPORT_REQUEST = { type: 'tabflow:report-video' } as const;

/** In the content script: calls back when the background asks for a report. */
export function onVideoReportRequest(callback: () => void): void {
  browser.runtime.onMessage.addListener((message: unknown) => {
    const type = (message as { type?: unknown } | null)?.type;
    if (type === VIDEO_REPORT_REQUEST.type) callback();
    return false; // no answer: the report goes as a message of its own
  });
}

/** The content script of video pages (`entrypoints/video.content.ts`), built by WXT. */
const VIDEO_SCRIPT_ID = 'tabflow-video';
const VIDEO_SCRIPT_FILE = '/content-scripts/video.js';

/**
 * Asks Chrome for access to sites (match patterns, see `queue/site-access.ts`). Chrome shows its
 * dialog only for sites not allowed yet. Must be called right in a click — Chrome refuses
 * otherwise; resolves `false` when refused or declined.
 */
export async function requestSiteAccess(patterns: readonly string[]): Promise<boolean> {
  if (patterns.length === 0) return true;
  try {
    return await browser.permissions.request({ origins: [...patterns] });
  } catch (error) {
    console.info('[TabFlow] Site access not requested:', error);
    return false;
  }
}

/** Sites the author allowed (match patterns). */
export async function grantedSitePatterns(): Promise<string[]> {
  return (await browser.permissions.getAll()).origins ?? [];
}

/** Takes back access to sites (settings page); resolves `false` when Chrome refused. */
export async function removeSiteAccess(patterns: readonly string[]): Promise<boolean> {
  try {
    return await browser.permissions.remove({ origins: [...patterns] });
  } catch (error) {
    console.info('[TabFlow] Site access not removed:', error);
    return false;
  }
}

/** Calls back when site access is allowed (`added`) or taken back. */
export function onSiteAccessChanged(callback: (added: string[]) => void): void {
  browser.permissions.onAdded.addListener(({ origins }) => callback(origins ?? []));
  browser.permissions.onRemoved.addListener(() => callback([]));
}

/**
 * Runs the content script on exactly the allowed sites, in all frames (embedded players);
 * Chrome keeps the registration across restarts.
 */
export async function syncVideoScript(): Promise<void> {
  const { scripting } = browser as Partial<typeof browser>;
  if (!scripting) return;
  const matches = await grantedSitePatterns();
  const registered = await scripting.getRegisteredContentScripts({ ids: [VIDEO_SCRIPT_ID] });
  if (matches.length === 0) {
    if (registered.length > 0) await scripting.unregisterContentScripts({ ids: [VIDEO_SCRIPT_ID] });
    return;
  }
  const script = {
    id: VIDEO_SCRIPT_ID,
    matches,
    js: [VIDEO_SCRIPT_FILE],
    allFrames: true,
    runAt: 'document_idle' as const,
    persistAcrossSessions: true,
  };
  const [current] = registered;
  if (!current) {
    await scripting.registerContentScripts([script]);
  } else if (
    JSON.stringify([...(current.matches ?? [])].sort()) !== JSON.stringify([...matches].sort())
  ) {
    // The service worker wakes often: the registration changes only with the allowed sites.
    await scripting.updateContentScripts([script]);
  }
}

/** Starts the content script in the open tabs of newly allowed sites (they loaded without it). */
export async function injectVideoScript(patterns: readonly string[]): Promise<void> {
  const { scripting } = browser as Partial<typeof browser>;
  if (!scripting || patterns.length === 0) return;
  const tabs = await browser.tabs.query({ url: [...patterns] });
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id === undefined) return;
      try {
        await scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: [VIDEO_SCRIPT_FILE],
        });
      } catch {
        // A frame of a site without access, or the tab closed meanwhile.
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// «Рядом»: sites in frames of the main page
// ---------------------------------------------------------------------------

type Dnr = typeof browser.declarativeNetRequest;

/**
 * Lets sites show in frames of this page (the viewer of «Рядом»). Many sites forbid framing with
 * `X-Frame-Options` or `Content-Security-Policy: frame-ancestors`; a session rule removes these
 * headers from frame responses — only in this tab, only on sites TabFlow has access to
 * (`declarativeNetRequestWithHostAccess`), and not after the browser restarts. Some sites refuse
 * the frame request itself by `Sec-Fetch-Dest: iframe` (WhatsApp Web answers 400), so the rule
 * asks for the page as a document. The rule lives as long as the tab (the main page
 * has no other frames); rules of closed tabs are dropped here. False where the API is missing:
 * frames then load as usual.
 */
export async function allowFramesInThisTab(): Promise<boolean> {
  const dnr = (browser as Partial<typeof browser>).declarativeNetRequest;
  const tabId = (await browser.tabs.getCurrent())?.id;
  if (!dnr || tabId === undefined) return false;
  const ruleId = tabId; // tab ids are unique within a browser session, as are session rules
  const openTabs = new Set((await browser.tabs.query({})).map((tab) => tab.id));
  const stale = (await dnr.getSessionRules())
    .map((rule) => rule.id)
    .filter((id) => !openTabs.has(id));
  const remove = (header: string) => ({
    header,
    operation: 'remove' as Dnr['HeaderOperation']['REMOVE'],
  });
  await dnr.updateSessionRules({
    removeRuleIds: [...new Set([...stale, ruleId])],
    addRules: [
      {
        id: ruleId,
        priority: 1,
        action: {
          type: 'modifyHeaders' as Dnr['RuleActionType']['MODIFY_HEADERS'],
          requestHeaders: [
            {
              header: 'sec-fetch-dest',
              operation: 'set' as Dnr['HeaderOperation']['SET'],
              value: 'document',
            },
          ],
          responseHeaders: [remove('x-frame-options'), remove('content-security-policy')],
        },
        condition: {
          tabIds: [tabId],
          resourceTypes: ['sub_frame' as Dnr['ResourceType']['SUB_FRAME']],
        },
      },
    ],
  });
  return true;
}

/** Open tabs of all windows, in window and strip order (for «Рядом»: tabs outside TabFlow). */
export async function listOpenTabs(): Promise<BrowserTab[]> {
  const placeholderPageUrl = browser.runtime.getURL(PLACEHOLDER_PAGE_PATH);
  return compact(
    (await browser.tabs.query({})).map((tab) => toBrowserTab(tab, placeholderPageUrl)),
  );
}

/**
 * Shows an open tab with this address (in any window), or opens the page in a new tab — for
 * «Рядом» items that are not saved links: open tabs outside TabFlow, links of a layout that are gone.
 */
export async function showOrOpenPage(url: string): Promise<void> {
  const open = (await browser.tabs.query({})).find((tab) => tab.url === url);
  if (open?.id === undefined) {
    await browser.tabs.create({ url });
    return;
  }
  await browser.tabs.update(open.id, { active: true });
  await browser.windows.update(open.windowId, { focused: true });
}

// ---------------------------------------------------------------------------
// The side panel (Chrome 114+)
// ---------------------------------------------------------------------------

export function supportsSidePanel(): boolean {
  return (browser as Partial<typeof browser>).sidePanel?.open !== undefined;
}

/**
 * Opens the side panel with the queue in `windowId`. Chrome allows it only right in a click or
 * a shortcut, so nothing may be awaited before this call.
 */
export async function openSidePanel(windowId: number): Promise<void> {
  const { sidePanel } = browser as Partial<typeof browser>;
  if (!sidePanel) return;
  try {
    await sidePanel.open({ windowId });
  } catch (error) {
    console.info('[TabFlow] Side panel not opened:', error);
  }
}

/** The window of the page that calls it (popup, side panel, main page). */
export async function getPageWindowId(): Promise<number | undefined> {
  return (await browser.windows.getCurrent()).id;
}

/**
 * For the side panel: the active tab of its window, now and after every switch, navigation or
 * title change. Returns a function that stops watching.
 */
export function watchActiveTab(callback: (tab: BrowserTab | undefined) => void): () => void {
  const placeholderPageUrl = browser.runtime.getURL(PLACEHOLDER_PAGE_PATH);
  let windowId: number | undefined;
  const read = async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    windowId = tab?.windowId;
    callback(tab && toBrowserTab(tab, placeholderPageUrl));
  };
  const onActivated = () => void read();
  const onUpdated = (_tabId: number, change: Browser.tabs.OnUpdatedInfo, tab: Browser.tabs.Tab) => {
    if (tab.active && tab.windowId === windowId && ('url' in change || 'title' in change)) {
      void read();
    }
  };
  browser.tabs.onActivated.addListener(onActivated);
  browser.tabs.onUpdated.addListener(onUpdated);
  void read();
  return () => {
    browser.tabs.onActivated.removeListener(onActivated);
    browser.tabs.onUpdated.removeListener(onUpdated);
  };
}

// ---------------------------------------------------------------------------
// The TabFlow icon: badge, context menu, keyboard shortcuts
// ---------------------------------------------------------------------------

/** What the background shows outside its pages. Tests use a fake. */
export interface ExtensionUi {
  /** Number on the TabFlow icon (empty — no badge) and the icon's tooltip. */
  setBadge(text: string, title: string): Promise<void>;
  /** Replaces the whole context menu of TabFlow. */
  setMenu(items: readonly MenuItem[]): Promise<void>;
}

/** Badge colors: the accent with its text color (`accent` / `on-accent` tokens). */
const BADGE_BACKGROUND = '#2DD4BF';
const BADGE_TEXT = '#04201C';

/** The context menu works on web pages and files only (as do the saved tabs). */
const WEB_PATTERNS = ['http://*/*', 'https://*/*', 'file:///*'];

export function createExtensionUi(): ExtensionUi {
  const { action } = browser;
  void action.setBadgeBackgroundColor({ color: BADGE_BACKGROUND });
  // `setBadgeTextColor` — Chrome 110+.
  if (typeof action.setBadgeTextColor === 'function') {
    void action.setBadgeTextColor({ color: BADGE_TEXT });
  }
  const menus = (browser as Partial<typeof browser>).contextMenus;

  return {
    async setBadge(text, title) {
      await action.setBadgeText({ text });
      await action.setTitle({ title });
    },

    async setMenu(items) {
      if (!menus) return;
      await menus.removeAll();
      for (const item of items) {
        const web = item.contexts.includes('action')
          ? {}
          : {
              documentUrlPatterns: WEB_PATTERNS,
              ...(item.contexts.includes('link') ? { targetUrlPatterns: WEB_PATTERNS } : {}),
            };
        menus.create(
          {
            id: item.id,
            contexts: item.contexts as [Browser.contextMenus.ContextType],
            ...(item.separator ? { type: 'separator' } : { title: item.title }),
            ...(item.parentId === undefined ? {} : { parentId: item.parentId }),
            ...(item.enabled === false ? { enabled: false } : {}),
            ...web,
          },
          () => {
            const error = browser.runtime.lastError;
            if (error) console.warn(`[TabFlow] Menu item ${item.id}:`, error.message);
          },
        );
      }
    },
  };
}

/** Clicks on the TabFlow context menu. Call synchronously at service worker start. */
export function onMenuClick(handler: (click: MenuClick) => void): void {
  (browser as Partial<typeof browser>).contextMenus?.onClicked.addListener((info, tab) => {
    handler({
      itemId: String(info.menuItemId),
      tabId: tab?.id,
      windowId: tab?.windowId,
      linkUrl: info.linkUrl,
      pageUrl: info.pageUrl,
    });
  });
}

/** Keyboard shortcuts of TabFlow. Call synchronously at service worker start. */
export function onHotkey(
  handler: (name: string, tab?: { id?: number; windowId: number; url?: string }) => void,
): void {
  browser.commands.onCommand.addListener((name, tab) => handler(name, tab));
}

/** The key assigned to a shortcut (empty when the author removed it). */
export async function getHotkey(name: string): Promise<string> {
  const commands = await browser.commands.getAll();
  return commands.find((command) => command.name === name)?.shortcut ?? '';
}

/** Every shortcut of TabFlow with its key in Chrome now (empty — none). */
export async function getHotkeys(): Promise<{ name: string; shortcut: string }[]> {
  return (await browser.commands.getAll()).flatMap(({ name, shortcut }) =>
    name ? [{ name, shortcut: shortcut ?? '' }] : [],
  );
}

/** Opens a page of the browser itself (`chrome://extensions/shortcuts`) in a new tab. */
export async function openBrowserPage(url: string): Promise<void> {
  await browser.tabs.create({ url });
}

/** The settings page (the options page of the extension leads to `app.html#/settings`). */
export async function openSettingsPage(): Promise<void> {
  await browser.runtime.openOptionsPage();
}

/** Version of the installed extension (from the manifest). */
export function extensionVersion(): string {
  return browser.runtime.getManifest().version;
}

/** What the popup needs to know about the open tabs. */
export interface OpenTabsInfo {
  /** Open tabs in all windows. */
  count: number;
  /** Native groups of the tabs shown in the windows (their active tabs). */
  shownGroupIds: number[];
  /** The active tab of the popup's window. */
  current?: BrowserTab;
  /** Tabs selected in the popup's window (the active one included). */
  selected: number;
}

export async function getOpenTabsInfo(): Promise<OpenTabsInfo> {
  const placeholderPageUrl = browser.runtime.getURL(PLACEHOLDER_PAGE_PATH);
  const [all, [current], selected] = await Promise.all([
    browser.tabs.query({}),
    browser.tabs.query({ active: true, currentWindow: true }),
    browser.tabs.query({ highlighted: true, currentWindow: true }),
  ]);
  return {
    selected: selected.length,
    count: all.length,
    shownGroupIds: all
      .filter((tab) => tab.active && tab.groupId !== undefined && tab.groupId !== NO_GROUP)
      .map((tab) => tab.groupId),
    current: current && toBrowserTab(current, placeholderPageUrl),
  };
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
  /**
   * Selected on the tab strip (Ctrl+click, Shift+click). The active tab is always selected;
   * activating a tab leaves only it selected.
   */
  highlighted: boolean;
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
  /** The group moved on the tab strip — dragged by the user or moved by TabFlow. */
  | { type: 'groupMoved'; groupId: number }
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
  /** Moves the whole native group within its window: its first tab lands at `index`. */
  moveGroup(groupId: number, index: number): Promise<void>;

  /**
   * Asks the content script of the tab's video page to report the video now (duration, position).
   * Does nothing on pages without it — sites TabFlow has no access to, pages opened before.
   */
  requestVideoReport(tabId: number): Promise<void>;

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
    highlighted: tab.highlighted,
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

    async moveGroup(groupId, index) {
      await requireGroups().move(groupId, { index });
    },

    async requestVideoReport(tabId) {
      try {
        await browser.tabs.sendMessage(tabId, VIDEO_REPORT_REQUEST);
      } catch {
        // No content script on the page: nobody to answer.
      }
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
        tabGroups.onMoved.addListener((group) =>
          listener({ type: 'groupMoved', groupId: group.id }),
        );
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
