/**
 * Filter chips of a space: «Все / Активные / Спят / Убраны» with counts, combined with the search.
 */
import type { GroupState, Id } from '../db/models';
import type { GroupView } from './overview';
import type { GroupMatch } from './search';

export type StateFilter = 'all' | GroupState;

export const STATE_FILTERS: readonly { value: StateFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'active', label: 'Активные' },
  { value: 'asleep', label: 'Спят' },
  { value: 'stowed', label: 'Убраны' },
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
  const trimmed = query.trim();
  if (trimmed !== '') {
    return filter === 'all'
      ? `Ничего не найдено по запросу «${trimmed}».`
      : `Среди групп «${STATE_FILTERS.find((f) => f.value === filter)?.label}» ничего не найдено по запросу «${trimmed}».`;
  }
  switch (filter) {
    case 'active':
      return 'Активных групп нет.';
    case 'asleep':
      return 'Спящих групп нет.';
    case 'stowed':
      return 'Убранных групп нет.';
    default:
      return '';
  }
}
