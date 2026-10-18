/**
 * The TabFlow backup file: every live space, group, link, queued video and saved layout of
 * «Рядом», plus the settings. The trash is not part of it; links to Chrome (`chromeGroupId`,
 * `windowId`, `chromeTabId`) are not either — they mean nothing in another browser session.
 *
 * A file is read with `parseBackup`: records are copied field by field, so whatever else the file
 * holds is dropped, and a record that does not fit is skipped instead of failing the whole file.
 */
import { isSaveableUrl } from '../background/tab-rules';
import {
  GROUP_COLORS,
  GROUP_STATES,
  type GroupColor,
  type GroupState,
  type Id,
  type LayoutLink,
  QUEUE_STATUSES,
  type QueueItem,
  type QueueStatus,
  type SavedTab,
  type Space,
  type TabGroup,
  type TileLayout,
  type Timestamp,
} from '../db/models';
import { RESTORE_MODES, type RestoreMode } from '../messages';
import { BADGE_MODES, type BadgeMode } from '../summary';
import { isPaneArrangement, isTileCount, type Rect } from '../tiling/layout';

export const BACKUP_FORMAT = 'tabflow-backup';
/** Bumped when the file changes so that an older TabFlow cannot read it. */
export const BACKUP_VERSION = 1;

export type BackupSpace = Omit<Space, 'deletedAt'>;
export type BackupGroup = Omit<TabGroup, 'deletedAt' | 'chromeGroupId' | 'windowId'>;
export type BackupTab = Omit<SavedTab, 'deletedAt' | 'chromeTabId'>;
export type BackupVideo = Omit<QueueItem, 'deletedAt' | 'playerOrigins'>;

export interface BackupSettings {
  restoreMode?: RestoreMode;
  badgeMode?: BadgeMode;
}

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: Timestamp;
  spaces: BackupSpace[];
  groups: BackupGroup[];
  tabs: BackupTab[];
  queue: BackupVideo[];
  layouts: TileLayout[];
  settings: BackupSettings;
}

export type BackupErrorCode = 'not-json' | 'not-backup' | 'newer-version';

export class BackupError extends Error {
  constructor(readonly code: BackupErrorCode) {
    super(code);
    this.name = 'BackupError';
  }
}

/** Reads a backup file; throws `BackupError` when it is not one. */
export function parseBackup(text: string): Backup {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BackupError('not-json');
  }
  return readBackup(value);
}

/** Checks and copies an already parsed backup (also what the background gets in a command). */
export function readBackup(value: unknown): Backup {
  if (!isObject(value) || value.format !== BACKUP_FORMAT || !isCount(value.version)) {
    throw new BackupError('not-backup');
  }
  if (value.version > BACKUP_VERSION) throw new BackupError('newer-version');

  const spaces = list(value.spaces, readSpace);
  const groups = list(value.groups, readGroup);
  const groupIds = new Set(groups.map((group) => group.id));
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: isTime(value.exportedAt) ? value.exportedAt : 0,
    spaces: unique(spaces),
    groups: unique(groups),
    // A link without its group has nowhere to go.
    tabs: unique(list(value.tabs, readTab).filter((tab) => groupIds.has(tab.groupId))),
    queue: unique(list(value.queue, readVideo)),
    layouts: unique(list(value.layouts, readLayout)),
    settings: readSettings(value.settings),
  };
}

export interface BackupSummary {
  /** Spaces besides «Входящие». */
  spaces: number;
  groups: number;
  tabs: number;
  videos: number;
  layouts: number;
  exportedAt: Timestamp;
}

export function summarizeBackup(backup: Backup): BackupSummary {
  return {
    spaces: backup.spaces.filter((space) => !space.isDefault).length,
    groups: backup.groups.length,
    tabs: backup.tabs.length,
    videos: backup.queue.length,
    layouts: backup.layouts.length,
    exportedAt: backup.exportedAt,
  };
}

/** `tabflow-2026-10-19.json` — the local date of `now`. */
export function backupFileName(now: Timestamp): string {
  const date = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `tabflow-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

type Fields = Record<string, unknown>;

const isObject = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is Id =>
  typeof value === 'string' && value !== '' && value.length <= 200;
const isText = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isTime = (value: unknown): value is Timestamp => isNumber(value) && value >= 0;
const isCount = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0;
const isSeconds = (value: unknown): value is number => isNumber(value) && value >= 0;
const optional = <T>(value: unknown, check: (value: unknown) => value is T): T | undefined =>
  check(value) ? value : undefined;
const text = (value: unknown, max: number): string => (isText(value) ? value.slice(0, max) : '');

function list<T>(value: unknown, read: (fields: Fields) => T | undefined): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = isObject(item) ? read(item) : undefined;
    return record === undefined ? [] : [record];
  });
}

/** The first record of every id. */
function unique<T extends { id: Id }>(records: T[]): T[] {
  const seen = new Set<Id>();
  return records.filter((record) => !seen.has(record.id) && Boolean(seen.add(record.id)));
}

/** `id`, `createdAt`, `updatedAt` — or nothing when the record has no id. */
function base(fields: Fields): { id: Id; createdAt: Timestamp; updatedAt: Timestamp } | undefined {
  if (!isId(fields.id)) return undefined;
  const createdAt = isTime(fields.createdAt) ? fields.createdAt : 0;
  return {
    id: fields.id,
    createdAt,
    updatedAt: isTime(fields.updatedAt) ? fields.updatedAt : createdAt,
  };
}

function readSpace(fields: Fields): BackupSpace | undefined {
  const record = base(fields);
  if (!record || !isNumber(fields.order)) return undefined;
  return {
    ...record,
    name: text(fields.name, 200),
    order: fields.order,
    isDefault: fields.isDefault === true,
  };
}

function readGroup(fields: Fields): BackupGroup | undefined {
  const record = base(fields);
  if (!record || !isId(fields.spaceId) || !isNumber(fields.order)) return undefined;
  const color = GROUP_COLORS.includes(fields.color as GroupColor)
    ? (fields.color as GroupColor)
    : 'grey';
  const state = GROUP_STATES.includes(fields.state as GroupState)
    ? (fields.state as GroupState)
    : 'stowed';
  const note = optional(fields.note, isText);
  const stateChangedAt = optional(fields.stateChangedAt, isTime);
  return {
    ...record,
    spaceId: fields.spaceId,
    title: text(fields.title, 500),
    color,
    state,
    order: fields.order,
    ...(stateChangedAt !== undefined && { stateChangedAt }),
    ...(note !== undefined && { note: note.slice(0, 5000) }),
  };
}

function readTab(fields: Fields): BackupTab | undefined {
  const record = base(fields);
  const url = fields.url;
  if (!record || !isId(fields.groupId) || !isText(url) || !isSaveableUrl(url)) return undefined;
  if (!isNumber(fields.order)) return undefined;
  const favIconUrl = optional(fields.favIconUrl, isText);
  return {
    ...record,
    groupId: fields.groupId,
    url,
    title: text(fields.title, 1000),
    order: fields.order,
    pinned: fields.pinned === true,
    ...(favIconUrl !== undefined && { favIconUrl }),
  };
}

function readVideo(fields: Fields): BackupVideo | undefined {
  const record = base(fields);
  const url = fields.url;
  if (!record || !isText(url) || !isSaveableUrl(url) || !isNumber(fields.order)) return undefined;
  const status = QUEUE_STATUSES.includes(fields.status as QueueStatus)
    ? (fields.status as QueueStatus)
    : 'queued';
  const optionalText = (key: string, max: number) => {
    const value = optional(fields[key], isText);
    return value === undefined ? {} : { [key]: value.slice(0, max) };
  };
  const durationSec = optional(fields.durationSec, isSeconds);
  const watchedAt = optional(fields.watchedAt, isTime);
  return {
    ...record,
    url,
    title: text(fields.title, 1000),
    site: text(fields.site, 200),
    ...optionalText('videoId', 100),
    ...optionalText('channel', 200),
    ...optionalText('collection', 200),
    ...optionalText('favIconUrl', 5000),
    ...(durationSec !== undefined && durationSec > 0 && { durationSec }),
    positionSec: isSeconds(fields.positionSec) ? fields.positionSec : 0,
    status,
    order: fields.order,
    ...(status === 'watched' && watchedAt !== undefined && { watchedAt }),
  };
}

function readLayout(fields: Fields): TileLayout | undefined {
  const record = base(fields);
  if (!record || !isNumber(fields.order)) return undefined;
  const links = list(fields.links, readLayoutLink);
  if (!isTileCount(links.length)) return undefined;
  const given = fields.rects;
  const rects =
    Array.isArray(given) &&
    given.every(isObject) &&
    isPaneArrangement(given as unknown as Rect[], links.length)
      ? (given as unknown as Rect[])
      : undefined;
  return {
    ...record,
    name: text(fields.name, 200),
    order: fields.order,
    links,
    ...(rects && {
      rects: rects.map(({ left, top, width, height }) => ({ left, top, width, height })),
    }),
  };
}

function readLayoutLink(fields: Fields): LayoutLink | undefined {
  const url = fields.url;
  if (!isText(url) || !isSaveableUrl(url)) return undefined;
  const title = text(fields.title, 1000);
  return isId(fields.tabId) ? { tabId: fields.tabId, url, title } : { url, title };
}

function readSettings(value: unknown): BackupSettings {
  if (!isObject(value)) return {};
  const { restoreMode, badgeMode } = value;
  return {
    ...(RESTORE_MODES.includes(restoreMode as RestoreMode) && {
      restoreMode: restoreMode as RestoreMode,
    }),
    ...(BADGE_MODES.includes(badgeMode as BadgeMode) && { badgeMode: badgeMode as BadgeMode }),
  };
}
