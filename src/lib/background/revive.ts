/**
 * Chrome keeps every tab group in its saved groups (the bookmarks bar, «Группы вкладок»), also
 * after TabFlow stowed it and closed its tabs: there it is shown as closed. When such a group is
 * opened from Chrome, the native group comes back with a new id. It is linked to its stowed group
 * in TabFlow instead of getting a mirror of its own — no duplicate tile.
 *
 * Chrome has no extension API for its saved groups, so they are recognized like groups after a
 * browser restart (`findMatch`): same title and color, at least half of the URLs in common.
 */
import { type BrowserGroup, NO_GROUP, type TabsEvent } from '../browser-api';
import type { TabGroup } from '../db';
import { arrangeGroups } from './arrange';
import type { BackgroundContext } from './context';
import { findMatch } from './mirror';
import { discardPlaceholder, reopenMissingLinks } from './placeholder-icons';

/**
 * Before an event is mirrored: a native group it touches that TabFlow does not know yet and that
 * matches a stowed group becomes that group again. Links Chrome does not have (saved into the
 * group while it was stowed) open as placeholders in it rather than going to the trash, and the
 * group takes its place on the strip by TabFlow order. Returns the revived groups.
 */
export async function reviveFromChrome(
  ctx: BackgroundContext,
  event: TabsEvent,
): Promise<TabGroup[]> {
  const revived: TabGroup[] = [];
  for (const chromeGroupId of await touchedGroups(ctx, event)) {
    if (await ctx.repos.groups.findByChromeGroupId(chromeGroupId)) continue;
    const chromeGroup = await ctx.api.getGroup(chromeGroupId);
    if (!chromeGroup) continue;
    const group = await reviveGroup(ctx, chromeGroup);
    if (group) revived.push(group);
  }
  return revived;
}

async function reviveGroup(
  ctx: BackgroundContext,
  chromeGroup: BrowserGroup,
): Promise<TabGroup | undefined> {
  const { repos } = ctx;
  const stowed = (await repos.groups.listAll()).filter(
    (group) => group.state === 'stowed' && group.chromeGroupId === undefined,
  );
  const match = await findMatch(ctx, chromeGroup, stowed);
  if (!match) return undefined;

  // The tabs are linked by the mirror right after this, by URL.
  await repos.groups.linkToChrome(match.id, {
    chromeGroupId: chromeGroup.id,
    windowId: chromeGroup.windowId,
    tabs: [],
  });
  const opened = await reopenMissingLinks(ctx, match.id, chromeGroup.id);
  // Not awaited: loading and discarding takes a moment and must not hold the queue.
  for (const tabId of opened) void discardPlaceholder(ctx, tabId);
  await arrangeGroups(ctx, chromeGroup.windowId);
  return repos.groups.get(match.id);
}

async function touchedGroups(ctx: BackgroundContext, event: TabsEvent): Promise<number[]> {
  const groupOf = async (tabId: number) => {
    const tab = await ctx.api.getTab(tabId);
    return tab && tab.groupId !== NO_GROUP ? [tab.groupId] : [];
  };
  switch (event.type) {
    case 'groupChanged':
    case 'groupMoved':
      return [event.groupId];
    case 'tabCreated':
    case 'tabUpdated':
      return groupOf(event.tabId);
    case 'tabReplaced':
      return groupOf(event.addedTabId);
    case 'tabRemoved':
    case 'groupRemoved':
    case 'windowRemoved':
      return [];
  }
}
