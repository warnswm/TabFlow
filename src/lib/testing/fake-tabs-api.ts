/**
 * In-memory `TabsApi` for tests. WXT's `fakeBrowser` has no `tabGroups`, `tabs.group` or
 * `tabs.discard`, so this fake reproduces the parts of Chrome's behaviour TabFlow relies on:
 * empty groups disappear, a window without tabs closes, the active tab cannot be discarded,
 * and ids change after a browser restart. Events are emitted synchronously.
 */
import type {
  BrowserGroup,
  BrowserTab,
  GroupUpdate,
  NewBrowserTab,
  TabsApi,
  TabsEvent,
} from '../browser-api';
import { NO_GROUP } from '../browser-api';
import { parsePlaceholderUrl } from '../placeholder';

/** A tab as Chrome stores it: `url` may be a placeholder URL. */
type TabRecord = Omit<BrowserTab, 'index' | 'placeholder'>;

export interface SeedTab {
  windowId?: number;
  url: string;
  title?: string;
  pinned?: boolean;
  active?: boolean;
  discarded?: boolean;
  /** False — Chrome shows no icon (an unloaded placeholder after a restart). */
  hasIcon?: boolean;
  /** When the tab was last shown; default — now (`clock`). */
  lastAccessed?: number;
  audible?: boolean;
  autoDiscardable?: boolean;
}

export const FAKE_APP_PAGE_URL = 'chrome-extension://tabflow/app.html';
export const FAKE_PLACEHOLDER_PAGE_URL = 'chrome-extension://tabflow/lazy.html';

export class FakeTabsApi implements TabsApi {
  readonly appPageUrl = FAKE_APP_PAGE_URL;
  readonly placeholderPageUrl = FAKE_PLACEHOLDER_PAGE_URL;
  /** Simulates Chrome versions where discarding gives the tab a new id. */
  replaceIdsOnDiscard = false;
  /**
   * How many times Chrome refuses (returns `undefined`) to discard a tab opened by `createTab`
   * before its first page starts loading. `Infinity` — never discards such tabs.
   */
  refusedDiscardsAfterCreate = 0;
  /** Simulates pages whose icon never arrives. */
  iconsNeverLoad = false;
  /** Tabs whose content script was asked for a video report, in order. */
  videoReportRequests: number[] = [];
  /**
   * The content script of a video page: called for every report request of a tab that is open.
   * Unset — no page has a content script (sites without access).
   */
  videoPage?: (tabId: number) => void;
  /** The time of `lastAccessed`: a tab gets it when opened and when activated. */
  clock: () => number = () => 0;
  private pendingRefusals = new Map<number, number>();

  private tabs: TabRecord[] = []; // in tab strip order
  private groups = new Map<number, BrowserGroup>();
  private windows: number[] = []; // last element = focused
  private listeners: ((event: TabsEvent) => void)[] = [];
  private failures = new Set<string>();
  private sessionStarted = false;
  private savedSession?: { tabs: TabRecord[]; groups: BrowserGroup[]; windows: number[] };
  private nextTabId = 1;
  private nextGroupId = 100;
  private nextWindowId = 1;

  constructor(readonly supportsGroups = true) {}

  // --- Test helpers --------------------------------------------------------

  openWindow(): number {
    const id = this.nextWindowId++;
    this.windows.push(id);
    return id;
  }

  /** Adds a tab as if the user opened it. Opens a window first if there is none. */
  addTab(seed: SeedTab): BrowserTab {
    const windowId = seed.windowId ?? this.windows.at(-1) ?? this.openWindow();
    const tab: TabRecord = {
      id: this.nextTabId++,
      windowId,
      url: seed.url,
      committed: true,
      loaded: true,
      hasIcon: seed.hasIcon ?? true,
      title: seed.title ?? seed.url,
      pinned: seed.pinned ?? false,
      active: false,
      highlighted: false,
      discarded: seed.discarded ?? false,
      groupId: NO_GROUP,
      lastAccessed: seed.lastAccessed ?? this.clock(),
      audible: seed.audible ?? false,
      autoDiscardable: seed.autoDiscardable ?? true,
    };
    this.insert(tab);
    if (seed.active || !this.tabs.some((t) => t.windowId === windowId && t.active)) {
      this.setActive(tab);
    }
    this.emit({ type: 'tabCreated', tabId: tab.id });
    return this.view(tab);
  }

  /** Adds tabs and puts them into a native group with a title and color. */
  addGroup(
    title: string,
    color: BrowserGroup['color'],
    seeds: SeedTab[],
    windowId?: number,
  ): { groupId: number; tabs: BrowserTab[] } {
    const tabs = seeds.map((seed) => this.addTab({ windowId, ...seed }));
    const groupId = this.createGroup(
      tabs.map((tab) => tab.id),
      tabs[0]?.windowId ?? this.openWindow(),
    );
    this.updateGroupSync(groupId, { title, color });
    return { groupId, tabs: tabs.map((tab) => this.view(this.require(tab.id))) };
  }

  /** The user navigated or the page changed its title. */
  userUpdateTab(tabId: number, patch: Partial<Pick<BrowserTab, 'url' | 'title'>>): void {
    Object.assign(this.require(tabId), patch);
    this.emit({ type: 'tabUpdated', tabId });
  }

  /** The user selected more tabs with Ctrl+click; the active tab stays selected. */
  userSelectTabs(tabIds: readonly number[]): void {
    for (const id of tabIds) this.require(id).highlighted = true;
  }

  /** The user dragged a tab into an existing group. */
  userMoveToGroup(tabId: number, groupId: number): void {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`No group ${groupId}`);
    const tab = this.require(tabId);
    tab.groupId = groupId;
    tab.windowId = group.windowId;
    this.emit({ type: 'tabUpdated', tabId });
    this.dropEmptyGroups();
  }

  /** The user closed a whole window. */
  closeWindow(windowId: number): void {
    const tabs = this.tabs.filter((tab) => tab.windowId === windowId);
    this.tabs = this.tabs.filter((tab) => tab.windowId !== windowId);
    for (const tab of tabs) this.emit({ type: 'tabRemoved', tabId: tab.id, windowClosing: true });
    for (const group of [...this.groups.values()]) {
      if (group.windowId === windowId) {
        this.groups.delete(group.id);
        this.emit({ type: 'groupRemoved', groupId: group.id });
      }
    }
    this.windows = this.windows.filter((id) => id !== windowId);
    this.emit({ type: 'windowRemoved', windowId });
  }

  /** The user quit the browser: every window closes, the session is remembered for `restart()`. */
  exit(): void {
    this.savedSession = {
      tabs: this.tabs.map((tab) => ({ ...tab })),
      groups: this.allGroups(),
      windows: [...this.windows],
    };
    for (const windowId of [...this.windows]) this.closeWindow(windowId);
  }

  /**
   * Browser restart with session restore: the same tabs and groups come back with new ids
   * (tab ids start from 1 again, so old ids may now point to other tabs). Listeners are dropped,
   * as the service worker starts from scratch.
   */
  restart(): void {
    if (this.savedSession) {
      this.tabs = this.savedSession.tabs;
      this.groups = new Map(this.savedSession.groups.map((group) => [group.id, group]));
      this.windows = this.savedSession.windows;
      this.savedSession = undefined;
    }
    this.listeners = [];
    this.sessionStarted = false;
    this.nextTabId = 1;
    const groupIds = new Map<number, number>();
    for (const group of [...this.groups.values()]) {
      groupIds.set(group.id, this.nextGroupId);
      this.groups.delete(group.id);
      this.groups.set(this.nextGroupId, { ...group, id: this.nextGroupId++ });
    }
    for (const tab of this.tabs) {
      tab.id = this.nextTabId++;
      tab.discarded = !tab.active; // restored tabs load lazily
      // Chrome 155: an unloaded placeholder shows no icon — the page itself sets it.
      if (tab.discarded && parsePlaceholderUrl(this.placeholderPageUrl, tab.url)) {
        tab.hasIcon = false;
      }
      if (tab.groupId !== NO_GROUP) tab.groupId = groupIds.get(tab.groupId) ?? NO_GROUP;
    }
  }

  /**
   * The extension was reloaded or updated: Chrome closes every page of the extension (placeholders,
   * the main page) while TabFlow is not running — no events — and clears `storage.session`.
   * Listeners are dropped, as the service worker starts from scratch.
   */
  reloadExtension(): void {
    const extensionOrigin = new URL(this.appPageUrl).origin;
    this.listeners = [];
    this.sessionStarted = false;
    const closing = this.tabs.filter((tab) => tab.url.startsWith(extensionOrigin));
    this.tabs = this.tabs.filter((tab) => !closing.includes(tab));
    for (const tab of closing.filter((t) => t.active)) {
      const next = this.tabs.find((t) => t.windowId === tab.windowId);
      if (next) this.setActive(next);
    }
    this.dropEmptyGroups();
    this.windows = this.windows.filter((id) => this.tabs.some((tab) => tab.windowId === id));
  }

  /** The service worker stopped: events happen without anyone listening, until it starts again. */
  sleepWorker(): void {
    this.listeners = [];
  }

  /** Makes the next call of `method` throw. */
  failNext(method: keyof TabsApi): void {
    this.failures.add(method);
  }

  allTabs(): BrowserTab[] {
    return this.tabs.map((tab) => this.view(tab));
  }

  allGroups(): BrowserGroup[] {
    return [...this.groups.values()].map((group) => ({ ...group }));
  }

  windowIds(): number[] {
    return [...this.windows];
  }

  // --- TabsApi -------------------------------------------------------------

  async getCurrentWindowId(): Promise<number> {
    this.maybeFail('getCurrentWindowId');
    const id = this.windows.at(-1);
    if (id === undefined) throw new Error('No browser window is open');
    return id;
  }

  async queryTabs(filter: { windowId?: number; groupId?: number }): Promise<BrowserTab[]> {
    this.maybeFail('queryTabs');
    return this.tabs
      .filter(
        (tab) =>
          (filter.windowId === undefined || tab.windowId === filter.windowId) &&
          (filter.groupId === undefined || tab.groupId === filter.groupId),
      )
      .map((tab) => this.view(tab));
  }

  async getTab(tabId: number): Promise<BrowserTab | undefined> {
    const tab = this.tabs.find((t) => t.id === tabId);
    return tab && this.view(tab);
  }

  async createTab(input: NewBrowserTab): Promise<BrowserTab> {
    this.maybeFail('createTab');
    if (!this.windows.includes(input.windowId)) throw new Error(`No window ${input.windowId}`);
    if (input.url.startsWith('javascript:')) throw new Error(`Cannot open ${input.url}`);
    const tab = this.addTab({ windowId: input.windowId, url: input.url, active: input.active });
    if (input.index !== undefined) this.moveToIndex(tab.id, input.index);
    // Like Chrome, the URL is committed a moment later (when the server answers).
    const record = this.require(tab.id);
    record.committed = false;
    record.loaded = false;
    record.hasIcon = false;
    setTimeout(() => {
      record.committed = true;
      record.loaded = true;
      record.hasIcon = !this.iconsNeverLoad;
    }, 0);
    if (this.refusedDiscardsAfterCreate > 0) {
      this.pendingRefusals.set(tab.id, this.refusedDiscardsAfterCreate);
    }
    return tab;
  }

  async navigateTab(tabId: number, url: string): Promise<void> {
    this.require(tabId).url = url;
    this.emit({ type: 'tabUpdated', tabId });
  }

  async activateTab(tabId: number): Promise<void> {
    const tab = this.require(tabId);
    this.setActive(tab);
    const target = parsePlaceholderUrl(this.placeholderPageUrl, tab.url);
    if (tab.discarded || target) {
      tab.discarded = false; // an activated discarded tab reloads
      if (target) Object.assign(tab, target); // the placeholder goes to the real page
      this.emit({ type: 'tabUpdated', tabId });
    }
  }

  async moveTab(tabId: number, to: { index: number; windowId?: number }): Promise<void> {
    this.maybeFail('moveTab');
    const tab = this.require(tabId);
    if (to.windowId !== undefined && to.windowId !== tab.windowId) {
      if (!this.windows.includes(to.windowId)) throw new Error(`No window ${to.windowId}`);
      const from = tab.windowId;
      tab.windowId = to.windowId;
      if (tab.active) {
        tab.active = false;
        const next = this.tabs.find((t) => t.windowId === from && t !== tab);
        if (next) this.setActive(next);
      }
    }
    this.moveToIndex(tabId, to.index < 0 ? Number.MAX_SAFE_INTEGER : to.index);

    // Like Chrome: outside its group the tab leaves it; between two tabs of a group it joins.
    const windowTabs = this.tabs.filter((t) => t.windowId === tab.windowId);
    const at = windowTabs.indexOf(tab);
    const left = windowTabs[at - 1];
    const right = windowTabs[at + 1];
    const group = this.groups.get(tab.groupId);
    const besideOwnGroup =
      left?.groupId === tab.groupId ||
      right?.groupId === tab.groupId ||
      !this.tabs.some((t) => t !== tab && t.groupId === tab.groupId); // the only tab of its group
    if (left && right && left.groupId !== NO_GROUP && left.groupId === right.groupId) {
      tab.groupId = left.groupId;
    } else if (tab.groupId !== NO_GROUP && (group?.windowId !== tab.windowId || !besideOwnGroup)) {
      tab.groupId = NO_GROUP;
    }
    this.emit({ type: 'tabUpdated', tabId });
    this.dropEmptyGroups();
    this.dropEmptyWindows();
  }

  async reloadTab(tabId: number): Promise<void> {
    this.maybeFail('reloadTab');
    const record = this.require(tabId);
    record.discarded = false;
    record.loaded = false;
    record.hasIcon = false;
    this.emit({ type: 'tabUpdated', tabId });
    setTimeout(() => {
      record.loaded = true;
      record.hasIcon = !this.iconsNeverLoad;
    }, 0);
  }

  async removeTabs(tabIds: readonly number[]): Promise<void> {
    this.maybeFail('removeTabs');
    for (const tabId of tabIds) this.require(tabId);
    for (const tabId of tabIds) {
      const tab = this.require(tabId);
      this.tabs = this.tabs.filter((t) => t.id !== tabId);
      if (tab.active) {
        const next = this.tabs.find((t) => t.windowId === tab.windowId);
        if (next) this.setActive(next);
      }
      this.emit({ type: 'tabRemoved', tabId, windowClosing: false });
    }
    this.dropEmptyGroups();
    this.dropEmptyWindows();
  }

  async discardTab(tabId: number): Promise<BrowserTab | undefined> {
    this.maybeFail('discardTab');
    const tab = this.require(tabId);
    if (tab.active) throw new Error('Cannot discard the active tab');
    const refusals = this.pendingRefusals.get(tabId) ?? 0;
    if (refusals > 0) {
      this.pendingRefusals.set(tabId, refusals - 1);
      return undefined; // Chrome does not throw when it refuses
    }
    tab.discarded = true;
    if (!tab.committed) {
      // Chrome: a tab discarded before its URL is committed comes back empty.
      tab.url = 'about:blank';
      tab.title = 'about:blank';
    }
    if (this.replaceIdsOnDiscard) {
      const removedTabId = tab.id;
      tab.id = this.nextTabId++;
      this.emit({ type: 'tabReplaced', addedTabId: tab.id, removedTabId });
    } else {
      this.emit({ type: 'tabUpdated', tabId });
    }
    return this.view(tab);
  }

  async groupTabs(tabIds: readonly number[], windowId: number): Promise<number> {
    this.maybeFail('groupTabs');
    if (!this.supportsGroups) throw new Error('Native tab groups are not supported');
    return this.createGroup(tabIds, windowId);
  }

  async addTabsToGroup(tabIds: readonly number[], groupId: number): Promise<void> {
    this.maybeFail('addTabsToGroup');
    for (const tabId of tabIds) this.userMoveToGroup(tabId, groupId);
  }

  async ungroupTabs(tabIds: readonly number[]): Promise<void> {
    for (const tabId of tabIds) {
      this.require(tabId).groupId = NO_GROUP;
      this.emit({ type: 'tabUpdated', tabId });
    }
    this.dropEmptyGroups();
  }

  async queryGroups(filter: { windowId?: number }): Promise<BrowserGroup[]> {
    return this.allGroups().filter(
      (group) => filter.windowId === undefined || group.windowId === filter.windowId,
    );
  }

  async getGroup(groupId: number): Promise<BrowserGroup | undefined> {
    const group = this.groups.get(groupId);
    return group && { ...group };
  }

  async updateGroup(groupId: number, update: GroupUpdate): Promise<void> {
    this.maybeFail('updateGroup');
    this.updateGroupSync(groupId, update);
  }

  async moveGroup(groupId: number, index: number): Promise<void> {
    this.maybeFail('moveGroup');
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`No group ${groupId}`);
    const moving = this.tabs.filter((tab) => tab.groupId === groupId);
    this.tabs = this.tabs.filter((tab) => tab.groupId !== groupId);
    const anchor = this.tabs.filter((tab) => tab.windowId === group.windowId)[index];
    if (anchor && index >= 0) this.tabs.splice(this.tabs.indexOf(anchor), 0, ...moving);
    else this.tabs.push(...moving);
    for (const tab of moving) this.emit({ type: 'tabUpdated', tabId: tab.id });
    this.emit({ type: 'groupMoved', groupId });
  }

  async requestVideoReport(tabId: number): Promise<void> {
    this.videoReportRequests.push(tabId);
    if (this.tabs.some((tab) => tab.id === tabId)) this.videoPage?.(tabId);
  }

  onEvent(listener: (event: TabsEvent) => void): void {
    this.listeners.push(listener);
  }

  async isFirstRunInSession(): Promise<boolean> {
    const first = !this.sessionStarted;
    this.sessionStarted = true;
    return first;
  }

  // --- Internals -----------------------------------------------------------

  private createGroup(tabIds: readonly number[], windowId: number): number {
    if (tabIds.length === 0) throw new Error('Cannot create an empty group');
    const group: BrowserGroup = {
      id: this.nextGroupId++,
      windowId,
      title: '',
      color: 'grey',
      collapsed: false,
    };
    this.groups.set(group.id, group);
    this.emit({ type: 'groupChanged', groupId: group.id });
    for (const tabId of tabIds) {
      const tab = this.require(tabId);
      if (tab.pinned) throw new Error('Pinned tabs cannot be grouped');
      tab.groupId = group.id;
      this.emit({ type: 'tabUpdated', tabId });
    }
    this.dropEmptyGroups();
    return group.id;
  }

  private updateGroupSync(groupId: number, update: GroupUpdate): void {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`No group ${groupId}`);
    Object.assign(group, update);
    this.emit({ type: 'groupChanged', groupId });
  }

  /** A window without tabs closes. */
  private dropEmptyWindows(): void {
    for (const windowId of [...this.windows]) {
      if (!this.tabs.some((tab) => tab.windowId === windowId)) {
        this.windows = this.windows.filter((id) => id !== windowId);
        this.emit({ type: 'windowRemoved', windowId });
      }
    }
  }

  private dropEmptyGroups(): void {
    for (const group of [...this.groups.values()]) {
      if (!this.tabs.some((tab) => tab.groupId === group.id)) {
        this.groups.delete(group.id);
        this.emit({ type: 'groupRemoved', groupId: group.id });
      }
    }
  }

  private insert(tab: TabRecord): void {
    this.tabs.push(tab);
  }

  /** Moves a tab to `index` within its window (Chrome clamps a too large index to the end). */
  private moveToIndex(tabId: number, index: number): void {
    const tab = this.require(tabId);
    this.tabs = this.tabs.filter((t) => t !== tab);
    const anchor = this.tabs.filter((t) => t.windowId === tab.windowId)[index];
    if (anchor) this.tabs.splice(this.tabs.indexOf(anchor), 0, tab);
    else this.tabs.push(tab);
  }

  private setActive(tab: TabRecord): void {
    for (const other of this.tabs) {
      if (other.windowId !== tab.windowId) continue;
      other.active = other === tab;
      other.highlighted = other === tab; // as in Chrome: activating clears the selection
    }
    tab.lastAccessed = this.clock();
    this.windows = [...this.windows.filter((id) => id !== tab.windowId), tab.windowId];
  }

  private view(tab: TabRecord): BrowserTab {
    const index = this.tabs.filter((t) => t.windowId === tab.windowId).indexOf(tab);
    const target = parsePlaceholderUrl(this.placeholderPageUrl, tab.url);
    return target
      ? { ...tab, index, ...target, favIconUrl: target.favIconUrl, placeholder: true }
      : { ...tab, index, placeholder: false };
  }

  private require(tabId: number): TabRecord {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) throw new Error(`No tab with id: ${tabId}`);
    return tab;
  }

  private maybeFail(method: string): void {
    if (this.failures.delete(method)) throw new Error(`${method} failed (test)`);
  }

  private emit(event: TabsEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
