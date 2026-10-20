/**
 * Contents of the command palette (Ctrl+K): groups and links found in all spaces,
 * and actions — fixed ones plus actions with the best found group.
 */
import type { GroupState, Id, SavedTab, Space, TabGroup } from '../db/models';
import { localized } from '../i18n';
import { words } from '../i18n/words';
import type { Overview } from './overview';
import { normalizeText, type SearchIndex } from './search';

export const MAX_GROUPS = 5;
export const MAX_TABS = 8;

export type PaletteAction =
  | { type: 'collapseAll' }
  | { type: 'openTrash' }
  /** «Порядок»: closing duplicates, sorting tabs into groups. */
  | { type: 'openTidy' }
  | { type: 'openReview' }
  | { type: 'newSpace' }
  | { type: 'goToSpace'; spaceId: Id }
  | { type: 'sleepGroup' | 'stowGroup' | 'restoreGroup'; group: TabGroup };

export interface PaletteGroup {
  group: TabGroup;
  space: Space;
  tabCount: number;
}

export interface PaletteTab {
  tab: SavedTab;
  group: TabGroup;
}

export interface PaletteActionItem {
  /** Stable key for the list. */
  id: string;
  label: string;
  action: PaletteAction;
}

export interface PaletteContents {
  groups: PaletteGroup[];
  tabs: PaletteTab[];
  actions: PaletteActionItem[];
  /** Matched words, for highlighting. */
  terms: string[];
}

const text = localized({
  ru: {
    sleep: (name: string) => `Усыпить группу ${name}`,
    stow: (name: string) => `Убрать группу ${name} в TabFlow`,
    wake: (name: string) => `Разбудить группу ${name}`,
    restore: (name: string) => `Вернуть группу ${name} на панель`,
    collapseAll: 'Свернуть всё',
    goTo: (name: string) => `Перейти в ${name}`,
    trash: 'Корзина',
    newSpace: 'Новое пространство',
    duplicates: 'Закрыть дубликаты',
    sortTabs: 'Разложить вкладки по группам',
    review: 'Давно не открывали — разобрать',
  },
  en: {
    sleep: (name: string) => `Put group ${name} to sleep`,
    stow: (name: string) => `Stow group ${name} in TabFlow`,
    wake: (name: string) => `Wake group ${name}`,
    restore: (name: string) => `Restore group ${name} to the tab strip`,
    collapseAll: 'Collapse all',
    goTo: (name: string) => `Go to ${name}`,
    trash: 'Trash',
    newSpace: 'New space',
    duplicates: 'Close duplicates',
    sortTabs: 'Sort tabs into groups',
    review: 'Not opened for a while — review',
  },
});

/** «Исследование React» / “React research”. */
const quoted = (title: string) => words().quote(title || words().untitled);

/** Actions with a found group, by its state. */
function groupActions(group: TabGroup): PaletteActionItem[] {
  const name = quoted(group.title);
  const item = (type: 'sleepGroup' | 'stowGroup' | 'restoreGroup', label: string) => ({
    id: `${type}:${group.id}`,
    label,
    action: { type, group },
  });
  const t = text();
  const byState: Record<GroupState, PaletteActionItem[]> = {
    active: [item('sleepGroup', t.sleep(name)), item('stowGroup', t.stow(name))],
    asleep: [item('restoreGroup', t.wake(name)), item('stowGroup', t.stow(name))],
    stowed: [item('restoreGroup', t.restore(name))],
  };
  return byState[group.state];
}

function fixedActions(overview: Overview, currentSpaceId?: Id): PaletteActionItem[] {
  const t = text();
  return [
    { id: 'collapseAll', label: t.collapseAll, action: { type: 'collapseAll' } },
    ...overview.spaces
      .filter(({ space }) => space.id !== currentSpaceId)
      .map(({ space }) => ({
        id: `space:${space.id}`,
        label: t.goTo(quoted(space.name)),
        action: { type: 'goToSpace', spaceId: space.id } as const,
      })),
    { id: 'duplicates', label: t.duplicates, action: { type: 'openTidy' } },
    { id: 'sortTabs', label: t.sortTabs, action: { type: 'openTidy' } },
    { id: 'review', label: t.review, action: { type: 'openReview' } },
    { id: 'openTrash', label: t.trash, action: { type: 'openTrash' } },
    { id: 'newSpace', label: t.newSpace, action: { type: 'newSpace' } },
  ];
}

const WORDS = /[\p{L}\p{N}]+/gu;

/** Every word of the query starts some word of the label: «пер раб» → «Перейти в «Работа»». */
export function labelMatches(label: string, query: string): boolean {
  const labelWords = normalizeText(label).match(WORDS) ?? [];
  const queryWords = normalizeText(query).match(WORDS) ?? [];
  return queryWords.every((word) => labelWords.some((candidate) => candidate.startsWith(word)));
}

export function buildPalette(
  overview: Overview,
  index: SearchIndex,
  query: string,
  currentSpaceId?: Id,
): PaletteContents {
  const fixed = fixedActions(overview, currentSpaceId);
  const hits = index.search(query);
  if (!hits) return { groups: [], tabs: [], actions: fixed, terms: [] };

  const groups = new Map<Id, PaletteGroup>();
  const tabs = new Map<Id, PaletteTab>();
  for (const { space, groups: views } of overview.spaces) {
    for (const { group, tabs: groupTabs } of views) {
      groups.set(group.id, { group, space, tabCount: groupTabs.length });
      for (const tab of groupTabs) tabs.set(tab.id, { tab, group });
    }
  }

  const foundGroups = hits.groups
    .map((hit) => groups.get(hit.groupId))
    .filter((item) => item !== undefined)
    .slice(0, MAX_GROUPS);
  const foundTabs = hits.tabs
    .map((hit) => tabs.get(hit.tabId))
    .filter((item) => item !== undefined)
    .slice(0, MAX_TABS);
  const best = foundGroups[0];

  return {
    groups: foundGroups,
    tabs: foundTabs,
    actions: [
      ...(best ? groupActions(best.group) : []),
      ...fixed.filter((item) => labelMatches(item.label, query)),
    ],
    terms: hits.terms,
  };
}
