/**
 * Numbers about the groups and the queue for the popup and the badge on the TabFlow icon.
 * Pure functions, shared by the pages and the background so that all count the same way.
 */
import { isSaveableUrl } from './background/tab-rules';
import { count, GROUPS } from './command-messages';
import type { QueueItem, TabGroup } from './db/models';
import { queueTotal, todayPlan, totalText } from './queue/plan';

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

/**
 * What the number on the TabFlow icon counts (menu «Настройки» on the main page): videos for
 * today (default), all queued videos, or stowed groups — what is saved but not in front of the user.
 */
export const BADGE_MODES = ['today', 'queue', 'stowed'] as const;
export type BadgeMode = (typeof BADGE_MODES)[number];

export const BADGE_MODE_LABEL: Record<BadgeMode, string> = {
  today: 'Видео на сегодня',
  queue: 'Все видео в очереди',
  stowed: 'Убранные группы',
};

/** Badge text: empty for 0 (no badge), «99+» above 99. */
export function badgeCount(n: number): string {
  if (n <= 0) return '';
  return n > 99 ? '99+' : String(n);
}

export interface Badge {
  text: string;
  /** Tooltip of the icon: the day's videos and the stowed groups, whatever the number counts. */
  title: string;
}

/** `queued` — queued videos by priority; `stowed` — number of stowed groups. */
export function badge(mode: BadgeMode, queued: readonly QueueItem[], stowed: number): Badge {
  const today = todayPlan(queued);
  const all = queueTotal(queued);
  const lines = [
    'TabFlow',
    queued.length === 0 ? 'Очередь пуста' : `На сегодня: ${totalText(today)}`,
  ];
  if (all.count > today.count) lines.push(`В очереди: ${totalText(all)}`);
  if (stowed > 0) lines.push(`Убрано в TabFlow: ${count(stowed, GROUPS)}`);

  const n = mode === 'today' ? today.count : mode === 'queue' ? all.count : stowed;
  return { text: badgeCount(n), title: lines.join('\n') };
}
