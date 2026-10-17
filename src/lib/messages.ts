/**
 * Commands from extension pages (main page, popup, side panel) to the background.
 * Pages read the database directly; anything that touches Chrome tabs goes through these commands,
 * so the background runs it in one queue with the browser events.
 */
import { sendRuntimeMessage } from './browser-api';
import { GROUP_COLORS, type GroupColor, type Id } from './db/models';

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
  | { type: 'moveTab'; tabId: Id; groupId: Id; index: number };

/**
 * How restored tabs wait until opened (see `restoreGroup`). Both are kept: the choice moves to
 * the settings at stage 7; `placeholder` is the default.
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
  | 'not-in-trash'
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
