/**
 * Numbers about the groups for the popup and the badge on the TabFlow icon. Pure functions,
 * shared by the popup and the background so that both count the same way.
 */
import { isSaveableUrl } from './background/tab-rules';
import { count, GROUPS } from './command-messages';
import type { TabGroup } from './db/models';

export interface GroupSummary {
  /** Groups on the tab strip (active or asleep). */
  onStrip: number;
  asleep: number;
  /** Groups kept only in TabFlow. */
  stowed: number;
  /** Active groups «Усыпить неактивные» puts to sleep. */
  sleepable: number;
}

/**
 * An active group on the tab strip whose tabs are not shown in any window: «Усыпить неактивные»
 * leaves the groups in front of the user awake.
 */
export function isSleepable(group: TabGroup, shownChromeGroupIds: ReadonlySet<number>): boolean {
  return (
    group.state === 'active' &&
    group.chromeGroupId !== undefined &&
    !shownChromeGroupIds.has(group.chromeGroupId)
  );
}

/** `groups` — live groups of all spaces. */
export function summarize(
  groups: readonly TabGroup[],
  shownChromeGroupIds: ReadonlySet<number> = new Set(),
): GroupSummary {
  return {
    onStrip: groups.filter((group) => group.state !== 'stowed').length,
    asleep: groups.filter((group) => group.state === 'asleep').length,
    stowed: groups.filter((group) => group.state === 'stowed').length,
    sleepable: groups.filter((group) => isSleepable(group, shownChromeGroupIds)).length,
  };
}

/** What the popup offers for the tab in front of the user. */
export type CurrentTarget =
  /** The tab is in a group TabFlow keeps: stow or put to sleep the group. */
  | { kind: 'group'; group: TabGroup }
  /** A web page outside groups: stowed alone into the day group. */
  | { kind: 'tab' }
  /** Pinned tabs and browser pages stay open. */
  | { kind: 'none'; reason: 'pinned' | 'browser-page' };

export function currentTarget(
  tab: { url: string; pinned: boolean; groupId: number } | undefined,
  groups: readonly TabGroup[],
): CurrentTarget {
  if (!tab) return { kind: 'none', reason: 'browser-page' };
  const group = groups.find((item) => item.chromeGroupId === tab.groupId);
  if (group && tab.groupId >= 0) return { kind: 'group', group };
  if (tab.pinned) return { kind: 'none', reason: 'pinned' };
  return isSaveableUrl(tab.url) ? { kind: 'tab' } : { kind: 'none', reason: 'browser-page' };
}

/** The badge shows how many groups are stowed: what is saved but not in front of the user. */
export function badgeText(stowed: number): string {
  if (stowed <= 0) return '';
  return stowed > 99 ? '99+' : String(stowed);
}

/** Tooltip of the TabFlow icon: «TabFlow · убрано 3 группы». */
export function badgeTitle(stowed: number): string {
  return stowed > 0 ? `TabFlow · убрано ${count(stowed, GROUPS)}` : 'TabFlow';
}
