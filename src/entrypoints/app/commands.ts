/**
 * Runs a background command from the main page and reports the result in the toast,
 * with «Отменить» when the command can be undone (see `undoCommands`).
 */
import { undoCommands } from '@/lib/app/undo';
import { describeResponse } from '@/lib/command-messages';
import { repositories, type Space, type TabGroup } from '@/lib/db';
import { type Command, type CommandResponse, sendCommand } from '@/lib/messages';
import { useUi } from './store';
import { localized } from '@/lib/i18n';
import { words } from '@/lib/i18n/words';
import { untitled } from './ui';

const text = localized({
  ru: {
    noAnswer: 'Фоновая часть TabFlow не ответила. Вкладки и ссылки остались на месте.',
    undone: 'Отменено.',
    moved: (group: string, space: string) => `Группа ${group} перенесена в ${space}.`,
    stayed: (space: string) => `Группа осталась в ${space} — исходного пространства уже нет.`,
    notMoved: 'Группа не перенесена — она осталась на месте.',
  },
  en: {
    noAnswer: 'The TabFlow background did not answer. Tabs and links stay where they are.',
    undone: 'Undone.',
    moved: (group: string, space: string) => `Group ${group} moved to ${space}.`,
    stayed: (space: string) => `The group stays in ${space} — the original space is gone.`,
    notMoved: 'The group was not moved — it stays where it was.',
  },
});

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
    showToast(text().noAnswer);
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
 * After the page changed the order of tiles or spaces: the groups on the tab strip follow it.
 * Cosmetic — nothing to report when the background does not answer.
 */
export function arrangeTabStrip(): void {
  sendCommand({ type: 'arrangeGroups' }).catch(() => undefined);
}

/**
 * Moves a group to another space (menu «Перенести в», a tile dropped on a space).
 * A database change; on the tab strip the group only takes its place by the new order.
 * Undo puts it back to its place.
 */
export async function moveGroupToSpace(group: TabGroup, space: Space): Promise<void> {
  const { showToast } = useUi.getState();
  const from = group.spaceId;
  try {
    const index = (await repositories.groups.listBySpace(from)).findIndex((g) => g.id === group.id);
    await repositories.groups.move(group.id, space.id);
    arrangeTabStrip();
    const quote = words().quote;
    showToast(text().moved(quote(group.title || untitled()), quote(space.name)), () => {
      repositories.groups
        .place(group.id, from, Math.max(index, 0))
        .then(() => {
          arrangeTabStrip();
          showToast(text().undone);
        })
        .catch(() => showToast(text().stayed(quote(space.name))));
    });
  } catch {
    showToast(text().notMoved);
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
    showToast(text().undone);
  } catch {
    showToast(text().noAnswer);
  }
}
