/**
 * «Порядок»: closing duplicates and sorting tabs outside groups into native groups, with undo.
 * The page shows the preview; the background finds the same duplicates again (a stale preview
 * cannot close the wrong tab) and checks every tab of a grouping before touching it.
 */
import { type BrowserTab, NO_GROUP } from '../browser-api';
import type {
  CommandResult,
  DuplicatesUndo,
  GroupingUndo,
  RestoreMode,
  TabGrouping,
} from '../messages';
import { findDuplicates } from '../tidy/duplicates';
import type { BackgroundContext } from './context';
import { closeTabs, result } from './group-actions';
import { syncGroup } from './mirror';
import { isSaveableTab } from './tab-rules';
import { deleteTab, restoreDeleted } from './trash-actions';

/**
 * Closes the duplicates of the sets with `keys`. Links (of open and stowed groups) go to the
 * trash first — the last link of a group takes the group along, as «Удалить»; then the extra
 * tabs outside TabFlow close.
 */
export async function closeDuplicates(
  ctx: BackgroundContext,
  keys: readonly string[],
): Promise<CommandResult> {
  const { api, repos } = ctx;
  const openTabs = await api.queryTabs({});
  const found = findDuplicates(openTabs, await repos.groups.listAll(), await repos.tabs.listAll());
  const chosen = new Set(keys);
  const extras = [...found.tabs, ...found.links]
    .filter((set) => chosen.has(set.key))
    .flatMap((set) => set.extras);

  const undo: DuplicatesUndo = { reopen: [], restore: [] };
  const closeIds: number[] = [];
  let tabs = 0;
  let links = 0;
  for (const item of extras) {
    const owner = item.kind === 'link' ? item : item.link;
    if (!owner) {
      if (item.kind !== 'tab') continue;
      const tab = openTabs.find((open) => open.id === item.chromeTabId);
      if (!tab) continue;
      undo.reopen.push({ url: tab.url, windowId: tab.windowId, index: tab.index });
      closeIds.push(tab.id);
      tabs++;
      continue;
    }
    try {
      // The database first, then its tab: as «Удалить» on the link.
      const removed = await deleteTab(ctx, owner.linkId);
      undo.restore.push(
        removed.groups > 0
          ? { kind: 'group', id: owner.groupId, reopen: removed.closedGroupIds.length > 0 }
          : { kind: 'tab', id: owner.linkId, reopen: false },
      );
      if (item.kind === 'tab') tabs++;
      else links++;
    } catch {
      // Deleted meanwhile.
    }
  }
  await closeTabs(ctx, closeIds);
  return result({ tabs, duplicates: { links, undo } });
}

/** Brings back what `closeDuplicates` removed: links from the trash, tabs opened again. */
export async function undoCloseDuplicates(
  ctx: BackgroundContext,
  undo: DuplicatesUndo,
  mode?: RestoreMode,
): Promise<CommandResult> {
  const { api } = ctx;
  const total = result({});
  // Backwards: a group emptied by its last link comes back before the links removed before it.
  for (const item of [...undo.restore].reverse()) {
    try {
      const restored = await restoreDeleted(
        ctx,
        item.kind,
        item.id,
        item.reopen ? [item.id] : [],
        mode,
      );
      total.tabs += restored.tabs;
      total.failed += restored.failed;
    } catch {
      total.failed++;
    }
  }
  for (const tab of [...undo.reopen].sort((a, b) => a.index - b.index)) {
    try {
      await api.createTab({
        windowId: tab.windowId,
        url: tab.url,
        index: tab.index,
        active: false,
      });
      total.tabs++;
    } catch {
      // The window is gone: the current one.
      try {
        await api.createTab({
          windowId: await api.getCurrentWindowId(),
          url: tab.url,
          active: false,
        });
        total.tabs++;
      } catch {
        total.failed++;
      }
    }
  }
  return total;
}

/**
 * «Разложить вкладки»: each grouping becomes a native group with its title and color (or joins
 * the group of the same title). Only tabs still outside groups take part; pinned tabs and browser
 * pages stay as they are. TabFlow mirrors the new groups in «Входящие» at once.
 */
export async function groupTabs(
  ctx: BackgroundContext,
  groupings: readonly TabGrouping[],
): Promise<CommandResult> {
  const { api } = ctx;
  const undo: GroupingUndo = { tabs: [] };
  const plans: { grouping: TabGrouping; windowId: number; tabIds: number[] }[] = [];
  // Places are read before anything moves: grouping moves tabs next to each other.
  for (const grouping of groupings) {
    const tabs = (await Promise.all(grouping.chromeTabIds.map((id) => api.getTab(id)))).filter(
      (tab): tab is BrowserTab =>
        tab !== undefined && tab.groupId === NO_GROUP && isSaveableTab(tab),
    );
    const windowId = tabs[0]?.windowId;
    const inWindow = tabs.filter((tab) => tab.windowId === windowId);
    if (windowId === undefined || inWindow.length === 0) continue;
    for (const tab of inWindow) {
      undo.tabs.push({ chromeTabId: tab.id, windowId, index: tab.index });
    }
    plans.push({ grouping, windowId, tabIds: inWindow.map((tab) => tab.id) });
  }

  let groups = 0;
  let tabs = 0;
  for (const { grouping, windowId, tabIds } of plans) {
    const join =
      grouping.joinChromeGroupId === undefined
        ? undefined
        : await api.getGroup(grouping.joinChromeGroupId);
    if (join && join.windowId === windowId) {
      await api.addTabsToGroup(tabIds, join.id);
      await syncGroup(ctx, join.id);
    } else {
      if (tabIds.length < 2) continue;
      const groupId = await api.groupTabs(tabIds, windowId);
      await api.updateGroup(groupId, { title: grouping.title.trim(), color: grouping.color });
      await syncGroup(ctx, groupId);
    }
    groups++;
    tabs += tabIds.length;
  }
  return result({ groups, tabs, grouped: undo });
}

/** Takes the grouped tabs out of their groups and puts them back where they were. */
export async function undoGroupTabs(
  ctx: BackgroundContext,
  undo: GroupingUndo,
): Promise<CommandResult> {
  const { api } = ctx;
  const present = [];
  for (const place of undo.tabs) {
    const tab = await api.getTab(place.chromeTabId);
    if (tab) present.push({ tab, place });
  }
  // TabFlow forgets a group left without tabs that are still open (dissolved, not closed).
  await api.ungroupTabs(present.map(({ tab }) => tab.id));
  let failed = undo.tabs.length - present.length;
  for (const { tab, place } of present.sort((a, b) => a.place.index - b.place.index)) {
    if (tab.windowId !== place.windowId) continue;
    try {
      await api.moveTab(tab.id, { index: place.index });
    } catch {
      failed++;
    }
  }
  return result({ tabs: present.length, failed });
}
