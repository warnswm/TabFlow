/**
 * Runs a background command from the main page and reports the result in the toast,
 * with «Отменить» when the command can be undone (see `undoCommands`).
 */
import { undoCommands } from '@/lib/app/undo';
import { describeResponse } from '@/lib/command-messages';
import { type Command, type CommandResponse, sendCommand } from '@/lib/messages';
import { useUi } from './store';

const NO_ANSWER = 'Фоновая часть TabFlow не ответила. Вкладки и ссылки остались на месте.';

export interface RunOptions {
  /** Title of the group or space, for the message. */
  name?: string;
  /** No toast on success: the result is visible anyway (opening a tab, editing). */
  quiet?: boolean;
}

export async function runCommand(
  command: Command,
  { name, quiet = false }: RunOptions = {},
): Promise<CommandResponse | undefined> {
  const { showToast, restoreMode } = useUi.getState();
  let response: CommandResponse;
  try {
    response = await sendCommand(command);
  } catch {
    showToast(NO_ANSWER);
    return undefined;
  }

  if (!response.ok) {
    showToast(describeResponse(command.type, response, name));
    return response;
  }
  if (quiet) return response;

  const undo = undoCommands(command, response.result, restoreMode);
  showToast(describeResponse(command.type, response, name), undo && (() => void runUndo(undo)));
  return response;
}

async function runUndo(commands: readonly Command[]): Promise<void> {
  const { showToast } = useUi.getState();
  try {
    for (const command of commands) {
      const response = await sendCommand(command);
      if (!response.ok) {
        showToast(describeResponse(command.type, response));
        return;
      }
    }
    showToast('Отменено.');
  } catch {
    showToast(NO_ANSWER);
  }
}
