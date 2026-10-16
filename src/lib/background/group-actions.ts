/**
 * Sleep / stow / restore a group. Rule for everything that closes tabs: the database is written
 * first, tabs are closed only after the write succeeded — a failed write leaves the tabs open.
 */
import type { BrowserTab, GroupUpdate } from '../browser-api';
import type { GroupColor, Id, TabGroup } from '../db';
import { CommandError, type CommandResult, type RestoreMode } from '../messages';
import { buildPlaceholderUrl } from '../placeholder';
import type { BackgroundContext } from './context';
import { syncGroup } from './mirror';
import { isSaveableTab, isSaveableUrl, splitDuplicates } from './tab-rules';

export function result(partial: Partial<CommandResult>): CommandResult {
  return { groups: 0, tabs: 0, failed: 0, closedGroupIds: [], ...partial };
}

export async function requireGroup(ctx: BackgroundContext, groupId: Id): Promise<TabGroup> {
  const group = await ctx.repos.groups.get(groupId);
  if (!group) throw new CommandError('group-not-found', `Group ${groupId} not found`);
  return group;
}

/** Renames or recolors the group; a group on the tab strip changes in Chrome as well. */
export async function editGroup(
  ctx: BackgroundContext,
  groupId: Id,
  patch: { title?: string; color?: GroupColor },
): Promise<CommandResult> {
  const group = await requireGroup(ctx, groupId);
  const update: GroupUpdate = {};
  if (patch.title !== undefined) update.title = patch.title.trim();
  if (patch.color !== undefined) update.color = patch.color;

  await ctx.repos.groups.update(group.id, update);
  if (group.chromeGroupId !== undefined) {
    try {
      await ctx.api.updateGroup(group.chromeGroupId, update);
    } catch {
      // Closed meanwhile: the mirror stows it with the new title.
    }
  }
  return result({ groups: 1 });
}

/** Shows the link's open tab, or opens the link in a new tab of the current window. */
export async function openTab(ctx: BackgroundContext, tabId: Id): Promise<CommandResult> {
  const { api, repos } = ctx;
  const tab = await repos.tabs.get(tabId);
  if (!tab) throw new CommandError('tab-not-found', `Tab ${tabId} not found`);

  if (tab.chromeTabId !== undefined && (await api.getTab(tab.chromeTabId))) {
    await api.activateTab(tab.chromeTabId);
  } else {
    // Saved links are web pages or files; anything else is never opened.
    if (!isSaveableUrl(tab.url)) throw new CommandError('restore-failed', 'Not a web page');
    await api.createTab({ windowId: await api.getCurrentWindowId(), url: tab.url, active: true });
  }
  return result({ tabs: 1 });
}

/** Puts the group to sleep: its tabs stay on the strip but are unloaded from memory. */
export async function sleepGroup(ctx: BackgroundContext, groupId: Id): Promise<CommandResult> {
  const { api } = ctx;
  const group = await requireGroup(ctx, groupId);
  if (group.chromeGroupId === undefined) {
    throw new CommandError('group-not-on-tab-strip', 'Only a group on the tab strip can sleep');
  }

  const tabs = await api.queryTabs({ groupId: group.chromeGroupId });
  // The active tab cannot be discarded: switch to a tab outside the group first.
  await moveFocusOutOf(ctx, tabs);

  let failed = 0;
  for (const tab of tabs) {
    if (tab.discarded) continue;
    try {
      // Chrome returns nothing instead of throwing when it refuses to discard.
      if (!(await api.discardTab(tab.id))?.discarded) failed++;
    } catch {
      failed++;
    }
  }
  try {
    await api.updateGroup(group.chromeGroupId, { collapsed: true });
  } catch {
    // Collapsing is cosmetic; the tabs are asleep anyway.
  }

  await syncGroup(ctx, group.chromeGroupId);
  return result({ groups: 1, tabs: tabs.length - failed, failed });
}

/** Stows the group: links are saved in TabFlow, then its tabs are closed. */
export async function stowGroup(ctx: BackgroundContext, groupId: Id): Promise<CommandResult> {
  const group = await requireGroup(ctx, groupId);
  if (group.state === 'stowed') {
    return result({ groups: 1, tabs: (await ctx.repos.tabs.listByGroup(group.id)).length });
  }
  if (group.chromeGroupId === undefined) {
    await ctx.repos.groups.setState(group.id, 'stowed');
    return result({ groups: 1, tabs: (await ctx.repos.tabs.listByGroup(group.id)).length });
  }

  const plan = await stowInDb(ctx, group.chromeGroupId);
  await closeTabs(ctx, plan.closeIds, plan.ungroupIds);
  return result({
    groups: 1,
    tabs: plan.saved,
    closedGroupIds: plan.groupId === undefined ? [] : [plan.groupId],
  });
}

export interface StowPlan {
  /** The stowed group; missing when it held only browser pages and was forgotten. */
  groupId?: Id;
  /** Tabs kept in TabFlow (duplicates dropped). */
  saved: number;
  /** Saved tabs and their duplicates: closed after the write. */
  closeIds: number[];
  /** Tabs that are not saved (browser pages): taken out of the group and left open. */
  ungroupIds: number[];
}

/**
 * Database half of stowing a native group: syncs the mirror, drops duplicate URLs and marks the
 * group stowed in one transaction. Returns what to do with the Chrome tabs afterwards.
 */
export async function stowInDb(ctx: BackgroundContext, chromeGroupId: number): Promise<StowPlan> {
  const { api, db, repos } = ctx;
  const mirror = await syncGroup(ctx, chromeGroupId);
  const chromeTabs = await api.queryTabs({ groupId: chromeGroupId });
  const plan: StowPlan = {
    saved: 0,
    closeIds: chromeTabs.filter(isSaveableTab).map((tab) => tab.id),
    ungroupIds: chromeTabs.filter((tab) => !isSaveableTab(tab)).map((tab) => tab.id),
  };
  if (!mirror) return { saved: 0, closeIds: [], ungroupIds: [] };

  plan.saved = await db.transaction('rw', db.groups, db.tabs, async () => {
    const { unique, duplicates } = splitDuplicates(
      await repos.tabs.listByGroup(mirror.id),
      (tab) => tab.url,
    );
    for (const tab of duplicates) await repos.tabs.forget(tab.id);
    if (unique.length === 0) {
      await repos.groups.forget(mirror.id); // only browser pages: nothing to keep
    } else {
      await repos.groups.setState(mirror.id, 'stowed');
      plan.groupId = mirror.id;
    }
    return unique.length;
  });
  return plan;
}

/**
 * Closes tabs after their links were saved. A window is never left empty (Chrome would close it):
 * the main TabFlow page opens there first.
 */
export async function closeTabs(
  ctx: BackgroundContext,
  closeIds: readonly number[],
  ungroupIds: readonly number[] = [],
): Promise<void> {
  const { api } = ctx;
  if (ungroupIds.length > 0) await api.ungroupTabs(ungroupIds);

  const closing = (await Promise.all(closeIds.map((id) => api.getTab(id)))).filter(
    (tab) => tab !== undefined,
  );
  const closingIds = new Set(closing.map((tab) => tab.id));
  for (const windowId of new Set(closing.map((tab) => tab.windowId))) {
    const windowTabs = await api.queryTabs({ windowId });
    if (windowTabs.every((tab) => closingIds.has(tab.id))) await openAppPageIn(ctx, windowId);
  }
  await api.removeTabs([...closingIds]);
}

/**
 * Opens the group again as a native group with the same title and color, in the current window.
 * Only the first tab loads; how the others wait depends on `mode`:
 * - `placeholder` — they open a local TabFlow page with the real title and icon, which is
 *   discarded at once and goes to the site when the tab is opened: no site loads at all;
 * - `background` — they open the sites and are discarded in the background once each URL is
 *   committed; the command does not wait for that.
 */
export async function restoreGroup(
  ctx: BackgroundContext,
  groupId: Id,
  mode: RestoreMode = 'placeholder',
): Promise<CommandResult> {
  const { api, repos } = ctx;
  const group = await requireGroup(ctx, groupId);

  if (group.chromeGroupId !== undefined) {
    // Already on the strip: just show it.
    const [first] = await api.queryTabs({ groupId: group.chromeGroupId });
    if (first) await api.activateTab(first.id);
    return result({ groups: 1 });
  }

  const saved = await repos.tabs.listByGroup(group.id);
  if (saved.length === 0) throw new CommandError('group-empty', 'The group has no tabs');

  const windowId = await api.getCurrentWindowId();
  const firstIndex = (await api.queryTabs({ windowId })).length;
  const toDiscardLater: number[] = [];
  // Opened tabs by position in the group; tabs open at explicit positions so the order is kept.
  const opened: ({ id: Id; chromeTabId: number } | undefined)[] = [];

  // 1. The first tab that opens is shown and loads; the native group starts with it at once,
  //    so the group with its title and color is on the strip right away.
  let lead = -1;
  for (const [i, tab] of saved.entries()) {
    try {
      const chromeTab = await api.createTab({
        windowId,
        url: tab.url,
        active: true,
        index: firstIndex + i,
      });
      opened[i] = { id: tab.id, chromeTabId: chromeTab.id };
      lead = i;
      break;
    } catch {
      // Try the next one.
    }
  }
  const leadTab = opened[lead];
  if (!leadTab) {
    throw new CommandError('restore-failed', 'None of the tabs could be opened; links are kept');
  }
  let chromeGroupId: number | undefined;
  if (api.supportsGroups) {
    chromeGroupId = await api.groupTabs([leadTab.chromeTabId], windowId);
    await api.updateGroup(chromeGroupId, {
      title: group.title,
      color: group.color,
      collapsed: false,
    });
  }
  // Without native groups the tabs are just opened and the group stays stowed in TabFlow.

  // 2. The rest open at once, each joins the group as soon as it exists and waits unloaded.
  await Promise.all(
    saved.map(async (tab, i) => {
      if (i <= lead) return;
      try {
        const chromeTab = await api.createTab({
          windowId,
          url: mode === 'placeholder' ? buildPlaceholderUrl(api.placeholderPageUrl, tab) : tab.url,
          active: false,
          index: firstIndex + i,
        });
        if (chromeGroupId !== undefined) await api.addTabsToGroup([chromeTab.id], chromeGroupId);
        let chromeTabId = chromeTab.id;
        if (mode === 'placeholder') {
          // Loaded and its icon applied: the discarded tab keeps showing the title and icon.
          chromeTabId = await discardWhen(
            ctx,
            chromeTab.id,
            (t, poll) => t.loaded && (t.hasIcon || poll >= ICON_MAX_POLLS),
          );
        } else {
          toDiscardLater.push(chromeTab.id);
        }
        opened[i] = { id: tab.id, chromeTabId };
      } catch {
        // Not opened: the link stays saved.
      }
    }),
  );
  const linked = opened.filter((tab) => tab !== undefined);
  const failed = saved.length - linked.length;
  if (chromeGroupId !== undefined) {
    await repos.groups.linkToChrome(group.id, { chromeGroupId, windowId, tabs: linked });
  }

  // Not awaited: the group is already back; the mirror follows the ids that discarding changes.
  for (const id of toDiscardLater) void discardWhen(ctx, id, (t) => t.committed);

  return result({ groups: 1, tabs: linked.length, failed });
}

/** A just opened tab is checked this often, for up to 15 s. */
export const COMMIT_POLL_MS = 50;
const COMMIT_MAX_POLLS = 300;
/** A placeholder waits up to 2 s for its icon, so the discarded tab keeps showing it. */
const ICON_MAX_POLLS = 40;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Discards a just opened tab once it is `ready`. Chrome cannot create a tab already discarded,
 * and a tab discarded before its URL is committed loses the URL (`about:blank`), so `ready` must
 * at least require `committed`. Returns the tab id (discarding may change it).
 * If it never works, the tab simply stays loaded.
 */
async function discardWhen(
  ctx: BackgroundContext,
  tabId: number,
  ready: (tab: BrowserTab, poll: number) => boolean,
): Promise<number> {
  let lastError: unknown = 'the tab was not ready in time';
  for (let poll = 0; poll < COMMIT_MAX_POLLS; poll++) {
    if (poll > 0) await wait(COMMIT_POLL_MS);
    const tab = await ctx.api.getTab(tabId);
    if (!tab) return tabId; // closed meanwhile
    if (!tab.committed || !ready(tab, poll)) continue;
    try {
      const discarded = await ctx.api.discardTab(tabId);
      if (discarded?.discarded) return discarded.id;
      lastError = 'Chrome refused to discard';
    } catch (error) {
      lastError = error;
    }
  }
  console.warn(`[TabFlow] Tab ${tabId} stays loaded: it could not be discarded.`, lastError);
  return tabId;
}

/** Activates the main TabFlow page in the window, opening it if needed. */
export async function openAppPageIn(ctx: BackgroundContext, windowId: number): Promise<void> {
  const { api } = ctx;
  const tabs = await api.queryTabs({ windowId });
  const existing = tabs.find((tab) => tab.url.startsWith(api.appPageUrl));
  if (existing) await api.activateTab(existing.id);
  else await api.createTab({ windowId, url: api.appPageUrl, active: true });
}

/** If the active tab of a window is among `leaving`, activates the nearest other tab (or the main page). */
async function moveFocusOutOf(
  ctx: BackgroundContext,
  leaving: readonly BrowserTab[],
): Promise<void> {
  const { api } = ctx;
  const leavingIds = new Set(leaving.map((tab) => tab.id));
  for (const active of leaving.filter((tab) => tab.active)) {
    const others = (await api.queryTabs({ windowId: active.windowId })).filter(
      (tab) => !leavingIds.has(tab.id),
    );
    const distance = (tab: BrowserTab) =>
      Math.abs(tab.index - active.index) + (tab.discarded ? 10_000 : 0); // prefer loaded tabs
    const [target] = others.sort((a, b) => distance(a) - distance(b));
    if (target) await api.activateTab(target.id);
    else await openAppPageIn(ctx, active.windowId);
  }
}
