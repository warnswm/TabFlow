/**
 * Numbers of the video queue: «На сегодня: 3 видео · 47 мин» (the first videos by priority) and
 * what fits into free time («За 20 мин: #1 и #3 · 19 мин»). Pure functions shared by the side
 * panel, the main page, the popup and the badge.
 */
import type { QueueItem } from '../db/models';

/** «На сегодня» — this many videos from the top of the queue. */
export const TODAY_COUNT = 3;

/** Time left to watch; `undefined` while the duration is unknown. */
export function remainingSec(item: Pick<QueueItem, 'durationSec' | 'positionSec'>) {
  return item.durationSec === undefined
    ? undefined
    : Math.max(0, item.durationSec - item.positionSec);
}

/** Watched share 0…1 for the progress bar; 0 while the duration is unknown. */
export function progressShare(item: Pick<QueueItem, 'durationSec' | 'positionSec'>): number {
  if (!item.durationSec) return 0;
  return Math.min(1, Math.max(0, item.positionSec / item.durationSec));
}

export interface QueueTotal {
  count: number;
  /** Time left of the videos with a known duration. */
  totalSec: number;
  /** Videos whose duration is not known yet. */
  unknown: number;
}

/** `queued` — sorted by priority. */
export function queueTotal(queued: readonly QueueItem[]): QueueTotal {
  let totalSec = 0;
  let unknown = 0;
  for (const item of queued) {
    const left = remainingSec(item);
    if (left === undefined) unknown++;
    else totalSec += left;
  }
  return { count: queued.length, totalSec, unknown };
}

/** «На сегодня»: the first `TODAY_COUNT` videos by priority. */
export function todayPlan(queued: readonly QueueItem[]): QueueTotal {
  return queueTotal(queued.slice(0, TODAY_COUNT));
}

export interface FreeTimeSlot {
  minutes: number;
  /** Chip text. */
  label: string;
  /** In the hint: «За 20 мин: …». */
  phrase: string;
}

export const FREE_TIME_SLOTS: readonly FreeTimeSlot[] = [
  { minutes: 10, label: '10 мин', phrase: '10 мин' },
  { minutes: 20, label: '20 мин', phrase: '20 мин' },
  { minutes: 40, label: '40 мин', phrase: '40 мин' },
  { minutes: 60, label: '1 ч+', phrase: 'час' },
];

/** The longest slot («1 ч+»): when nothing fits, the first video with a known duration is taken. */
const OPEN_ENDED_MINUTES = 60;

export interface TimePick {
  /** Priorities (1-based positions in the queue) of the chosen videos. */
  priorities: number[];
  totalSec: number;
}

/**
 * Goes down the queue by priority and takes every video whose time left still fits. Videos with
 * an unknown duration are skipped.
 */
export function pickForTime(queued: readonly QueueItem[], minutes: number): TimePick {
  const budget = minutes * 60;
  const pick: TimePick = { priorities: [], totalSec: 0 };
  queued.forEach((item, index) => {
    const left = remainingSec(item);
    if (left === undefined || pick.totalSec + left > budget) return;
    pick.priorities.push(index + 1);
    pick.totalSec += left;
  });
  if (pick.priorities.length === 0 && minutes >= OPEN_ENDED_MINUTES) {
    const index = queued.findIndex((item) => item.durationSec !== undefined);
    const first = queued[index];
    if (first) return { priorities: [index + 1], totalSec: remainingSec(first) ?? 0 };
  }
  return pick;
}

/** «#1», «#1 и #3», «#1, #2 и #4». */
export function priorityList(priorities: readonly number[]): string {
  const labels = priorities.map((priority) => `#${priority}`);
  const last = labels.pop();
  if (last === undefined) return '';
  return labels.length === 0 ? last : `${labels.join(', ')} и ${last}`;
}

/** The line under the free time chips. */
export function pickHint(queued: readonly QueueItem[], slot: FreeTimeSlot): string {
  if (queued.length === 0) return 'Очередь пуста.';
  const pick = pickForTime(queued, slot.minutes);
  if (pick.priorities.length > 0) {
    return `За ${slot.phrase}: ${priorityList(pick.priorities)} · ${formatMinutes(pick.totalSec)}.`;
  }
  if (queued.every((item) => item.durationSec === undefined)) {
    return 'Длительность пока неизвестна — она появится, когда видео откроется.';
  }
  return `В ${slot.phrase} не помещается ни одно видео.`;
}

/** «3 видео · 47 мин»; without minutes when no duration is known. */
export function totalText({ count, totalSec, unknown }: QueueTotal): string {
  return unknown === count ? `${count} видео` : `${count} видео · ${formatMinutes(totalSec)}`;
}

/** Video length as players show it: «4:55», «18:42», «1:02:03». */
export function formatDuration(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

/** «47 мин», «3 ч 40 мин», «2 ч»; anything under a minute counts as one. */
export function formatMinutes(sec: number): string {
  const minutes = sec <= 0 ? 0 : Math.max(1, Math.round(sec / 60));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} мин`;
  return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
}

/** How the side panel lists the queue: by priority (drag & drop), or the shortest first. */
export type QueueSort = 'priority' | 'short';

/** `queued` by priority → the shown order; videos without a duration go last. */
export function sortQueue(queued: readonly QueueItem[], sort: QueueSort): QueueItem[] {
  if (sort === 'priority') return [...queued];
  const left = (item: QueueItem) => remainingSec(item) ?? Number.POSITIVE_INFINITY;
  return [...queued].sort((a, b) => left(a) - left(b));
}

/**
 * How many cards of at least `minWidth` fit side by side into `width` with `gap` between them:
 * the main page shows one row of the queue, as wide as the window allows (at least one card).
 */
export function cardsInRow(width: number, minWidth: number, gap: number): number {
  return Math.max(1, Math.floor((width + gap) / (minWidth + gap)));
}

/**
 * The time on a video's thumbnail: «37:05», or «29:12 / 37:05» once watching has started (as in
 * players). When that is longer than `maxLength` (an hour-long video on a small thumbnail) — only
 * the duration; «—» while it is unknown.
 */
export function durationLabel(
  item: Pick<QueueItem, 'durationSec' | 'positionSec'>,
  maxLength = Number.POSITIVE_INFINITY,
): string {
  if (item.durationSec === undefined) return '—';
  const total = formatDuration(item.durationSec);
  if (progressShare(item) < 0.01) return total;
  const both = `${formatDuration(item.positionSec)} / ${total}`;
  return both.length <= maxLength ? both : total;
}
