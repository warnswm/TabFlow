/**
 * Keeps the database mirror in step with native Chrome groups.
 *
 * Every native group has a live `TabGroup` record (state `active` or `asleep`) with its saveable
 * tabs. Events are only hints: handlers re-read the current Chrome state and reconcile the whole
 * group, which also covers missed and out-of-order events.
 *
 * Rules:
 * - a tab closed in Chrome goes to the trash; a tab that left the group but is still open is forgotten;
 * - a saved link is never changed or dropped because its tab shows a browser page (`about:blank`);
 * - a group closed in Chrome (or with its window) becomes stowed with all its links;
 * - a group dissolved in Chrome (tabs ungrouped, still open) is forgotten;
 * - a group is asleep when all its saved tabs are discarded;
 * - a group moved on the tab strip moves its tile within its space (`followStrip`).
 */
import { type BrowserGroup, type BrowserTab, NO_GROUP, type TabsEvent } from '../browser-api';
import type { SavedTab, TabGroup } from '../db';
import { arrangeGroups, followStrip } from './arrange';
import type { BackgroundContext } from './context';
import { isSaveableTab, normalizeUrl } from './tab-rules';

/**
 * Tabs closed this long before their group disappears are treated as closed together with it.
 * Chrome closes a group tab by tab, and the queue may handle the events a little later.
 */
export const GROUP_CLOSE_GRACE_MS = 10_000;

/**
 * Brings the mirror of one native group up to date. Creates the mirror for a new group
 * (in the default space); handles a group that is gone. Returns the live mirror, if any.
 */
export async function syncGroup(
  ctx: BackgroundContext,
  chromeGroupId: number,
): Promise<TabGroup | undefined> {
  const { api, repos } = ctx;
  const chromeGroup = await api.getGroup(chromeGroupId);
  let mirror = await repos.groups.findByChromeGroupId(chromeGroupId);

  if (!chromeGroup) {
    if (mirror) await handleGroupGone(ctx, mirror);
    return undefined;
  }

  if (!mirror) {
    const space = await repos.spaces.ensureDefault();
    mirror = await repos.groups.create({
      spaceId: space.id,
      title: chromeGroup.title,
      color: chromeGroup.color,
      chromeGroupId,
      windowId: chromeGroup.windowId,
    });
  } else if (
    mirror.title !== chromeGroup.title.trim() ||
    mirror.color !== chromeGroup.color ||
    mirror.windowId !== chromeGroup.windowId
  ) {
    await repos.groups.update(mirror.id, {
      title: chromeGroup.title,
      color: chromeGroup.color,
      windowId: chromeGroup.windowId,
    });
  }

  const chromeTabs = await api.queryTabs({ groupId: chromeGroupId });
  await syncTabs(ctx, mirror, chromeTabs);

  const state =
    chromeTabs.length > 0 && chromeTabs.every((tab) => tab.discarded) ? 'asleep' : 'active';
  if (mirror.state !== state) await repos.groups.setState(mirror.id, state);

  return repos.groups.get(mirror.id);
}

async function syncTabs(
  ctx: BackgroundContext,
  mirror: TabGroup,
  chromeTabs: readonly BrowserTab[],
): Promise<void> {
  const { api, repos } = ctx;
  const saved = await repos.tabs.listByGroup(mirror.id);
  const unmatched = new Map(chromeTabs.map((tab) => [tab.id, tab]));
  const pairs: [SavedTab, BrowserTab][] = [];
  const orphans: SavedTab[] = [];

  // First by tab id, then by URL: ids change after a restart and sometimes after discarding.
  for (const tab of saved) {
    const chromeTab = tab.chromeTabId === undefined ? undefined : unmatched.get(tab.chromeTabId);
    if (chromeTab) {
      pairs.push([tab, chromeTab]);
      unmatched.delete(chromeTab.id);
    } else {
      orphans.push(tab);
    }
  }
  for (const tab of [...orphans]) {
    const chromeTab = [...unmatched.values()].find(
      (candidate) => isSaveableTab(candidate) && candidate.url === tab.url,
    );
    if (chromeTab) {
      pairs.push([tab, chromeTab]);
      unmatched.delete(chromeTab.id);
      orphans.splice(orphans.indexOf(tab), 1);
    }
  }

  for (const tab of orphans) {
    const stillOpen = tab.chromeTabId !== undefined && (await api.getTab(tab.chromeTabId));
    // Left the group but still open: nothing to keep. Closed: to the trash.
    if (stillOpen) await repos.tabs.forget(tab.id);
    else await repos.tabs.remove(tab.id);
  }

  for (const [tab, chromeTab] of pairs) {
    // The tab is still in the group but shows a browser page (`about:blank`, `chrome://…`):
    // keep the saved link — it must never be lost because of what a tab shows right now.
    if (!isSaveableTab(chromeTab)) {
      if (tab.chromeTabId !== chromeTab.id) {
        await repos.tabs.update(tab.id, { chromeTabId: chromeTab.id });
      }
      continue;
    }
    // A tab discarded before loading (or still loading) shows its URL as the title and no icon:
    // keep the saved ones while the page is the same.
    const samePage = tab.url === chromeTab.url;
    const knownTitle = chromeTab.title !== '' && chromeTab.title !== chromeTab.url;
    const title = knownTitle || !samePage ? chromeTab.title : tab.title;
    const favIconUrl = chromeTab.favIconUrl ?? (samePage ? tab.favIconUrl : undefined);
    if (
      tab.chromeTabId !== chromeTab.id ||
      !samePage ||
      tab.title !== title ||
      tab.favIconUrl !== favIconUrl
    ) {
      await repos.tabs.update(tab.id, {
        chromeTabId: chromeTab.id,
        url: chromeTab.url,
        title,
        favIconUrl,
      });
    }
  }

  const added = [...unmatched.values()].filter(isSaveableTab);
  if (added.length > 0) {
    await repos.tabs.addMany(
      mirror.id,
      added.map((tab) => ({
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl,
        chromeTabId: tab.id,
      })),
    );
  }

  // Order of the tab strip.
  const current = await repos.tabs.listByGroup(mirror.id);
  const idByChromeTab = new Map(current.map((tab) => [tab.chromeTabId, tab.id]));
  const desired = [...chromeTabs]
    .sort((a, b) => a.index - b.index)
    .map((tab) => idByChromeTab.get(tab.id))
    .filter((id) => id !== undefined);
  if (desired.join() !== current.map((tab) => tab.id).join()) {
    await repos.tabs.reorder(desired);
  }
}

/**
 * The native group no longer exists. Closed with its tabs (by the user or with the window):
 * becomes stowed. Dissolved, tabs still open: forgotten.
 */
async function handleGroupGone(ctx: BackgroundContext, mirror: TabGroup): Promise<void> {
  const { api, repos } = ctx;
  await repos.tabs.restoreDeletedSince(mirror.id, ctx.clock() - GROUP_CLOSE_GRACE_MS);

  for (const tab of await repos.tabs.listByGroup(mirror.id)) {
    if (tab.chromeTabId !== undefined && (await api.getTab(tab.chromeTabId))) {
      await repos.tabs.forget(tab.id);
    }
  }

  if ((await repos.tabs.listByGroup(mirror.id)).length > 0) {
    await repos.groups.setState(mirror.id, 'stowed');
  } else {
    await repos.groups.forget(mirror.id);
  }
}

/** Re-syncs the groups a tab belonged to and belongs to now. */
async function syncTab(ctx: BackgroundContext, tabId: number): Promise<void> {
  const { api, repos } = ctx;
  const chromeGroupIds = new Set<number>();

  const saved = await repos.tabs.findByChromeTabId(tabId);
  if (saved) {
    const group = await repos.groups.get(saved.groupId);
    if (group?.chromeGroupId !== undefined) chromeGroupIds.add(group.chromeGroupId);
  }
  const tab = await api.getTab(tabId);
  if (tab && tab.groupId !== NO_GROUP) chromeGroupIds.add(tab.groupId);

  for (const chromeGroupId of chromeGroupIds) await syncGroup(ctx, chromeGroupId);
}

export async function handleTabsEvent(ctx: BackgroundContext, event: TabsEvent): Promise<void> {
  const { repos } = ctx;
  switch (event.type) {
    case 'groupChanged':
    case 'groupRemoved':
      await syncGroup(ctx, event.groupId);
      break;
    case 'groupMoved': {
      const mirror = await syncGroup(ctx, event.groupId);
      if (mirror?.windowId !== undefined) await followStrip(ctx, mirror.windowId);
      break;
    }
    case 'tabCreated':
    case 'tabUpdated':
      await syncTab(ctx, event.tabId);
      break;
    case 'tabRemoved':
      // A closing window is handled as a whole by `windowRemoved`.
      if (!event.windowClosing) await syncTab(ctx, event.tabId);
      break;
    case 'tabReplaced': {
      const saved = await repos.tabs.findByChromeTabId(event.removedTabId);
      if (saved) await repos.tabs.update(saved.id, { chromeTabId: event.addedTabId });
      await syncTab(ctx, event.addedTabId);
      break;
    }
    case 'windowRemoved':
      for (const group of await repos.groups.listAll()) {
        if (group.windowId === event.windowId && group.chromeGroupId !== undefined) {
          await syncGroup(ctx, group.chromeGroupId);
        }
      }
      break;
  }
}

/**
 * Full reconciliation at service worker start.
 *
 * In a new browser session (`idsAreStale`) every saved Chrome id is dropped first, and native
 * groups restored by Chrome are matched to mirrors by title, color and URLs. Groups that were
 * stowed when their window closed come back to the strip this way instead of being duplicated.
 * Mirrors left without a native group become stowed; new native groups get a mirror.
 * In the same session a matched stowed group was opened from Chrome's saved groups while the
 * worker slept (see `revive.ts`): it takes its place on the strip by TabFlow order.
 * `reopenMissing` runs before syncing for every matched group in a new session and for revived
 * stowed groups: links whose tabs are gone can be opened again there instead of going to the trash.
 */
export async function reconcileAll(
  ctx: BackgroundContext,
  {
    idsAreStale,
    reopenMissing,
  }: {
    idsAreStale: boolean;
    reopenMissing?: (mirror: TabGroup, chromeGroup: BrowserGroup) => Promise<void>;
  },
): Promise<void> {
  const { api, repos } = ctx;
  if (!api.supportsGroups) return;

  if (idsAreStale) {
    for (const group of await repos.groups.listAll()) {
      if (group.chromeGroupId !== undefined) await repos.groups.unlinkFromChrome(group.id);
    }
  }

  const chromeGroups = await api.queryGroups({});
  const unknown: BrowserGroup[] = [];
  for (const chromeGroup of chromeGroups) {
    if (!(await repos.groups.findByChromeGroupId(chromeGroup.id))) unknown.push(chromeGroup);
  }

  const candidates = (await repos.groups.listAll()).filter(
    (group) => group.chromeGroupId === undefined,
  );
  const revived = new Set<string>();
  for (const chromeGroup of unknown) {
    const match = await findMatch(ctx, chromeGroup, candidates);
    if (match) {
      candidates.splice(candidates.indexOf(match), 1);
      if (match.state === 'stowed') revived.add(match.id);
      await repos.groups.update(match.id, {
        chromeGroupId: chromeGroup.id,
        windowId: chromeGroup.windowId,
      });
    }
  }

  if (reopenMissing) {
    for (const chromeGroup of chromeGroups) {
      const mirror = await repos.groups.findByChromeGroupId(chromeGroup.id);
      if (mirror && (idsAreStale || revived.has(mirror.id))) {
        await reopenMissing(mirror, chromeGroup);
      }
    }
  }

  // Syncs known and matched groups, creates mirrors for the rest.
  for (const chromeGroup of chromeGroups) await syncGroup(ctx, chromeGroup.id);

  const present = new Set(chromeGroups.map((group) => group.id));
  for (const group of await repos.groups.listAll()) {
    if (group.state === 'stowed') continue;
    if (group.chromeGroupId === undefined) await repos.groups.setState(group.id, 'stowed');
    else if (!present.has(group.chromeGroupId)) await syncGroup(ctx, group.chromeGroupId);
  }

  // After a browser restart Chrome brings the strip back as it was: it is left alone.
  if (!idsAreStale) {
    const windows = new Set<number>();
    for (const id of revived) {
      const windowId = (await repos.groups.get(id))?.windowId;
      if (windowId !== undefined) windows.add(windowId);
    }
    for (const windowId of windows) await arrangeGroups(ctx, windowId);
  }
}

/**
 * The best unlinked mirror for a native group: same title and color, and shared URLs.
 * Groups still on the strip win over stowed ones; a stowed group needs at least half of the URLs
 * in common, so a group stowed on purpose is not revived by a look-alike.
 */
export async function findMatch(
  ctx: BackgroundContext,
  chromeGroup: BrowserGroup,
  candidates: readonly TabGroup[],
): Promise<TabGroup | undefined> {
  const urls = new Set(
    (await ctx.api.queryTabs({ groupId: chromeGroup.id }))
      .filter(isSaveableTab)
      .map((tab) => normalizeUrl(tab.url)),
  );

  let best: { group: TabGroup; rank: number } | undefined;
  for (const group of candidates) {
    if (group.title !== chromeGroup.title.trim() || group.color !== chromeGroup.color) continue;
    const savedUrls = (await ctx.repos.tabs.listByGroup(group.id)).map((tab) =>
      normalizeUrl(tab.url),
    );
    const shared = savedUrls.filter((url) => urls.has(url)).length;
    const stowed = group.state === 'stowed';
    const fits = stowed
      ? shared > 0 && shared * 2 >= urls.size
      : shared > 0 || (urls.size === 0 && savedUrls.length === 0);
    if (!fits) continue;
    const rank = (stowed ? 0 : 1_000_000) + shared;
    if (!best || rank > best.rank) best = { group, rank };
  }
  return best?.group;
}
