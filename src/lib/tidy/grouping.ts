/**
 * «Разложить вкладки»: tabs outside groups in a window are sorted into new native groups — by topic
 * (own topics from the settings, then the dictionary `topics.ts`, then the site) or by site.
 * A group gets at least two tabs; a group already on the tab strip with the same title gets the
 * new tabs instead of a twin. Pure: the page shows the plan, the background carries it out.
 */
import { isSaveableUrl } from '../background/tab-rules';
import { NO_GROUP } from '../browser-api';
import { GROUP_COLORS, type GroupColor } from '../db/models';
import type { Language } from '../i18n';
import { siteDomain } from '../queue/site-access';
import { TOPICS, type Topic } from './topics';

export const GROUPING_MODES = ['topic', 'site'] as const;
export type GroupingMode = (typeof GROUPING_MODES)[number];

export interface GroupingTab {
  id: number;
  url: string;
  title: string;
}

/** A native group of the window that may receive tabs of the same title. */
export interface ExistingGroup {
  id: number;
  title: string;
  color: GroupColor;
}

export interface PlannedGroup {
  title: string;
  color: GroupColor;
  tabIds: number[];
  /** The tabs join this native group instead of a new one. */
  joinChromeGroupId?: number;
}

/** An own topic from the settings: «Работа: jira, confluence, corp.example.com». */
export interface UserTopic {
  name: string;
  /** Sites (contain a dot) and title words. */
  terms: string[];
}

/** What a tab was sorted into: a title and a color. */
export interface Placement {
  title: string;
  color: GroupColor;
}

const MAX_GROUPS = 12;

/** The plan: groups by size, at most 12; tabs that found no company stay where they are. */
export function planGrouping(
  tabs: readonly GroupingTab[],
  existing: readonly ExistingGroup[],
  place: (tab: GroupingTab) => Placement | undefined,
): PlannedGroup[] {
  const byTitle = new Map<string, PlannedGroup>();
  for (const tab of tabs) {
    const placement = place(tab);
    if (!placement) continue;
    const key = titleKey(placement.title);
    const planned = byTitle.get(key);
    if (planned) {
      planned.tabIds.push(tab.id);
      continue;
    }
    const join = existing.find((group) => titleKey(group.title) === key);
    byTitle.set(key, {
      title: join ? join.title : placement.title,
      color: join ? join.color : placement.color,
      tabIds: [tab.id],
      ...(join && { joinChromeGroupId: join.id }),
    });
  }
  return [...byTitle.values()]
    .filter((group) => group.tabIds.length >= 2 || group.joinChromeGroupId !== undefined)
    .sort((a, b) => b.tabIds.length - a.tabIds.length || (a.title < b.title ? -1 : 1))
    .slice(0, MAX_GROUPS);
}

/** Sorting by topic: own topics, then the dictionary, then the site. */
export function topicPlacer(
  rules: readonly UserTopic[],
  language: Language,
): (tab: GroupingTab) => Placement | undefined {
  return (tab) => {
    const words = titleWords(tab.title);
    const rule = rules.find((topic) =>
      topic.terms.some((term) => termMatches(term, tab.url, words)),
    );
    if (rule) return { title: rule.name, color: colorOf(rule.name) };
    const topic = dictionaryTopic(tab.url, words);
    if (topic) return { title: topic.name[language], color: topic.color };
    return sitePlacement(tab.url, language);
  };
}

/** Sorting by site. */
export function sitePlacer(language: Language): (tab: GroupingTab) => Placement | undefined {
  return (tab) => sitePlacement(tab.url, language);
}

/** The group of the site: `github.com`; local files go together. */
export function sitePlacement(url: string, language: Language): Placement | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol === 'file:') {
    const title = language === 'ru' ? 'Файлы' : 'Files';
    return { title, color: 'grey' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
  const site = siteDomain(parsed.hostname.replace(/^www\./, ''));
  return site ? { title: site, color: colorOf(site) } : undefined;
}

/** The dictionary topic of a page: by its site first, then by the most title words. */
export function dictionaryTopic(url: string, words: readonly string[]): Topic | undefined {
  const address = hostAndPath(url);
  if (!address) return undefined;
  const { host, path } = address;
  // The longest site wins: `vk.com/video` before `vk.com`, `music.yandex.ru` before `yandex.ru`.
  let best: { topic: Topic; length: number } | undefined;
  for (const topic of TOPICS) {
    for (const site of topic.sites) {
      if (siteMatches(site, host, path) && (!best || site.length > best.length)) {
        best = { topic, length: site.length };
      }
    }
  }
  if (best) return best.topic;

  let byWords: { topic: Topic; hits: number } | undefined;
  for (const topic of TOPICS) {
    const hits = topic.words.filter((stem) => words.some((word) => word.startsWith(stem))).length;
    if (hits > 0 && (!byWords || hits > byWords.hits)) byWords = { topic, hits };
  }
  return byWords?.topic;
}

/**
 * Own topics as typed in the settings, one per line: «Название: слово, сайт.ру». Lines without
 * a name or terms are skipped; terms are lower case.
 */
export function parseTopicRules(text: string): UserTopic[] {
  const topics: UserTopic[] = [];
  for (const line of text.split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const name = line.slice(0, colon).trim().slice(0, 60);
    const terms = line
      .slice(colon + 1)
      .split(',')
      .map((term) =>
        normalizeWord(term.trim())
          .replace(/^[a-z]+:\/\//, '')
          .replace(/^www\./, ''),
      )
      .filter((term) => term.length >= 2);
    if (name && terms.length > 0) topics.push({ name, terms: [...new Set(terms)] });
  }
  return topics;
}

/** Words of a title in lower case, `ё` → `е`. */
export function titleWords(title: string): string[] {
  return normalizeWord(title)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** A color for a group without a topic: the same name always gets the same color (not grey). */
export function colorOf(name: string): GroupColor {
  let hash = 0;
  for (const char of titleKey(name)) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  const colors = GROUP_COLORS.filter((color) => color !== 'grey');
  return colors[hash % colors.length] ?? 'blue';
}

/** Titles compared without case, spaces around and the difference of `ё` and `е`. */
export function titleKey(title: string): string {
  return normalizeWord(title.trim());
}

function normalizeWord(text: string): string {
  return text.toLowerCase().replaceAll('ё', 'е');
}

function siteMatches(site: string, host: string, path: string): boolean {
  const slash = site.indexOf('/');
  const domain = slash < 0 ? site : site.slice(0, slash);
  const prefix = slash < 0 ? '' : site.slice(slash);
  return (host === domain || host.endsWith(`.${domain}`)) && path.startsWith(prefix);
}

/** An own term: a site (has a dot) — by the address; a word — by a title word or the address. */
function termMatches(term: string, url: string, words: readonly string[]): boolean {
  const address = hostAndPath(url);
  if (!address) return false;
  if (term.includes('.')) return siteMatches(term, address.host, address.path);
  return words.some((word) => word.startsWith(term)) || address.host.split('.').includes(term);
}

/** The host without `www.` and the path of a URL; `undefined` for a broken one. */
function hostAndPath(url: string): { host: string; path: string } | undefined {
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname.replace(/^www\./, ''), path: parsed.pathname };
  } catch {
    return undefined;
  }
}

/** Tabs of the window that «Разложить» takes: outside groups, not pinned, sites and files only. */
export function groupableTabs(
  tabs: readonly {
    id: number;
    windowId: number;
    groupId: number;
    pinned: boolean;
    url: string;
    title: string;
  }[],
  windowId: number,
): GroupingTab[] {
  return tabs
    .filter(
      (tab) =>
        tab.windowId === windowId &&
        tab.groupId === NO_GROUP &&
        !tab.pinned &&
        isSaveableUrl(tab.url),
    )
    .map(({ id, url, title }) => ({ id, url, title }));
}
