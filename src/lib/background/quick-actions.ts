/**
 * Actions on what is in front of the user — from the popup, the context menu and the keyboard
 * shortcuts: stow or put to sleep the current group (or tab), put the other groups to sleep,
 * save a page or a link into a group. The database is written first, then tabs are closed.
 *
 * A single tab or link without a group goes to the day group in «Входящие» («17 окт · отложено»):
 * one stowed group per day, found by its title and created when missing.
 */
import { MONTHS_RU } from '../app/time-format';
import { type BrowserTab, NO_GROUP } from '../browser-api';
import type { Id, TabGroup, Timestamp } from '../db';
import { CommandError, type CommandResult } from '../messages';
import { isSleepable } from '../summary';
import { collapsedGroupTitle } from './collapse';
import type { BackgroundContext } from './context';
import {
  closeTabs,
  openAppPageIn,
  requireGroup,
  result,
  sleepGroup,
  stowGroup,
} from './group-actions';
import { syncGroup } from './mirror';
import { moveIntoGroup, moveTab, openInGroup } from './move-tab';
import { isSaveableTab, isSaveableUrl, normalizeUrl, splitDuplicates } from './tab-rules';

/** «17 окт · отложено» (local date). */
export function dayGroupTitle(time: Timestamp): string {
  const date = new Date(time);
  return `${date.getDate()} ${MONTHS_RU[date.getMonth()]} · отложено`;
}

/** The day group in «Входящие»; created stowed when there is none yet. */
async function dayGroup(ctx: BackgroundContext): Promise<TabGroup> {
  const { db, repos } = ctx;
  const title = dayGroupTitle(ctx.clock());
  return db.transaction('rw', db.spaces, db.groups, async () => {
    const space = await repos.spaces.ensureDefault();
    const existing = (await repos.groups.listBySpace(space.id)).find((g) => g.title === title);
    return (
      existing ?? repos.groups.create({ spaceId: space.id, title, color: 'grey', state: 'stowed' })
    );
  });
}

/** The Chrome tab a command is about: the given one, or the active tab of the current window. */
async function targetTab(ctx: BackgroundContext, chromeTabId?: number): Promise<BrowserTab> {
  const { api } = ctx;
  const tab =
    chromeTabId !== undefined
      ? await api.getTab(chromeTabId)
      : (await api.queryTabs({ windowId: await api.getCurrentWindowId() })).find((t) => t.active);
  if (!tab) throw new CommandError('tab-not-found', 'The tab is closed');
  return tab;
}

/** The group the tab is in, as mirrored in the database. */
async function groupOf(ctx: BackgroundContext, tab: BrowserTab): Promise<TabGroup | undefined> {
  return tab.groupId === NO_GROUP ? undefined : syncGroup(ctx, tab.groupId);
}

/** «Убрать в TabFlow»: the whole group of the tab, or the tab alone into the day group. */
export async function stowCurrent(
  ctx: BackgroundContext,
  chromeTabId?: number,
): Promise<CommandResult> {
  const tab = await targetTab(ctx, chromeTabId);
  const group = await groupOf(ctx, tab);
  if (group) return { ...(await stowGroup(ctx, group.id)), groupTitle: group.title };
  requireSaveable(tab); // before the day group is created
  return saveOpenTab(ctx, tab, await dayGroup(ctx));
}

function requireSaveable(tab: BrowserTab): void {
  if (!isSaveableTab(tab)) {
    throw new CommandError('tab-not-saveable', 'Pinned tabs and browser pages stay open');
  }
}

/** «Усыпить группу» of the tab. */
export async function sleepCurrent(
  ctx: BackgroundContext,
  chromeTabId?: number,
): Promise<CommandResult> {
  const group = await groupOf(ctx, await targetTab(ctx, chromeTabId));
  if (!group) throw new CommandError('tab-not-in-group', 'The tab is not in a group');
  return { ...(await sleepGroup(ctx, group.id)), groupTitle: group.title };
}

/** «Усыпить неактивные»: every active group whose tabs are not shown in any window. */
export async function sleepInactive(ctx: BackgroundContext): Promise<CommandResult> {
  const { api, repos } = ctx;
  const shown = new Set(
    (await api.queryTabs({})).filter((tab) => tab.active).map((tab) => tab.groupId),
  );
  const total = result({});
  for (const group of await repos.groups.listAll()) {
    if (!isSleepable(group, shown)) continue;
    try {
      const slept = await sleepGroup(ctx, group.id);
      total.groups += slept.groups;
      total.tabs += slept.tabs;
      total.failed += slept.failed;
    } catch {
      // Closed meanwhile: the mirror has stowed it.
    }
  }
  return total;
}

/**
 * «Убрать выделенные»: the tabs selected in the current window (Ctrl+click, Shift+click) become
 * one new stowed group in «Входящие», titled like the group of «Свернуть всё». Selected links of
 * other groups move into it; a group left without links goes to the trash, as with `moveTab`.
 * Pinned tabs and browser pages stay open; a repeated URL is saved once.
 */
export async function stowSelected(ctx: BackgroundContext): Promise<CommandResult> {
  const { api, db, repos } = ctx;
  const windowId = await api.getCurrentWindowId();
  const selected = (await api.queryTabs({ windowId })).filter(
    (tab) => tab.highlighted && isSaveableTab(tab),
  );
  const { unique } = splitDuplicates(selected, (tab) => tab.url);
  if (unique.length === 0) {
    throw new CommandError('tab-not-saveable', 'Pinned tabs and browser pages stay open');
  }
  const keep = new Set(unique);
  const title = collapsedGroupTitle(ctx.clock());

  // 1. Database.
  const emptied: TabGroup[] = [];
  const groupId = await db.transaction('rw', db.spaces, db.groups, db.tabs, async () => {
    const space = await repos.spaces.ensureDefault();
    const group = await repos.groups.create({
      spaceId: space.id,
      title,
      color: 'grey',
      state: 'stowed',
    });
    const sources = new Set<Id>();
    for (const tab of selected) {
      const link = await repos.tabs.findByChromeTabId(tab.id);
      if (link) {
        sources.add(link.groupId);
        if (keep.has(tab)) {
          await repos.tabs.move(link.id, group.id);
          await repos.tabs.update(link.id, { chromeTabId: undefined });
        } else {
          await repos.tabs.forget(link.id); // a duplicate
        }
      } else if (keep.has(tab)) {
        await repos.tabs.addMany(group.id, [
          { url: tab.url, title: tab.title, favIconUrl: tab.favIconUrl },
        ]);
      }
    }
    for (const sourceId of sources) {
      const source = await repos.groups.get(sourceId);
      if (!source || (await repos.tabs.listByGroup(sourceId)).length > 0) continue;
      // Stowed first: the mirror no longer follows its native group, which is about to go.
      if (source.chromeGroupId !== undefined) await repos.groups.setState(source.id, 'stowed');
      await repos.groups.remove(source.id);
      emptied.push(source);
    }
    return group.id;
  });

  // 2. The tab strip: the selected tabs close; browser pages left in an emptied native group
  //    leave it, so it is not mirrored again.
  await closeTabs(
    ctx,
    selected.map((tab) => tab.id),
  );
  for (const source of emptied) {
    if (source.chromeGroupId === undefined) continue;
    const left = await api.queryTabs({ groupId: source.chromeGroupId });
    if (left.length > 0) await api.ungroupTabs(left.map((tab) => tab.id));
  }
  return result({ groups: 1, tabs: unique.length, closedGroupIds: [groupId], groupTitle: title });
}

/** «В группу ▸» for the page: the open tab goes into the chosen group. */
export async function saveToGroup(
  ctx: BackgroundContext,
  chromeTabId: number,
  groupId: Id,
): Promise<CommandResult> {
  const target = await requireGroup(ctx, groupId);
  return saveOpenTab(ctx, await targetTab(ctx, chromeTabId), target);
}

/**
 * Saves an open tab into `target`. A tab that is a link of another group moves like «Перенести в
 * группу»; a tab outside groups becomes a new link — closed when `target` is stowed, moved into
 * its native group when it is on the tab strip. A URL the group already has is not saved twice.
 */
async function saveOpenTab(
  ctx: BackgroundContext,
  tab: BrowserTab,
  target: TabGroup,
): Promise<CommandResult> {
  const { repos } = ctx;
  requireSaveable(tab);
  const groupTitle = target.title;
  const links = await repos.tabs.listByGroup(target.id);

  const link = await repos.tabs.findByChromeTabId(tab.id);
  if (link) {
    if (link.groupId === target.id) return result({ tabs: 1, groupTitle });
    return { ...(await moveTab(ctx, link.id, target.id, links.length)), groupTitle };
  }

  const onStrip = target.chromeGroupId !== undefined && target.windowId !== undefined;
  const url = normalizeUrl(tab.url);
  const duplicate = links.some((item) => normalizeUrl(item.url) === url);

  // 1. Database.
  const [saved] = duplicate
    ? []
    : await repos.tabs.addMany(target.id, [
        {
          url: tab.url,
          title: tab.title,
          favIconUrl: tab.favIconUrl,
          chromeTabId: onStrip ? tab.id : undefined,
        },
      ]);

  // 2. The tab strip. A duplicate is closed like a duplicate of «Свернуть всё».
  if (onStrip && saved) await moveIntoGroup(ctx, target, saved.id, tab.id);
  else await closeTabs(ctx, [tab.id]);
  return result({ tabs: 1, groupTitle });
}

/**
 * Saves a link without opening it: into `groupId`, or the day group. In a group on the tab strip
 * the link opens as a background tab of it — a link there always has its tab.
 */
export async function saveLink(
  ctx: BackgroundContext,
  url: string,
  title?: string,
  groupId?: Id,
): Promise<CommandResult> {
  const { repos } = ctx;
  if (!isSaveableUrl(url)) {
    throw new CommandError('tab-not-saveable', 'Only web pages and files are saved');
  }
  const target = groupId !== undefined ? await requireGroup(ctx, groupId) : await dayGroup(ctx);
  const groupTitle = target.title;

  const normalized = normalizeUrl(url);
  const links = await repos.tabs.listByGroup(target.id);
  if (links.some((item) => normalizeUrl(item.url) === normalized)) {
    return result({ groupTitle }); // already there
  }

  const [saved] = await repos.tabs.addMany(target.id, [{ url, title: title?.trim() || url }]);
  let failed = 0;
  if (saved && target.chromeGroupId !== undefined) {
    failed = (await openInGroup(ctx, target, saved.id, url)) ? 0 : 1;
  }
  return result({ tabs: 1, failed, groupTitle });
}

/** Shows the main TabFlow page in the current window. */
export async function openApp(ctx: BackgroundContext): Promise<CommandResult> {
  await openAppPageIn(ctx, await ctx.api.getCurrentWindowId());
  return result({});
}
