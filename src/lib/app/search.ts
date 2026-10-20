/**
 * Full-text search over groups (title, note) and saved links (title, note, host and path of the URL).
 * Prefix and typo-tolerant, case- and «ё»-insensitive. The index lives in memory and is rebuilt
 * from the overview whenever the database changes — a few thousand records take milliseconds.
 */
import MiniSearch from 'minisearch';
import type { Id } from '../db/models';
import { displayHost, type Overview } from './overview';

interface SearchDoc {
  id: string;
  kind: 'group' | 'tab';
  /** The group itself, or the group of the link. */
  groupId: Id;
  /** The link (tabs only). */
  tabId?: Id;
  spaceId: Id;
  title: string;
  host: string;
  path: string;
  /** «Зачем отложил». */
  note: string;
}

export interface GroupHit {
  groupId: Id;
  spaceId: Id;
}

export interface TabHit {
  tabId: Id;
  groupId: Id;
  spaceId: Id;
}

export interface SearchHits {
  /** Groups whose title or note matches, best first. */
  groups: GroupHit[];
  /** Links whose title, note or address matches, best first. */
  tabs: TabHit[];
  /** Words of the records that matched — for highlighting. */
  terms: string[];
}

export interface SearchIndex {
  /** `undefined` for an empty query. `spaceId` limits the search to one space. */
  search(query: string, spaceId?: Id): SearchHits | undefined;
}

/** Lower case, «ё» as «е»: «Ёлка» finds «елка» and back. Keeps the length of the text. */
export function normalizeText(text: string): string {
  return text.toLowerCase().replaceAll('ё', 'е');
}

function urlPath(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return '';
  }
}

export function buildSearchIndex(overview: Overview): SearchIndex {
  const index = new MiniSearch<SearchDoc>({
    fields: ['title', 'note', 'host', 'path'],
    storeFields: ['kind', 'groupId', 'tabId', 'spaceId'],
    processTerm: (term) => normalizeText(term),
    searchOptions: {
      prefix: true,
      // Short words must match exactly, longer ones may have a typo.
      fuzzy: (term) => (term.length > 3 ? 0.2 : false),
      boost: { title: 2 },
      combineWith: 'AND',
    },
  });

  const docs: SearchDoc[] = [];
  for (const { space, groups } of overview.spaces) {
    for (const { group, tabs } of groups) {
      docs.push({
        id: `g:${group.id}`,
        kind: 'group',
        groupId: group.id,
        spaceId: space.id,
        title: group.title,
        host: '',
        path: '',
        note: group.note ?? '',
      });
      for (const tab of tabs) {
        docs.push({
          id: `t:${tab.id}`,
          kind: 'tab',
          groupId: group.id,
          tabId: tab.id,
          spaceId: space.id,
          title: tab.title,
          host: displayHost(tab.url),
          path: urlPath(tab.url),
          note: tab.note ?? '',
        });
      }
    }
  }
  index.addAll(docs);

  return {
    search(query, spaceId) {
      if (query.trim() === '') return undefined;
      const results = index.search(query, {
        filter: spaceId === undefined ? undefined : (result) => result.spaceId === spaceId,
      });
      const hits: SearchHits = { groups: [], tabs: [], terms: [] };
      const terms = new Set<string>();
      for (const result of results) {
        for (const term of result.terms) terms.add(term);
        const doc = result as unknown as Pick<SearchDoc, 'kind' | 'groupId' | 'tabId' | 'spaceId'>;
        if (doc.kind === 'group') {
          hits.groups.push({ groupId: doc.groupId, spaceId: doc.spaceId });
        } else if (doc.tabId !== undefined) {
          hits.tabs.push({ tabId: doc.tabId, groupId: doc.groupId, spaceId: doc.spaceId });
        }
      }
      hits.terms = [...terms];
      return hits;
    },
  };
}

/** How a group matched a search: by its title and/or by some of its links. */
export interface GroupMatch {
  title: boolean;
  tabIds: Set<Id>;
}

/** Groups that matched, by id: a group matches by its title or by any of its links. */
export function matchesByGroup(hits: SearchHits): Map<Id, GroupMatch> {
  const matches = new Map<Id, GroupMatch>();
  const get = (groupId: Id) => {
    let match = matches.get(groupId);
    if (!match) {
      match = { title: false, tabIds: new Set() };
      matches.set(groupId, match);
    }
    return match;
  };
  for (const hit of hits.groups) get(hit.groupId).title = true;
  for (const hit of hits.tabs) get(hit.groupId).tabIds.add(hit.tabId);
  return matches;
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

export interface TextPart {
  text: string;
  hit: boolean;
}

/** Splits `text` into parts, marking every occurrence of the matched words. */
export function highlight(text: string, terms: readonly string[]): TextPart[] {
  const normalized = normalizeText(text);
  // Lower-casing changes the length of a few rare letters: then there is nothing to mark safely.
  if (terms.length === 0 || normalized.length !== text.length) return [{ text, hit: false }];

  const marked = new Array<boolean>(text.length).fill(false);
  for (const term of terms) {
    if (term === '') continue;
    for (let at = normalized.indexOf(term); at !== -1; at = normalized.indexOf(term, at + 1)) {
      // Matched words are whole words of the text: skip occurrences inside other words.
      if (at > 0 && WORD_CHAR.test(normalized.charAt(at - 1))) continue;
      marked.fill(true, at, at + term.length);
    }
  }

  const parts: TextPart[] = [];
  for (let i = 0; i < text.length;) {
    const hit = marked[i] ?? false;
    let end = i;
    while (end < text.length && (marked[end] ?? false) === hit) end++;
    parts.push({ text: text.slice(i, end), hit });
    i = end;
  }
  return parts.length > 0 ? parts : [{ text, hit: false }];
}
