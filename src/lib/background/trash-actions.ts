/**
 * Deleting to the trash and bringing back. Same rule as stowing: the database is written first,
 * tabs are closed only after that. A group on the tab strip is stowed before it goes to the trash,
 * so the mirror never sees a deleted group with open tabs and it comes back from the trash stowed.
 */
import type { Id } from '../db';
import { CommandError, type CommandResult, type RestoreMode, type TrashKind } from '../messages';
import type { BackgroundContext } from './context';
import { closeTabs, requireGroup, restoreGroup, result, stowInDb } from './group-actions';

/** Moves the group to the trash; if it is on the tab strip, its tabs are closed afterwards. */
export async function deleteGroup(ctx: BackgroundContext, groupId: Id): Promise<CommandResult> {
  const { repos } = ctx;
  const group = await requireGroup(ctx, groupId);

  if (group.chromeGroupId === undefined) {
    const tabs = (await repos.tabs.listByGroup(group.id)).length;
    await repos.groups.remove(group.id);
    return result({ groups: 1, tabs });
  }

  const plan = await stowInDb(ctx, group.chromeGroupId);
  if (plan.groupId !== undefined) await repos.groups.remove(plan.groupId);
  await closeTabs(ctx, plan.closeIds, plan.ungroupIds);
  return result({
    groups: 1,
    tabs: plan.saved,
    closedGroupIds: plan.groupId === undefined ? [] : [plan.groupId],
  });
}

/** Moves the space with all its groups to the trash; its groups on the tab strip are closed. */
export async function deleteSpace(ctx: BackgroundContext, spaceId: Id): Promise<CommandResult> {
  const { repos } = ctx;
  const space = await repos.spaces.get(spaceId);
  if (!space) throw new CommandError('space-not-found', `Space ${spaceId} not found`);
  if (space.isDefault) throw new CommandError('space-protected', 'The default space stays');

  const closeIds: number[] = [];
  const ungroupIds: number[] = [];
  const closedGroupIds: Id[] = [];
  let groups = 0;
  let tabs = 0;
  for (const group of await repos.groups.listBySpace(space.id)) {
    if (group.chromeGroupId === undefined) {
      groups++;
      tabs += (await repos.tabs.listByGroup(group.id)).length;
      continue;
    }
    const plan = await stowInDb(ctx, group.chromeGroupId);
    closeIds.push(...plan.closeIds);
    ungroupIds.push(...plan.ungroupIds);
    if (plan.groupId !== undefined) {
      closedGroupIds.push(plan.groupId);
      groups++;
      tabs += plan.saved;
    }
  }

  await repos.spaces.remove(space.id);
  await closeTabs(ctx, closeIds, ungroupIds);
  return result({ groups, tabs, closedGroupIds });
}

/** Moves a link to the trash and closes its tab. The last link of a group takes the group along. */
export async function deleteTab(ctx: BackgroundContext, tabId: Id): Promise<CommandResult> {
  const { api, repos } = ctx;
  const tab = await repos.tabs.get(tabId);
  if (!tab) throw new CommandError('tab-not-found', `Tab ${tabId} not found`);

  if ((await repos.tabs.listByGroup(tab.groupId)).length <= 1) {
    return deleteGroup(ctx, tab.groupId);
  }

  await repos.tabs.remove(tab.id);
  if (tab.chromeTabId !== undefined && (await api.getTab(tab.chromeTabId))) {
    await closeTabs(ctx, [tab.chromeTabId]);
  }
  return result({ tabs: 1 });
}

/**
 * Brings a space, group or link back from the trash. Groups come back stowed; `reopenGroupIds`
 * are put back on the tab strip afterwards (undo of a delete that closed them).
 */
export async function restoreDeleted(
  ctx: BackgroundContext,
  kind: TrashKind,
  id: Id,
  reopenGroupIds: readonly Id[] = [],
  mode?: RestoreMode,
): Promise<CommandResult> {
  const { db, repos } = ctx;
  const record =
    kind === 'space'
      ? await db.spaces.get(id)
      : kind === 'group'
        ? await db.groups.get(id)
        : await db.tabs.get(id);
  if (record?.deletedAt === undefined) {
    throw new CommandError('not-in-trash', `${kind} ${id} is not in the trash`);
  }

  let restored: CommandResult;
  if (kind === 'tab') {
    restored = await restoreTab(ctx, id);
  } else {
    if (kind === 'space') await repos.spaces.restore(id);
    else await repos.groups.restore(id);
    restored = result({ groups: 1 });
  }

  for (const groupId of reopenGroupIds) {
    try {
      const reopened = await restoreGroup(ctx, groupId, mode);
      restored.tabs += reopened.tabs;
      restored.failed += reopened.failed;
    } catch {
      // Not reopened: the group stays stowed with its links.
    }
  }
  return restored;
}

/**
 * Restores a link to its group. If the group is on the tab strip, the link opens there as well:
 * a saved tab without an open tab in a mirrored group would go back to the trash at the next sync.
 */
async function restoreTab(ctx: BackgroundContext, id: Id): Promise<CommandResult> {
  const { api, repos } = ctx;
  await repos.tabs.restore(id);
  const tab = await repos.tabs.get(id);
  const group = tab && (await repos.groups.get(tab.groupId));
  if (!tab || group?.chromeGroupId === undefined || group.windowId === undefined) {
    return result({ tabs: 1 });
  }

  try {
    const chromeTab = await api.createTab({
      windowId: group.windowId,
      url: tab.url,
      active: false,
    });
    await repos.tabs.update(tab.id, { chromeTabId: chromeTab.id });
    await api.addTabsToGroup([chromeTab.id], group.chromeGroupId);
    return result({ tabs: 1 });
  } catch {
    return result({ failed: 1 });
  }
}
