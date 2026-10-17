/**
 * Moving a link: to another place in its group (drag & drop in «Ссылки») or to another group
 * («Перенести в группу»). The database is written first, then the tab follows on the tab strip,
 * so the mirror sees the order and the groups it already expects:
 * - both groups on the strip — the tab moves into the other native group, to the link's place;
 * - to a stowed group — the tab is closed (the link is saved there);
 * - from a stowed group to one on the strip — the link opens as a tab of that group.
 * The last link of a group leaves the empty group in the trash; undo brings it back.
 */
import type { Id, TabGroup } from '../db';
import { CommandError, type CommandResult } from '../messages';
import type { BackgroundContext } from './context';
import { closeTabs, discardWhen, requireGroup, result } from './group-actions';
import { isSaveableUrl } from './tab-rules';

export async function moveTab(
  ctx: BackgroundContext,
  tabId: Id,
  groupId: Id,
  index: number,
): Promise<CommandResult> {
  const { api, db, repos } = ctx;
  const tab = await repos.tabs.get(tabId);
  if (!tab) throw new CommandError('tab-not-found', `Tab ${tabId} not found`);
  const source = await requireGroup(ctx, tab.groupId);
  const target = await requireGroup(ctx, groupId);

  const sourceTabs = await repos.tabs.listByGroup(source.id);
  const fromIndex = sourceTabs.findIndex((item) => item.id === tab.id);
  const sameGroup = source.id === target.id;
  const emptiesSource = !sameGroup && sourceTabs.length <= 1;
  const sourceOnStrip = source.chromeGroupId !== undefined;
  const targetOnStrip = target.chromeGroupId !== undefined && target.windowId !== undefined;
  const chromeTab =
    sourceOnStrip && tab.chromeTabId !== undefined ? await api.getTab(tab.chromeTabId) : undefined;

  // 1. Database.
  await db.transaction('rw', db.spaces, db.groups, db.tabs, async () => {
    await repos.tabs.place(tab.id, target.id, index);
    if (!sameGroup && !targetOnStrip) await repos.tabs.update(tab.id, { chromeTabId: undefined });
    if (emptiesSource) {
      // Stowed first: the mirror no longer follows its native group, which is about to go.
      if (sourceOnStrip) await repos.groups.setState(source.id, 'stowed');
      await repos.groups.remove(source.id);
    }
  });

  // 2. The tab strip.
  let failed = 0;
  if (sameGroup) {
    if (chromeTab) await placeOnStrip(ctx, target, chromeTab.id);
  } else if (chromeTab && targetOnStrip) {
    await moveIntoGroup(ctx, target, tab.id, chromeTab.id);
  } else if (chromeTab) {
    await closeTabs(ctx, [chromeTab.id]);
  } else if (targetOnStrip) {
    failed = (await openInGroup(ctx, target, tab.id, tab.url)) ? 0 : 1;
  }

  if (emptiesSource && source.chromeGroupId !== undefined) {
    // Browser pages left in the old native group: out of it, so it is not mirrored again.
    const left = await api.queryTabs({ groupId: source.chromeGroupId });
    if (left.length > 0) await api.ungroupTabs(left.map((item) => item.id));
  }

  return result({
    groups: emptiesSource ? 1 : 0,
    tabs: 1 - failed,
    failed,
    movedFrom: {
      groupId: source.id,
      index: Math.max(fromIndex, 0),
      groupDeleted: emptiesSource,
      groupWasOnStrip: sourceOnStrip,
    },
  });
}

/** Moves an open tab into the native group of `target`, to the place of its link. */
export async function moveIntoGroup(
  ctx: BackgroundContext,
  target: TabGroup,
  linkId: Id,
  chromeTabId: number,
): Promise<void> {
  const { api, repos } = ctx;
  if (target.chromeGroupId === undefined || target.windowId === undefined) return;

  const chromeTab = await api.getTab(chromeTabId);
  if (chromeTab && chromeTab.windowId !== target.windowId) {
    await api.moveTab(chromeTabId, { windowId: target.windowId, index: -1 });
  }
  await api.addTabsToGroup([chromeTabId], target.chromeGroupId);
  await placeOnStrip(ctx, target, chromeTabId);

  // A sleeping group stays asleep: the moved tab is unloaded too (not if it is the shown one).
  if (target.state === 'asleep' && chromeTab && !chromeTab.active && !chromeTab.discarded) {
    try {
      const discarded = await api.discardTab(chromeTabId);
      if (discarded?.discarded && discarded.id !== chromeTabId) {
        await repos.tabs.update(linkId, { chromeTabId: discarded.id });
      }
    } catch {
      // Stays loaded; the group simply counts as active.
    }
  }
}

/** Opens a link that had no tab as a tab of `target`'s native group. False if it did not open. */
export async function openInGroup(
  ctx: BackgroundContext,
  target: TabGroup,
  linkId: Id,
  url: string,
): Promise<boolean> {
  const { api, repos } = ctx;
  if (target.chromeGroupId === undefined || target.windowId === undefined) return false;
  if (!isSaveableUrl(url)) return false;
  try {
    const created = await api.createTab({ windowId: target.windowId, url, active: false });
    await repos.tabs.update(linkId, { chromeTabId: created.id });
    await api.addTabsToGroup([created.id], target.chromeGroupId);
    await placeOnStrip(ctx, target, created.id);
    if (target.state === 'asleep') void discardWhen(ctx, created.id, (t) => t.committed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Moves an open tab of `group` to the place its link has among the group's links: right before
 * the open tab of the next link (or right after the previous one). Tabs without a link — browser
 * pages — are not counted.
 */
async function placeOnStrip(
  ctx: BackgroundContext,
  group: TabGroup,
  chromeTabId: number,
): Promise<void> {
  const { api, repos } = ctx;
  if (group.chromeGroupId === undefined) return;

  const chromeTabs = new Map(
    (await api.queryTabs({ groupId: group.chromeGroupId })).map((item) => [item.id, item]),
  );
  const moving = chromeTabs.get(chromeTabId);
  if (!moving) return;

  const order = (await repos.tabs.listByGroup(group.id))
    .map((link) => link.chromeTabId)
    .filter((id) => id !== undefined && chromeTabs.has(id));
  const at = order.indexOf(chromeTabId);
  const next = chromeTabs.get(order[at + 1] ?? -1);
  const previous = at > 0 ? chromeTabs.get(order[at - 1] ?? -1) : undefined;

  // `index` is the final position: the tab is taken out of the strip before it is put back.
  let index: number | undefined;
  if (next) index = moving.index < next.index ? next.index - 1 : next.index;
  else if (previous) index = moving.index < previous.index ? previous.index : previous.index + 1;
  if (index === undefined || index === moving.index) return;

  await api.moveTab(chromeTabId, { index });
  // Chrome may take a tab moved to the edge of the group out of it: put it back.
  const moved = await api.getTab(chromeTabId);
  if (moved && moved.groupId !== group.chromeGroupId) {
    await api.addTabsToGroup([chromeTabId], group.chromeGroupId);
  }
}
