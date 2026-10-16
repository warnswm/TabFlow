/**
 * «Свернуть всё» for the current window:
 * - every native group is stowed on its own, keeping its title and color;
 * - tabs outside groups (the current one included) go into one new stowed group in «Входящие»;
 * - pinned tabs and browser pages stay open; duplicate URLs are saved once per group;
 * - the main TabFlow page opens, then the saved tabs are closed.
 */
import { NO_GROUP } from '../browser-api';
import type { Timestamp } from '../db';
import type { CommandResult } from '../messages';
import type { BackgroundContext } from './context';
import { closeTabs, openAppPageIn, result, stowInDb } from './group-actions';
import { isSaveableTab, splitDuplicates } from './tab-rules';

const MONTHS_RU = [
  'янв',
  'фев',
  'мар',
  'апр',
  'мая',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

/** Title of the group made from loose tabs: «16 окт, 23:40» (local time). */
export function collapsedGroupTitle(time: Timestamp): string {
  const date = new Date(time);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${date.getDate()} ${MONTHS_RU[date.getMonth()]}, ${hh}:${mm}`;
}

export async function collapseAll(ctx: BackgroundContext): Promise<CommandResult> {
  const { api, db, repos } = ctx;
  const windowId = await api.getCurrentWindowId();
  const tabs = await api.queryTabs({ windowId });

  const closeIds: number[] = [];
  const ungroupIds: number[] = [];
  let groups = 0;
  let saved = 0;

  // 1. Native groups: each stowed on its own (database first).
  for (const chromeGroupId of new Set(tabs.map((tab) => tab.groupId))) {
    if (chromeGroupId === NO_GROUP) continue;
    const plan = await stowInDb(ctx, chromeGroupId);
    closeIds.push(...plan.closeIds);
    ungroupIds.push(...plan.ungroupIds);
    if (plan.saved > 0) {
      groups++;
      saved += plan.saved;
    }
  }

  // 2. Tabs outside groups: one new stowed group.
  const loose = tabs.filter((tab) => tab.groupId === NO_GROUP && isSaveableTab(tab));
  const { unique } = splitDuplicates(loose, (tab) => tab.url);
  if (unique.length > 0) {
    await db.transaction('rw', db.spaces, db.groups, db.tabs, async () => {
      const space = await repos.spaces.ensureDefault();
      const group = await repos.groups.create({
        spaceId: space.id,
        title: collapsedGroupTitle(ctx.clock()),
        color: 'grey',
        state: 'stowed',
      });
      await repos.tabs.addMany(
        group.id,
        unique.map((tab) => ({ url: tab.url, title: tab.title, favIconUrl: tab.favIconUrl })),
      );
    });
    closeIds.push(...loose.map((tab) => tab.id));
    groups++;
    saved += unique.length;
  }

  if (closeIds.length === 0 && ungroupIds.length === 0) return result({});

  // 3. Everything is written: show the main page, then close the tabs.
  await openAppPageIn(ctx, windowId);
  await closeTabs(ctx, closeIds, ungroupIds);
  return result({ groups, tabs: saved });
}
