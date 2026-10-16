/**
 * What «Отменить» in the toast does after a command. Undo is a new command, run by the background
 * like any other: stowed groups go back on the tab strip, deleted things come back from the trash
 * (groups the delete closed are reopened).
 */
import type { Command, CommandResult, RestoreMode } from '../messages';

/** Commands that undo `command`, in order; `undefined` when there is nothing to undo. */
export function undoCommands(
  command: Command,
  result: CommandResult,
  mode: RestoreMode,
): Command[] | undefined {
  const reopenGroupIds = result.closedGroupIds;
  switch (command.type) {
    case 'collapseAll':
    case 'stowGroup':
      return reopenGroupIds.length === 0
        ? undefined
        : reopenGroupIds.map((groupId) => ({ type: 'restoreGroup', groupId, mode }));
    case 'deleteGroup':
      return result.groups === 0
        ? undefined
        : [{ type: 'restoreDeleted', kind: 'group', id: command.groupId, reopenGroupIds, mode }];
    case 'deleteSpace':
      return [{ type: 'restoreDeleted', kind: 'space', id: command.spaceId, reopenGroupIds, mode }];
    case 'deleteTab':
      return [{ type: 'restoreDeleted', kind: 'tab', id: command.tabId, reopenGroupIds, mode }];
    default:
      // Sleep is undone by «Разбудить»; restoring, editing and opening need no undo.
      return undefined;
  }
}
