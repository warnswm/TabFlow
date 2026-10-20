/**
 * Import of a backup file. «Добавить» only writes the database; «Заменить» first moves every
 * space, group and video to the trash the way deleting does — open groups are saved, then closed —
 * so the old data stays in the trash for 30 days and undo brings it back.
 */
import { BackupError, readBackup } from '../backup/format';
import { importBackup as addBackup, removeImported } from '../backup/import';
import type { Id } from '../db';
import { CommandError, type CommandResult, type ImportUndo, type RestoreMode } from '../messages';
import type { BackgroundContext } from './context';
import { restoreGroup, result } from './group-actions';
import { deleteGroup, deleteSpace, restoreDeleted } from './trash-actions';

export async function importBackup(
  ctx: BackgroundContext,
  file: unknown,
  replace: boolean,
): Promise<CommandResult> {
  let backup;
  try {
    backup = readBackup(file);
  } catch (error) {
    if (error instanceof BackupError) throw new CommandError('invalid-backup', error.code);
    throw error;
  }

  const replaced = replace ? await moveAllToTrash(ctx) : undefined;
  const outcome = await addBackup(ctx.db, ctx.clock, backup, { renewTakenIds: replace });
  const undo: ImportUndo = {
    ...outcome.ids,
    ...(replaced && { trashed: replaced.trashed }),
    reopenGroupIds: replaced?.closedGroupIds ?? [],
  };
  return result({
    groups: outcome.groups,
    tabs: outcome.tabs,
    closedGroupIds: replaced?.closedGroupIds ?? [],
    imported: {
      groups: outcome.groups,
      tabs: outcome.tabs,
      videos: outcome.videos,
      layouts: outcome.layouts,
      skipped: outcome.skipped,
      replaced: replace,
      undo,
    },
  });
}

/**
 * Spaces with their groups, the groups of «Входящие» and the whole queue go to the trash — groups
 * protected from deletion too: «Заменить» replaces everything, undo brings it all back.
 */
async function moveAllToTrash(ctx: BackgroundContext) {
  const { repos } = ctx;
  const trashed = { spaces: [] as Id[], groups: [] as Id[], queue: [] as Id[] };
  const closedGroupIds: Id[] = [];

  for (const space of await repos.spaces.list()) {
    if (space.isDefault) {
      for (const group of await repos.groups.listBySpace(space.id)) {
        closedGroupIds.push(
          ...(await deleteGroup(ctx, group.id, { ignoreLock: true })).closedGroupIds,
        );
        trashed.groups.push(group.id);
      }
    } else {
      closedGroupIds.push(
        ...(await deleteSpace(ctx, space.id, { ignoreLock: true })).closedGroupIds,
      );
      trashed.spaces.push(space.id);
    }
  }
  for (const video of [
    ...(await repos.queue.list('queued')),
    ...(await repos.queue.list('watched')),
  ]) {
    await repos.queue.remove(video.id);
    trashed.queue.push(video.id);
  }
  return { trashed, closedGroupIds };
}

/**
 * Undo of an import: the added records are removed, the replaced ones come back from the trash and
 * the groups «Заменить» closed return to the tab strip. What cannot come back any more is skipped.
 */
export async function undoImport(
  ctx: BackgroundContext,
  undo: ImportUndo,
  mode?: RestoreMode,
): Promise<CommandResult> {
  await removeImported(ctx.db, undo);
  const restored = result({});
  const { trashed } = undo;
  if (!trashed) return restored;

  const attempt = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch {
      restored.failed++;
    }
  };
  for (const id of trashed.spaces) await attempt(() => restoreDeleted(ctx, 'space', id));
  for (const id of trashed.groups) await attempt(() => restoreDeleted(ctx, 'group', id));
  for (const id of trashed.queue) await attempt(() => ctx.repos.queue.restore(id));
  for (const groupId of undo.reopenGroupIds) {
    await attempt(async () => {
      restored.tabs += (await restoreGroup(ctx, groupId, mode)).tabs;
    });
  }
  return restored;
}
