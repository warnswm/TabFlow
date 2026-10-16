/**
 * Data model of TabFlow. All records live in IndexedDB (see `db.ts`).
 *
 * Conventions:
 * - `id` — UUID string (`crypto.randomUUID()`), stable across import/export.
 * - Timestamps — epoch milliseconds (`Date.now()`), easy to export as JSON.
 * - `order` — sort key inside the parent; new keys are placed between neighbours (see `order.ts`).
 * - `deletedAt` — set when a record is in the trash; purged for good after 30 days.
 *   Absent on live records, so live records never appear in the `deletedAt` index.
 */

export type Id = string;
export type Timestamp = number;

/** Colors of Chrome's native tab groups (`chrome.tabGroups.Color`). */
export const GROUP_COLORS = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
] as const;
export type GroupColor = (typeof GROUP_COLORS)[number];

/**
 * Group lifecycle:
 * - `active` — on the tab strip, tabs loaded;
 * - `asleep` — on the tab strip, tabs discarded (`chrome.tabs.discard`);
 * - `stowed` — only in TabFlow, tabs closed; restored as a native group with the same title and color.
 */
export const GROUP_STATES = ['active', 'asleep', 'stowed'] as const;
export type GroupState = (typeof GROUP_STATES)[number];

interface BaseRecord {
  id: Id;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt?: Timestamp;
}

/** Top-level container: «Работа», «Учёба», «Личное». */
export interface Space extends BaseRecord {
  name: string;
  order: number;
  /** The default space («Входящие») receives tabs from «Свернуть всё». Exactly one exists. */
  isDefault: boolean;
}

export interface TabGroup extends BaseRecord {
  spaceId: Id;
  title: string;
  color: GroupColor;
  state: GroupState;
  order: number;
  /** Id of the native Chrome group while the group is on the tab strip; cleared when stowed. */
  chromeGroupId?: number;
  /** Window of the native group while it is on the tab strip. */
  windowId?: number;
  note?: string;
}

export interface SavedTab extends BaseRecord {
  groupId: Id;
  url: string;
  title: string;
  favIconUrl?: string;
  order: number;
  pinned: boolean;
  /** Id of the open Chrome tab while the group is on the tab strip; cleared when stowed. */
  chromeTabId?: number;
}

export const QUEUE_STATUSES = ['queued', 'watched'] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

/** A video in the «watch later» queue. Priority = position by `order` (#1 is first). */
export interface QueueItem extends BaseRecord {
  url: string;
  title: string;
  /** Site host, e.g. `youtube.com`, `vkvideo.ru`. */
  site: string;
  /** YouTube video id when known — used for thumbnails and duplicate checks. */
  videoId?: string;
  channel?: string;
  /** Collection or course the video belongs to («Курс TypeScript»). */
  collection?: string;
  durationSec?: number;
  /** Last known playback position. */
  positionSec: number;
  status: QueueStatus;
  order: number;
  watchedAt?: Timestamp;
}
