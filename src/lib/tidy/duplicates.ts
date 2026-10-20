/**
 * Duplicates: open tabs of one page (all windows) and links to one page in TabFlow groups.
 * Pages are compared by `urlKey` (no `#anchor`, no tracking parameters, a YouTube video by its id).
 * Pure: the page builds the preview with it, the background finds the same sets again before
 * closing anything, so a stale preview cannot close the wrong tab.
 *
 * Which one stays:
 * - open tabs — the one on screen, then a pinned one, then a tab of a TabFlow group, then the one
 *   further into a YouTube video (`&t=`), then the one used last. Tabs on screen and pinned tabs
 *   are never closed;
 * - links — the one whose tab is open, otherwise the oldest; links with an open tab are never
 *   removed here (the tabs are compared above).
 */
import type { BrowserTab } from '../browser-api';
import type { Id, SavedTab, TabGroup } from '../db/models';
import { isSaveableUrl, urlKey, youtubeStartSec } from '../background/tab-rules';

/** The TabFlow group a tab or link belongs to. */
export interface DuplicateGroup {
  linkId: Id;
  groupId: Id;
  groupTitle: string;
}

export type DuplicateItem =
  | {
      kind: 'tab';
      chromeTabId: number;
      windowId: number;
      url: string;
      title: string;
      /** The tab is a link of a TabFlow group. */
      link?: DuplicateGroup;
    }
  | ({ kind: 'link'; url: string; title: string } & DuplicateGroup);

export interface DuplicateSet {
  /** `tab:<urlKey>` or `link:<urlKey>` — the same in the preview and in the command. */
  key: string;
  keep: DuplicateItem;
  /** Closed (tabs) or moved to the trash (links). */
  extras: DuplicateItem[];
}

export interface Duplicates {
  tabs: DuplicateSet[];
  links: DuplicateSet[];
}

export function findDuplicates(
  openTabs: readonly BrowserTab[],
  groups: readonly TabGroup[],
  links: readonly SavedTab[],
): Duplicates {
  const groupTitles = new Map(groups.map((group) => [group.id, group.title]));
  const liveLinks = links.filter((link) => groupTitles.has(link.groupId));
  const linkOfTab = new Map<number, SavedTab>();
  for (const link of liveLinks) {
    if (link.chromeTabId !== undefined) linkOfTab.set(link.chromeTabId, link);
  }
  const groupOf = (link: SavedTab): DuplicateGroup => ({
    linkId: link.id,
    groupId: link.groupId,
    groupTitle: groupTitles.get(link.groupId) ?? '',
  });

  // 1. Open tabs.
  const tabSets: DuplicateSet[] = [];
  const closing = new Set<number>();
  const pages = groupBy(
    openTabs.filter((tab) => isSaveableUrl(tab.url)),
    (tab) => urlKey(tab.url),
  );
  for (const [key, tabs] of pages) {
    if (tabs.length < 2) continue;
    const [keep, ...rest] = [...tabs].sort(
      (a, b) =>
        tabRank(b, linkOfTab) - tabRank(a, linkOfTab) ||
        b.lastAccessed - a.lastAccessed ||
        a.id - b.id,
    );
    if (!keep) continue;
    const extras = rest.filter((tab) => !tab.active && !tab.pinned);
    if (extras.length === 0) continue;
    for (const tab of extras) closing.add(tab.id);
    const item = (tab: BrowserTab): DuplicateItem => {
      const link = linkOfTab.get(tab.id);
      return {
        kind: 'tab',
        chromeTabId: tab.id,
        windowId: tab.windowId,
        url: tab.url,
        title: tab.title,
        ...(link && { link: groupOf(link) }),
      };
    };
    tabSets.push({ key: `tab:${key}`, keep: item(keep), extras: extras.map(item) });
  }

  // 2. Links of TabFlow groups (mostly stowed ones: links of open groups are their tabs).
  const openIds = new Set(openTabs.map((tab) => tab.id));
  const isOpen = (link: SavedTab) =>
    link.chromeTabId !== undefined && openIds.has(link.chromeTabId);
  const linkSets: DuplicateSet[] = [];
  const saved = groupBy(
    liveLinks.filter((link) => link.chromeTabId === undefined || !closing.has(link.chromeTabId)),
    (link) => urlKey(link.url),
  );
  for (const [key, same] of saved) {
    if (same.length < 2) continue;
    const [keep, ...rest] = [...same].sort(
      (a, b) =>
        Number(isOpen(b)) - Number(isOpen(a)) || a.createdAt - b.createdAt || a.order - b.order,
    );
    if (!keep) continue;
    const extras = rest.filter((link) => !isOpen(link));
    if (extras.length === 0) continue;
    const item = (link: SavedTab): DuplicateItem => ({
      kind: 'link',
      url: link.url,
      title: link.title,
      ...groupOf(link),
    });
    linkSets.push({ key: `link:${key}`, keep: item(keep), extras: extras.map(item) });
  }

  return { tabs: tabSets, links: linkSets };
}

/** How many tabs would close and how many links would go to the trash. */
export function duplicateCounts(duplicates: Duplicates): { tabs: number; links: number } {
  const count = (sets: readonly DuplicateSet[]) =>
    sets.reduce((sum, set) => sum + set.extras.length, 0);
  return { tabs: count(duplicates.tabs), links: count(duplicates.links) };
}

/** Bigger — rather kept: on screen, pinned, in a TabFlow group, further into a video. */
function tabRank(tab: BrowserTab, linkOfTab: ReadonlyMap<number, SavedTab>): number {
  return (
    (tab.active ? 4e9 : 0) +
    (tab.pinned ? 2e9 : 0) +
    (linkOfTab.has(tab.id) ? 1e9 : 0) +
    Math.min(youtubeStartSec(tab.url), 1e8)
  );
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}
