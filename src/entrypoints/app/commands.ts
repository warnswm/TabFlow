/**
 * Runs a background command from the main page and reports the result in the toast,
 * with «Отменить» when the command can be undone (see `undoCommands`).
 */
import { undoCommands } from '@/lib/app/undo';
import { describeResponse } from '@/lib/command-messages';
import { repositories, type Space, type TabGroup } from '@/lib/db';
import { type Command, type CommandResponse, sendCommand } from '@/lib/messages';
import { useUi } from './store';
import { UNTITLED } from './ui';

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

/**
 * Moves a group to another space (menu «Перенести в», a tile dropped on a space).
 * Pure database change: the group stays where it is in Chrome. Undo puts it back to its place.
 */
export async function moveGroupToSpace(group: TabGroup, space: Space): Promise<void> {
  const { showToast } = useUi.getState();
  const from = group.spaceId;
  try {
    const index = (await repositories.groups.listBySpace(from)).findIndex((g) => g.id === group.id);
    await repositories.groups.move(group.id, space.id);
    showToast(`Группа «${group.title || UNTITLED}» перенесена в «${space.name}».`, () => {
      repositories.groups
        .place(group.id, from, Math.max(index, 0))
        .then(() => showToast('Отменено.'))
        .catch(() =>
          showToast(`Группа осталась в «${space.name}» — исходного пространства уже нет.`),
        );
    });
  } catch {
    showToast('Группа не перенесена — она осталась на месте.');
  }
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
