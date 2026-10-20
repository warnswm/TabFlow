/**
 * Commands from extension pages (main page, popup, side panel) to the background.
 * Pages read the database directly; anything that touches Chrome tabs goes through these commands,
 * so the background runs it in one queue with the browser events.
 */
import type { Backup } from './backup/format';
import { sendRuntimeMessage } from './browser-api';
import { GROUP_COLORS, type GroupColor, type Id } from './db/models';
import { MAX_TILES } from './tiling/layout';

/** What can be brought back from the trash. */
export const TRASH_KINDS = ['space', 'group', 'tab'] as const;
export type TrashKind = (typeof TRASH_KINDS)[number];

export type Command =
  | { type: 'collapseAll' }
  | { type: 'sleepGroup'; groupId: Id }
  | { type: 'stowGroup'; groupId: Id }
  | { type: 'restoreGroup'; groupId: Id; mode?: RestoreMode }
  /** Renames or recolors a group; a group on the tab strip changes in Chrome too. */
  | { type: 'editGroup'; groupId: Id; title?: string; color?: GroupColor }
  /** Moves the group to the trash; a group on the tab strip is closed after that. */
  | { type: 'deleteGroup'; groupId: Id }
  /** Moves the space with its groups to the trash; its groups on the tab strip are closed. */
  | { type: 'deleteSpace'; spaceId: Id }
  /** Moves a link to the trash (its tab is closed); the last link takes the whole group along. */
  | { type: 'deleteTab'; tabId: Id }
  /**
   * Brings a space, group or link back from the trash. `reopenGroupIds` — groups to put back
   * on the tab strip afterwards (undo of a delete that closed them).
   */
  | { type: 'restoreDeleted'; kind: TrashKind; id: Id; reopenGroupIds?: Id[]; mode?: RestoreMode }
  /** Shows the link's open tab, or opens the link in a new tab. */
  | { type: 'openTab'; tabId: Id }
  /**
   * Puts a link at `index` of a group — its own (new order) or another one. The open tab follows
   * on the tab strip; the last link of a group leaves the empty group in the trash.
   */
  | { type: 'moveTab'; tabId: Id; groupId: Id; index: number }
  /**
   * «Убрать в TabFlow» for a Chrome tab (default: the active tab of the current window): its whole
   * group when the tab is in one, otherwise the tab alone into the day group in «Входящие».
   */
  | { type: 'stowCurrent'; chromeTabId?: number }
  /** Puts the group of a Chrome tab (default: the active one) to sleep. */
  | { type: 'sleepCurrent'; chromeTabId?: number }
  /**
   * Stows the tabs selected in the current window (Ctrl+click, Shift+click) as one new group in
   * «Входящие»; links of other groups move into it.
   */
  | { type: 'stowSelected' }
  /** Puts every active group to sleep except the groups of the tabs shown in the windows. */
  | { type: 'sleepInactive' }
  /** Saves an open Chrome tab into a group: closed if the group is stowed, moved into it if not. */
  | { type: 'saveToGroup'; chromeTabId: number; groupId: Id }
  /** Saves a link without opening it — into a group or the day group in «Входящие». */
  | { type: 'saveLink'; url: string; title?: string; groupId?: Id }
  /** Shows the main TabFlow page of the current window, opening it if needed (on `screen`). */
  | { type: 'openApp'; screen?: AppScreen }
  /**
   * Closes the duplicates of the preview (`tidy/duplicates.ts`): the sets with these keys are
   * found again, extra tabs close, extra links go to the trash.
   */
  | { type: 'closeDuplicates'; keys: string[] }
  /** Undo of `closeDuplicates`: links come back from the trash, closed tabs open again. */
  | { type: 'undoCloseDuplicates'; undo: DuplicatesUndo; mode?: RestoreMode }
  /**
   * «Разложить вкладки»: tabs outside groups become native groups (or join one of the same
   * title); TabFlow mirrors them in «Входящие».
   */
  | { type: 'groupTabs'; groups: TabGrouping[] }
  /** Undo of `groupTabs`: the tabs leave the groups and go back to their places. */
  | { type: 'undoGroupTabs'; undo: GroupingUndo }
  /**
   * «В очередь «на потом»» for a Chrome tab (default: the active one). The tab stays open; a video
   * already in the queue is not added twice.
   */
  | { type: 'queueTab'; chromeTabId?: number }
  /** Adds a link to the queue without opening it. */
  | { type: 'queueLink'; url: string; title?: string }
  /** Shows the video's open tab, or opens it in a new tab of the current window. */
  | { type: 'openVideo'; itemId: Id }
  /** Puts a queued video at `index` (0 — top priority). */
  | { type: 'moveVideo'; itemId: Id; index: number }
  /** Marks a video watched (it leaves the queue) or puts it back at the end of the queue. */
  | { type: 'setWatched'; itemId: Id; watched: boolean }
  /** Removes a video from the queue (kept in the trash for 30 days). */
  | { type: 'removeVideo'; itemId: Id }
  /** Brings a removed video back (undo). */
  | { type: 'restoreVideo'; itemId: Id }
  /**
   * «Рядом»: links (`tabIds`) and open tabs outside TabFlow (`chromeTabIds`) are shown side by
   * side on the main page, so their tabs on the tab strip are unloaded (they stay in place).
   * The tab shown in a window is left as is.
   */
  | { type: 'sleepLinks'; tabIds: Id[]; chromeTabIds?: number[] }
  /**
   * Puts the native groups of every window in TabFlow order (spaces, then tiles) — after the page
   * changed the order of tiles or spaces, or moved a group to another space.
   */
  | { type: 'arrangeGroups' }
  /**
   * Adds a backup file (see `backup/format.ts`): groups come stowed, what is already there stays.
   * `replace` — spaces, groups and the queue go to the trash first (open groups are closed).
   */
  | { type: 'importBackup'; backup: Backup; replace: boolean }
  /** Undo of an import: the added records go, the replaced ones come back from the trash. */
  | { type: 'undoImport'; undo: ImportUndo; mode?: RestoreMode }
  /**
   * From the content script of a video page: duration and position of its video. Only accepted
   * from content scripts — the background takes the page from the sender tab.
   */
  | ({ type: 'videoProgress' } & VideoReport);

/** Screens of the main page the popup opens directly. */
export const APP_SCREENS = ['tidy'] as const;
export type AppScreen = (typeof APP_SCREENS)[number];

/** One group of «Разложить вкладки». */
export interface TabGrouping {
  title: string;
  color: GroupColor;
  chromeTabIds: number[];
  joinChromeGroupId?: number;
}

/** Where the grouped tabs were: undo puts them back. */
export interface GroupingUndo {
  tabs: { chromeTabId: number; windowId: number; index: number }[];
}

/** What `undoCloseDuplicates` brings back. */
export interface DuplicatesUndo {
  /** Closed tabs outside TabFlow groups: opened again. */
  reopen: { url: string; windowId: number; index: number }[];
  /** Links (or the groups their last link took along) in the trash, in the order removed. */
  restore: { kind: 'tab' | 'group'; id: Id; reopen: boolean }[];
}

/** What the content script of a video page reports (see `entrypoints/video.content.ts`). */
export interface VideoReport {
  positionSec: number;
  durationSec?: number;
  /** The video has played to its end. */
  ended?: boolean;
  /** First report of a newly loaded video: the answer may ask to continue from the saved place. */
  loaded?: boolean;
  /** From the top frame: the page title and the channel, when the page shows them. */
  title?: string;
  channel?: string;
  /** The page has no video of its own, but frames of these origins may play it. */
  playerOrigins?: string[];
}

/**
 * How restored tabs wait until opened (see `restoreGroup`), chosen on the settings page;
 * `placeholder` is the default.
 */
export const RESTORE_MODES = ['placeholder', 'background'] as const;
export type RestoreMode = (typeof RESTORE_MODES)[number];

export type CommandType = Command['type'];

export interface CommandResult {
  /** Groups affected (collapse all, delete a space). */
  groups: number;
  /** Tabs saved, put to sleep, opened or deleted. */
  tabs: number;
  /** Tabs that could not be put to sleep or opened (their links stay saved). */
  failed: number;
  /** Groups whose tabs this command closed: undo puts them back on the tab strip. */
  closedGroupIds: Id[];
  /** `moveTab`: where the link was, for undo. */
  movedFrom?: MovedFrom;
  /** Title of the group the command stowed, put to sleep or saved into. */
  groupTitle?: string;
  /** Queue commands: the video and its place in the queue. */
  video?: QueuedVideo;
  /** `videoProgress`: the page should continue the video from here (the saved position). */
  seekToSec?: number;
  /** `importBackup`: what was added and how to undo it. */
  imported?: ImportReport;
  /** `closeDuplicates`: links moved to the trash (`tabs` — tabs closed) and how to undo. */
  duplicates?: { links: number; undo: DuplicatesUndo };
  /** `groupTabs`: how to undo (`groups`, `tabs` — what was grouped). */
  grouped?: GroupingUndo;
}

/** What `undoImport` takes back: the ids an import added and the ones it moved to the trash. */
export interface ImportUndo {
  spaces: Id[];
  groups: Id[];
  queue: Id[];
  layouts: Id[];
  /** «Заменить»: what went to the trash before the import. */
  trashed?: { spaces: Id[]; groups: Id[]; queue: Id[] };
  /** «Заменить» closed these open groups: undo puts them back on the tab strip. */
  reopenGroupIds: Id[];
}

export interface ImportReport {
  groups: number;
  tabs: number;
  videos: number;
  layouts: number;
  /** Already in TabFlow: not added again. */
  skipped: number;
  replaced: boolean;
  undo: ImportUndo;
}

export interface QueuedVideo {
  itemId: Id;
  title: string;
  /** 1-based position in the queue; 0 when the video is not queued (watched, removed). */
  priority: number;
  /** `false` — the video was already in the queue. */
  created: boolean;
  /** `setWatched`: the place the video had in the queue before (for undo). */
  wasPriority?: number;
}

export interface MovedFrom {
  groupId: Id;
  index: number;
  /** The link was the last one: its group went to the trash. */
  groupDeleted: boolean;
  /** That group was on the tab strip. */
  groupWasOnStrip: boolean;
}

export type CommandErrorCode =
  | 'invalid-command'
  | 'group-not-found'
  | 'group-not-on-tab-strip'
  | 'group-empty'
  | 'restore-failed'
  | 'space-not-found'
  | 'space-protected'
  | 'tab-not-found'
  | 'tab-not-in-group'
  | 'tab-not-saveable'
  | 'not-in-trash'
  | 'page-not-queueable'
  | 'video-not-found'
  | 'invalid-backup'
  | 'unexpected';

export type CommandResponse =
  { ok: true; result: CommandResult } | { ok: false; code: CommandErrorCode; message: string };

/** An expected failure with a code the UI can turn into a message. */
export class CommandError extends Error {
  constructor(
    readonly code: CommandErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = 'CommandError';
  }
}

const isId = (value: unknown): value is Id => typeof value === 'string' && value !== '';
const isOptional = (value: unknown, check: (value: unknown) => boolean) =>
  value === undefined || check(value);
const isMode = (value: unknown) => RESTORE_MODES.includes(value as RestoreMode);
const isColor = (value: unknown) => GROUP_COLORS.includes(value as GroupColor);
const isTitle = (value: unknown) => typeof value === 'string';
const isIndex = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;
const isSeconds = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1e7;
const isFlag = (value: unknown) => isOptional(value, (v) => typeof v === 'boolean');
const isText = (max: number) => (value: unknown) =>
  isOptional(value, (v) => typeof v === 'string' && v.length <= max);
const isUrl = (value: unknown) => typeof value === 'string' && value !== '';
/** Origins of embedded players: `https://player.vimeo.com`. */
const ORIGIN = /^https?:\/\/[^/]+$/;
const isOrigins = (value: unknown) =>
  isOptional(
    value,
    (list) =>
      Array.isArray(list) &&
      list.length <= 5 &&
      list.every((origin) => typeof origin === 'string' && ORIGIN.test(origin)),
  );

const isIds = (value: unknown) => Array.isArray(value) && value.every(isId);
/** The backup is checked field by field in the background (`readBackup`); here only its shape. */
const isBackupLike = (value: unknown) =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && 'format' in value;
const isImportUndo = (value: unknown) => {
  if (typeof value !== 'object' || value === null) return false;
  const undo = value as Record<string, unknown>;
  const trashed = undo.trashed as Record<string, unknown> | undefined;
  return (
    ['spaces', 'groups', 'queue', 'layouts', 'reopenGroupIds'].every((key) => isIds(undo[key])) &&
    (trashed === undefined ||
      (typeof trashed === 'object' &&
        trashed !== null &&
        ['spaces', 'groups', 'queue'].every((key) => isIds(trashed[key]))))
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isTabIds = (value: unknown) =>
  Array.isArray(value) && value.length > 0 && value.length <= 500 && value.every(isIndex);
const isTabGrouping = (value: unknown) =>
  isRecord(value) &&
  Object.keys(value).every((key) =>
    ['title', 'color', 'chromeTabIds', 'joinChromeGroupId'].includes(key),
  ) &&
  typeof value.title === 'string' &&
  value.title.length <= 200 &&
  isColor(value.color) &&
  isTabIds(value.chromeTabIds) &&
  isOptional(value.joinChromeGroupId, isIndex);
const isPlace = (value: unknown, url: boolean) =>
  isRecord(value) &&
  isIndex(value.windowId) &&
  isIndex(value.index) &&
  (url ? isUrl(value.url) : isIndex(value.chromeTabId));
const isGroupingUndo = (value: unknown) =>
  isRecord(value) &&
  Array.isArray(value.tabs) &&
  value.tabs.length <= 500 &&
  value.tabs.every((tab) => isPlace(tab, false));
const isDuplicatesUndo = (value: unknown) =>
  isRecord(value) &&
  Array.isArray(value.reopen) &&
  value.reopen.length <= 1000 &&
  value.reopen.every((tab) => isPlace(tab, true)) &&
  Array.isArray(value.restore) &&
  value.restore.length <= 1000 &&
  value.restore.every(
    (item) =>
      isRecord(item) &&
      (item.kind === 'tab' || item.kind === 'group') &&
      isId(item.id) &&
      typeof item.reopen === 'boolean',
  );

/** Allowed fields per command; anything else in the message makes it invalid. */
const VALIDATORS: Record<CommandType, Record<string, (value: unknown) => boolean>> = {
  collapseAll: {},
  sleepGroup: { groupId: isId },
  stowGroup: { groupId: isId },
  restoreGroup: { groupId: isId, mode: (v) => isOptional(v, isMode) },
  editGroup: {
    groupId: isId,
    title: (v) => isOptional(v, isTitle),
    color: (v) => isOptional(v, isColor),
  },
  deleteGroup: { groupId: isId },
  deleteSpace: { spaceId: isId },
  deleteTab: { tabId: isId },
  restoreDeleted: {
    kind: (v) => TRASH_KINDS.includes(v as TrashKind),
    id: isId,
    reopenGroupIds: (v) => isOptional(v, (ids) => Array.isArray(ids) && ids.every(isId)),
    mode: (v) => isOptional(v, isMode),
  },
  openTab: { tabId: isId },
  moveTab: { tabId: isId, groupId: isId, index: isIndex },
  stowCurrent: { chromeTabId: (v) => isOptional(v, isIndex) },
  sleepCurrent: { chromeTabId: (v) => isOptional(v, isIndex) },
  sleepInactive: {},
  stowSelected: {},
  saveToGroup: { chromeTabId: isIndex, groupId: isId },
  saveLink: {
    url: isUrl,
    title: (v) => isOptional(v, isTitle),
    groupId: (v) => isOptional(v, isId),
  },
  openApp: { screen: (v) => isOptional(v, (s) => APP_SCREENS.includes(s as AppScreen)) },
  closeDuplicates: {
    keys: (v) =>
      Array.isArray(v) &&
      v.length <= 1000 &&
      v.every((key) => typeof key === 'string' && key.length <= 5000),
  },
  undoCloseDuplicates: { undo: isDuplicatesUndo, mode: (v) => isOptional(v, isMode) },
  groupTabs: {
    groups: (v) => Array.isArray(v) && v.length <= 50 && v.every(isTabGrouping),
  },
  undoGroupTabs: { undo: isGroupingUndo },
  queueTab: { chromeTabId: (v) => isOptional(v, isIndex) },
  queueLink: { url: isUrl, title: (v) => isOptional(v, isTitle) },
  openVideo: { itemId: isId },
  moveVideo: { itemId: isId, index: isIndex },
  setWatched: { itemId: isId, watched: (v) => typeof v === 'boolean' },
  removeVideo: { itemId: isId },
  restoreVideo: { itemId: isId },
  sleepLinks: {
    tabIds: (v) => Array.isArray(v) && v.length <= MAX_TILES && v.every(isId),
    chromeTabIds: (v) =>
      isOptional(v, (ids) => Array.isArray(ids) && ids.length <= MAX_TILES && ids.every(isIndex)),
  },
  arrangeGroups: {},
  importBackup: { backup: isBackupLike, replace: (v) => typeof v === 'boolean' },
  undoImport: { undo: isImportUndo, mode: (v) => isOptional(v, isMode) },
  videoProgress: {
    positionSec: isSeconds,
    durationSec: (v) => isOptional(v, (d) => isSeconds(d) && (d as number) > 0),
    ended: isFlag,
    loaded: isFlag,
    title: isText(500),
    channel: isText(200),
    playerOrigins: isOrigins,
  },
};

/** Validates a message received by the background. */
export function isCommand(value: unknown): value is Command {
  if (typeof value !== 'object' || value === null) return false;
  const { type, ...fields } = value as Record<string, unknown>;
  if (typeof type !== 'string' || !Object.hasOwn(VALIDATORS, type)) return false;
  const validators = VALIDATORS[type as CommandType];
  return (
    Object.keys(fields).every((key) => Object.hasOwn(validators, key)) &&
    Object.entries(validators).every(([key, check]) => check(fields[key]))
  );
}

export function sendCommand(command: Command): Promise<CommandResponse> {
  return sendRuntimeMessage<CommandResponse>(command);
}
