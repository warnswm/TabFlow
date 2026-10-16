/**
 * The trash page. Things deleted together are shown once: a space lists the groups deleted with
 * it, a group — its links. Only what was deleted on its own is a separate row.
 */
import type { Repositories } from '../db';
import type { Id, SavedTab, Space, TabGroup, Timestamp } from '../db/models';
import { TRASH_RETENTION_MS, type TrashContents } from '../db/repositories/trash';

export interface TrashEntry<T> {
  record: T;
  deletedAt: Timestamp;
  /** When it disappears for good. */
  expiresAt: Timestamp;
}

export interface TrashedSpace extends TrashEntry<Space> {
  groups: number;
  tabs: number;
}

export interface TrashedGroup extends TrashEntry<TabGroup> {
  tabs: number;
}

export interface TrashedTab extends TrashEntry<SavedTab> {
  /** Title of the group the link comes back to. */
  groupTitle: string;
}

export interface TrashView {
  spaces: TrashedSpace[];
  groups: TrashedGroup[];
  tabs: TrashedTab[];
  isEmpty: boolean;
}

function entry<T extends { deletedAt?: Timestamp }>(record: T): TrashEntry<T> {
  const deletedAt = record.deletedAt ?? 0;
  return { record, deletedAt, expiresAt: deletedAt + TRASH_RETENTION_MS };
}

/** `trash` is newest first (see `TrashRepository.list`); `liveGroups` — for link rows. */
export function buildTrashView(trash: TrashContents, liveGroups: readonly TabGroup[]): TrashView {
  const deletedSpaces = new Map(trash.spaces.map((space) => [space.id, space]));
  const allGroups = new Map<Id, TabGroup>(
    [...liveGroups, ...trash.groups].map((group) => [group.id, group]),
  );

  const tabsDeletedWith = new Map<Id, number>();
  const tabs: TrashedTab[] = [];
  for (const tab of trash.tabs) {
    const group = allGroups.get(tab.groupId);
    if (group?.deletedAt !== undefined && group.deletedAt === tab.deletedAt) {
      tabsDeletedWith.set(group.id, (tabsDeletedWith.get(group.id) ?? 0) + 1);
    } else {
      tabs.push({ ...entry(tab), groupTitle: group?.title ?? '' });
    }
  }

  const groups: TrashedGroup[] = [];
  const spaceTotals = new Map<Id, { groups: number; tabs: number }>();
  for (const group of trash.groups) {
    const groupTabs = tabsDeletedWith.get(group.id) ?? 0;
    const space = deletedSpaces.get(group.spaceId);
    if (space && space.deletedAt === group.deletedAt) {
      const totals = spaceTotals.get(space.id) ?? { groups: 0, tabs: 0 };
      totals.groups++;
      totals.tabs += groupTabs;
      spaceTotals.set(space.id, totals);
    } else {
      groups.push({ ...entry(group), tabs: groupTabs });
    }
  }

  const spaces = trash.spaces.map((space) => ({
    ...entry(space),
    ...(spaceTotals.get(space.id) ?? { groups: 0, tabs: 0 }),
  }));

  return {
    spaces,
    groups,
    tabs,
    isEmpty: spaces.length === 0 && groups.length === 0 && tabs.length === 0,
  };
}

export async function loadTrashView(repos: Repositories): Promise<TrashView> {
  const [trash, liveGroups] = await Promise.all([repos.trash.list(), repos.groups.listAll()]);
  return buildTrashView(trash, liveGroups);
}
