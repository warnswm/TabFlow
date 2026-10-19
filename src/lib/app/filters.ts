/**
 * Filter chips of a space: «Все / Активные / Спят / Убраны» with counts, combined with the search.
 */
import type { GroupState, Id } from '../db/models';
import { localized } from '../i18n';
import type { GroupView } from './overview';
import type { GroupMatch } from './search';

export type StateFilter = 'all' | GroupState;

const text = localized({
  ru: {
    labels: { all: 'Все', active: 'Активные', asleep: 'Спят', stowed: 'Убраны' },
    nothing: (query: string) => `Ничего не найдено по запросу «${query}».`,
    nothingAmong: (chip: string, query: string) =>
      `Среди групп «${chip}» ничего не найдено по запросу «${query}».`,
    empty: {
      all: '',
      active: 'Активных групп нет.',
      asleep: 'Спящих групп нет.',
      stowed: 'Убранных групп нет.',
    },
  },
  en: {
    labels: { all: 'All', active: 'Active', asleep: 'Asleep', stowed: 'Stowed' },
    nothing: (query: string) => `Nothing found for “${query}”.`,
    nothingAmong: (chip: string, query: string) =>
      `Nothing found for “${query}” among “${chip}” groups.`,
    empty: {
      all: '',
      active: 'No active groups.',
      asleep: 'No groups asleep.',
      stowed: 'No stowed groups.',
    },
  },
});

const chip = (value: StateFilter) => ({
  value,
  get label() {
    return text().labels[value];
  },
});

export const STATE_FILTERS: readonly { value: StateFilter; label: string }[] = [
  chip('all'),
  chip('active'),
  chip('asleep'),
  chip('stowed'),
];

/** `matches` — the search result (`undefined` when nothing is searched). */
function matchesSearch(view: GroupView, matches?: ReadonlyMap<Id, GroupMatch>): boolean {
  return matches === undefined || matches.has(view.group.id);
}

/** Groups shown with the chip and the search; the order of the space is kept. */
export function filterGroups(
  groups: readonly GroupView[],
  filter: StateFilter,
  matches?: ReadonlyMap<Id, GroupMatch>,
): GroupView[] {
  return groups.filter(
    (view) => matchesSearch(view, matches) && (filter === 'all' || view.group.state === filter),
  );
}

/** Numbers on the chips: groups that match the search, by state. */
export function stateCounts(
  groups: readonly GroupView[],
  matches?: ReadonlyMap<Id, GroupMatch>,
): Record<StateFilter, number> {
  const counts: Record<StateFilter, number> = { all: 0, active: 0, asleep: 0, stowed: 0 };
  for (const view of groups) {
    if (!matchesSearch(view, matches)) continue;
    counts.all++;
    counts[view.group.state]++;
  }
  return counts;
}

/** Text for an empty result, in the brand voice. */
export function emptyFilterText(filter: StateFilter, query: string): string {
  const t = text();
  const trimmed = query.trim();
  if (trimmed !== '') {
    return filter === 'all' ? t.nothing(trimmed) : t.nothingAmong(t.labels[filter], trimmed);
  }
  return t.empty[filter];
}
