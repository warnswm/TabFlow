/**
 * Commands from extension pages (main page, popup, side panel) to the background.
 * Pages read the database directly; anything that touches Chrome tabs goes through these commands,
 * so the background runs it in one queue with the browser events.
 */
import { sendRuntimeMessage } from './browser-api';
import type { Id } from './db/models';

export type Command =
  | { type: 'collapseAll' }
  | { type: 'sleepGroup'; groupId: Id }
  | { type: 'stowGroup'; groupId: Id }
  | { type: 'restoreGroup'; groupId: Id; mode?: RestoreMode };

/**
 * How restored tabs wait until opened (see `restoreGroup`). Both are kept: the choice moves to
 * the settings at stage 7; `placeholder` is the default.
 */
export const RESTORE_MODES = ['placeholder', 'background'] as const;
export type RestoreMode = (typeof RESTORE_MODES)[number];

export type CommandType = Command['type'];

export interface CommandResult {
  /** Groups affected (collapse all). */
  groups: number;
  /** Tabs saved, put to sleep or opened. */
  tabs: number;
  /** Tabs that could not be put to sleep or opened (their links stay saved). */
  failed: number;
}

export type CommandErrorCode =
  | 'invalid-command'
  | 'group-not-found'
  | 'group-not-on-tab-strip'
  | 'group-empty'
  | 'restore-failed'
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

const GROUP_COMMANDS: readonly CommandType[] = ['sleepGroup', 'stowGroup', 'restoreGroup'];

/** Validates a message received by the background. */
export function isCommand(value: unknown): value is Command {
  if (typeof value !== 'object' || value === null) return false;
  const { type, groupId, mode } = value as { type?: unknown; groupId?: unknown; mode?: unknown };
  if (type === 'collapseAll') return true;
  if (
    mode !== undefined &&
    (type !== 'restoreGroup' || !RESTORE_MODES.includes(mode as RestoreMode))
  )
    return false;
  return (
    GROUP_COMMANDS.includes(type as CommandType) && typeof groupId === 'string' && groupId !== ''
  );
}

export function sendCommand(command: Command): Promise<CommandResponse> {
  return sendRuntimeMessage<CommandResponse>(command);
}
