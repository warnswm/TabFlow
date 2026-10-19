/**
 * What the main page shows: spaces with their groups and links, plus the sidebar numbers.
 * Built from plain records so it can be tested without a database.
 */
import type { Repositories } from '../db';
import type { GroupState, Id, SavedTab, Space, TabGroup } from '../db/models';
import { getLanguage } from '../i18n';

export interface GroupView {
  group: TabGroup;
  tabs: SavedTab[];
}

export interface SpaceView {
  space: Space;
  groups: GroupView[];
  tabCount: number;
}

export interface Overview {
  /** Spaces in sidebar order, «Входящие» first. */
  spaces: SpaceView[];
  /** Groups by state, all spaces together. */
  groupsByState: Record<GroupState, number>;
  /** Tabs of sleeping and stowed groups: saved, but not loaded in memory. */
  tabsOutOfMemory: number;
  tabCount: number;
}

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;

export function buildOverview(
  spaces: readonly Space[],
  groups: readonly TabGroup[],
  tabs: readonly SavedTab[],
): Overview {
  const tabsByGroup = new Map<Id, SavedTab[]>();
  for (const tab of [...tabs].sort(byOrder)) {
    const list = tabsByGroup.get(tab.groupId);
    if (list) list.push(tab);
    else tabsByGroup.set(tab.groupId, [tab]);
  }

  const ordered = [...spaces].sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault) || a.order - b.order,
  );
  const views = new Map<Id, SpaceView>(
    ordered.map((space) => [space.id, { space, groups: [], tabCount: 0 }]),
  );
  // A group whose space is gone (should not happen) still shows up, in «Входящие».
  const fallback = ordered[0] && views.get(ordered[0].id);

  const overview: Overview = {
    spaces: [...views.values()],
    groupsByState: { active: 0, asleep: 0, stowed: 0 },
    tabsOutOfMemory: 0,
    tabCount: 0,
  };

  for (const group of [...groups].sort(byOrder)) {
    const view = views.get(group.spaceId) ?? fallback;
    if (!view) continue;
    const groupTabs = tabsByGroup.get(group.id) ?? [];
    view.groups.push({ group, tabs: groupTabs });
    view.tabCount += groupTabs.length;
    overview.groupsByState[group.state]++;
    overview.tabCount += groupTabs.length;
    if (group.state !== 'active') overview.tabsOutOfMemory += groupTabs.length;
  }
  return overview;
}

/** Reads everything the overview needs; pass to `useLiveQuery` through a stable function. */
export async function loadOverview(repos: Repositories): Promise<Overview> {
  const [spaces, groups, tabs] = await Promise.all([
    repos.spaces.list(),
    repos.groups.listAll(),
    repos.tabs.listAll(),
  ]);
  return buildOverview(spaces, groups, tabs);
}

/** The host shown under a site in the preview: `www.` dropped. */
export function displayHost(url: string): string {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol === 'file:') return getLanguage() === 'ru' ? 'файл' : 'file';
    return hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
