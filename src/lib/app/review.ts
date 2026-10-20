/**
 * «Давно не открывали»: stowed groups and queued videos that lie untouched longer than the chosen
 * number of days, shown one by one — so what was put aside is not forgotten (as in OneTab or
 * «Смотреть позже»). Pure: the page passes the records and the time.
 *
 * - A group counts from the moment it was stowed (`stateChangedAt`), a video from the moment it was
 *   added (`createdAt`); «Оставить» (`reviewedAt`) starts the count again.
 * - The oldest comes first.
 */
import type { QueueItem, SavedTab, TabGroup, Timestamp } from '../db/models';
import type { Overview } from './overview';

/** Days after which a thing counts as forgotten; 0 — off. */
export const REVIEW_DAYS = [7, 14, 30, 0] as const;
export type ReviewDays = (typeof REVIEW_DAYS)[number];
export const DEFAULT_REVIEW_DAYS: ReviewDays = 14;

const DAY = 24 * 60 * 60 * 1000;

export type ReviewItem =
  | { kind: 'group'; group: TabGroup; tabs: SavedTab[]; since: Timestamp }
  | {
      kind: 'video';
      video: QueueItem;
      /** 1-based place in the queue. */
      priority: number;
      since: Timestamp;
    };

export function reviewItems(
  overview: Overview,
  queue: readonly QueueItem[],
  now: Timestamp,
  days: ReviewDays,
): ReviewItem[] {
  if (days === 0) return [];
  const before = now - days * DAY;
  const items: ReviewItem[] = [];

  for (const { groups } of overview.spaces) {
    for (const { group, tabs } of groups) {
      if (group.state !== 'stowed' || tabs.length === 0) continue;
      const since = group.stateChangedAt ?? group.updatedAt;
      if (Math.max(since, group.reviewedAt ?? 0) <= before) {
        items.push({ kind: 'group', group, tabs, since });
      }
    }
  }
  const queued = queue.filter(
    (video) => video.status === 'queued' && video.deletedAt === undefined,
  );
  for (const [i, video] of [...queued].sort((a, b) => a.order - b.order).entries()) {
    if (Math.max(video.createdAt, video.reviewedAt ?? 0) <= before) {
      items.push({ kind: 'video', video, priority: i + 1, since: video.createdAt });
    }
  }
  return items.sort((a, b) => a.since - b.since);
}

export function reviewCounts(items: readonly ReviewItem[]): { groups: number; videos: number } {
  const groups = items.filter((item) => item.kind === 'group').length;
  return { groups, videos: items.length - groups };
}
