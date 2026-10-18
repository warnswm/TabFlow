/**
 * The dialog «Рядом» on the main page and its viewer: links of all groups and open tabs outside
 * TabFlow to pick 2–9 from, in the order they were picked (it is the order of the panes, see
 * `tiling/layout.ts`).
 *
 * A picked item is a key: the id of a saved link, or `u:<address>` of an open tab outside TabFlow
 * (its id changes when it is unloaded, the address does not).
 */
import type { Id, LayoutLink, SavedTab, Space, TabGroup } from '../db/models';
import { MAX_TILES } from '../tiling/layout';
import { displayHost, type Overview } from './overview';
import { normalizeText, type SearchIndex } from './search';

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

/** An open Chrome tab, as much as the picker needs (see `BrowserTab`). */
export interface PageTab {
  id: number;
  url: string;
  title: string;
  /** Native group id, -1 outside groups. */
  groupId: number;
  placeholder: boolean;
}

/** `tabGroups.TAB_GROUP_ID_NONE`. */
const NO_GROUP_ID = -1;
const SITE = /^https?:\/\//;
const WORDS = /[\p{L}\p{N}]+/gu;

const PAGE_PREFIX = 'u:';

/** The key of an open tab outside TabFlow. */
export const pageKey = (url: string) => `${PAGE_PREFIX}${url}`;

/** The address of an open tab's key; `undefined` for the key of a saved link. */
export function pageKeyUrl(key: string): string | undefined {
  return key.startsWith(PAGE_PREFIX) ? key.slice(PAGE_PREFIX.length) : undefined;
}

/**
 * Open tabs outside native groups — tabs in groups are TabFlow's groups already. Sites only,
 * one tab per address, matching every word of the query in the title or the address.
 */
export function openPages(tabs: readonly PageTab[], query: string): PageTab[] {
  const words = normalizeText(query).match(WORDS) ?? [];
  const seen = new Set<string>();
  return tabs.filter((tab) => {
    if (tab.groupId !== NO_GROUP_ID || tab.placeholder || !SITE.test(tab.url)) return false;
    if (seen.has(tab.url)) return false;
    seen.add(tab.url);
    const text = normalizeText(`${tab.title} ${tab.url}`);
    return words.every((word) => text.includes(word));
  });
}

/** Picks an item (at the end) or drops it; at most four. */
export function togglePick(
  picked: readonly string[],
  key: string,
  limit: number = MAX_TILES,
): string[] {
  if (picked.includes(key)) return picked.filter((item) => item !== key);
  return picked.length >= limit ? [...picked] : [...picked, key];
}

/**
 * The panes of `#/side/…` after «Добавить»: the panes still shown (closed ones are dropped, they
 * would take the room), then the added ones; no repeats, at most nine.
 */
export function withAdded(
  keys: readonly string[],
  closed: ReadonlySet<string>,
  added: readonly string[],
): string[] {
  const shown = keys.filter((key) => !closed.has(key));
  return [...new Set([...shown, ...added])].slice(0, MAX_TILES);
}

/** A picked item, also a pane of the viewer. */
export interface PickedItem {
  key: string;
  url: string;
  title: string;
  /** The saved link, while it is saved. */
  link?: SavedTab;
  /** The open tab outside TabFlow, while it is open. */
  chromeTabId?: number;
}

function linksById(overview: Overview): Map<Id, SavedTab> {
  const links = new Map<Id, SavedTab>();
  for (const { groups } of overview.spaces) {
    for (const { tabs } of groups) for (const tab of tabs) links.set(tab.id, tab);
  }
  return links;
}

/**
 * Picked items in the picked order: saved links (a link deleted meanwhile is skipped) and open
 * tabs by their address (titled by the open tab, else by the site).
 */
export function pickedItems(
  overview: Overview,
  pages: readonly PageTab[],
  keys: readonly string[],
): PickedItem[] {
  const links = linksById(overview);
  const items: PickedItem[] = [];
  for (const key of keys) {
    const url = pageKeyUrl(key);
    if (url !== undefined) {
      const page = pages.find((tab) => tab.url === url);
      items.push({ key, url, title: page?.title || displayHost(url), chromeTabId: page?.id });
      continue;
    }
    const link = links.get(key);
    if (link) items.push({ key, url: link.url, title: link.title, link });
  }
  return items;
}

export function toLayoutLinks(items: readonly PickedItem[]): LayoutLink[] {
  return items.map(({ link, url, title }) =>
    link ? { tabId: link.id, url, title } : { url, title },
  );
}

/** Panes of a saved layout: its links as they are now, a link that is gone by its saved copy. */
export function layoutPanes(overview: Overview, links: readonly LayoutLink[]): PickedItem[] {
  const live = linksById(overview);
  return links.map((saved, i) => {
    const link = saved.tabId === undefined ? undefined : live.get(saved.tabId);
    return link
      ? { key: `${i}:${link.id}`, link, url: link.url, title: link.title }
      : { key: `${i}:${saved.url}`, url: saved.url, title: saved.title };
  });
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
