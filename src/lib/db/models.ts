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
  /** When the group last changed state («Убрана 3 дня назад»). Missing on records from before stage 3. */
  stateChangedAt?: Timestamp;
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
  /** Icon of the page (Chrome's favicon cache is used when missing) — for videos without a thumbnail. */
  favIconUrl?: string;
  /**
   * The page plays the video in a frame of another site (an embedded player): TabFlow needs access
   * to these origins too to read the duration. Set by the content script, cleared once known.
   */
  playerOrigins?: string[];
  status: QueueStatus;
  order: number;
  watchedAt?: Timestamp;
}

/** A link of a saved layout. The copy of the address opens the page when the link is gone. */
export interface LayoutLink {
  /** The `SavedTab` it was made from; missing for an open tab that was outside TabFlow. */
  tabId?: Id;
  url: string;
  title: string;
}

/**
 * A saved layout of «Рядом»: 2–4 links shown side by side on the main page. The arrangement
 * follows the number of links (see `tiling/layout.ts`), so only the links in pane order are kept.
 * Deleted for good (undo puts the record back), not moved to the trash.
 */
export interface TileLayout {
  id: Id;
  name: string;
  order: number;
  links: LayoutLink[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
