/**
 * The dialog «Рядом» on the main page: links of all groups to pick 2–4 from, in the order they
 * were picked (it is the order of the windows, see `tiling/layout.ts`).
 */
import type { Id, LayoutLink, SavedTab, Space, TabGroup } from '../db/models';
import { MAX_TILES } from '../tiling/layout';
import type { Overview } from './overview';
import type { SearchIndex } from './search';

export interface PickerGroup {
  group: TabGroup;
  space: Space;
  tabs: SavedTab[];
}

/**
 * Groups with links to pick from, in the order of spaces and tiles. With a query — only the
 * matching links (a group whose title matches keeps all of them); without — every link.
 */
export function pickerGroups(overview: Overview, index: SearchIndex, query: string): PickerGroup[] {
  const hits = index.search(query);
  const tabIds = hits && new Set(hits.tabs.map((hit) => hit.tabId));
  const groupIds = hits && new Set(hits.groups.map((hit) => hit.groupId));
  const result: PickerGroup[] = [];
  for (const { space, groups } of overview.spaces) {
    for (const { group, tabs } of groups) {
      const shown =
        !tabIds || groupIds?.has(group.id) ? tabs : tabs.filter((tab) => tabIds.has(tab.id));
      if (shown.length > 0) result.push({ group, space, tabs: shown });
    }
  }
  return result;
}

/** Picks a link (at the end) or drops it; at most four. */
export function togglePick(picked: readonly Id[], id: Id): Id[] {
  if (picked.includes(id)) return picked.filter((item) => item !== id);
  return picked.length >= MAX_TILES ? [...picked] : [...picked, id];
}

/** Picked links still saved (a link may be deleted while the dialog is open). */
export function pickedLinks(overview: Overview, picked: readonly Id[]): SavedTab[] {
  const tabs = new Map<Id, SavedTab>();
  for (const { groups } of overview.spaces) {
    for (const { tabs: groupTabs } of groups) for (const tab of groupTabs) tabs.set(tab.id, tab);
  }
  return picked.map((id) => tabs.get(id)).filter((tab) => tab !== undefined);
}

export function toLayoutLinks(tabs: readonly SavedTab[]): LayoutLink[] {
  return tabs.map(({ id, url, title }) => ({ tabId: id, url, title }));
}

const NAME_PART = 24;

/** A name for a new layout: «Документация React + MDN + 1». */
export function defaultLayoutName(tabs: readonly Pick<SavedTab, 'title' | 'url'>[]): string {
  const short = (tab: Pick<SavedTab, 'title' | 'url'>) => {
    const title = tab.title.trim() || tab.url;
    return title.length > NAME_PART ? `${title.slice(0, NAME_PART - 1).trimEnd()}…` : title;
  };
  const [first, second, ...rest] = tabs;
  if (!first) return '';
  const head = second ? `${short(first)} + ${short(second)}` : short(first);
  return rest.length > 0 ? `${head} + ${rest.length}` : head;
}

/** A pane of the viewer: a saved link, or the saved address of a layout link that is gone. */
export interface ViewerPane {
  /** Stable key for the list. */
  key: string;
  /** The link, while it is saved. */
  link?: SavedTab;
  url: string;
  title: string;
}

/** Panes for the links of `#/side/…`, in order; links deleted meanwhile are skipped. */
export function linkPanes(overview: Overview, tabIds: readonly Id[]): ViewerPane[] {
  return pickedLinks(overview, tabIds).map((link) => ({
    key: link.id,
    link,
    url: link.url,
    title: link.title,
  }));
}

/** Panes of a saved layout: its links as they are now, a link that is gone by its saved copy. */
export function layoutPanes(overview: Overview, links: readonly LayoutLink[]): ViewerPane[] {
  const live = pickedLinks(
    overview,
    links.map((link) => link.tabId),
  );
  return links.map((saved, i) => {
    const link = live.find((tab) => tab.id === saved.tabId);
    return link
      ? { key: `${i}:${link.id}`, link, url: link.url, title: link.title }
      : { key: `${i}:${saved.tabId}`, url: saved.url, title: saved.title };
  });
}
