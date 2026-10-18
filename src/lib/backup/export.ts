/**
 * Builds the backup file from the database: live records only (the trash stays behind), without
 * the links to Chrome. The page saves it as a JSON file.
 */
import type { Repositories, Timestamp } from '../db';
import { BACKUP_FORMAT, BACKUP_VERSION, type Backup, type BackupSettings } from './format';

export async function createBackup(
  repos: Repositories,
  settings: BackupSettings,
  now: Timestamp,
): Promise<Backup> {
  const [spaces, groups, tabs, queued, watched, layouts] = await Promise.all([
    repos.spaces.list(),
    repos.groups.listAll(),
    repos.tabs.listAll(),
    repos.queue.list('queued'),
    repos.queue.list('watched'),
    repos.layouts.list(),
  ]);
  const spaceIds = new Set(spaces.map((space) => space.id));
  const liveGroups = groups.filter((group) => spaceIds.has(group.spaceId));
  const groupIds = new Set(liveGroups.map((group) => group.id));

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now,
    spaces: spaces.map((space) => without(space, ['deletedAt'])),
    groups: liveGroups.map((group) => without(group, ['deletedAt', 'chromeGroupId', 'windowId'])),
    tabs: tabs
      .filter((tab) => groupIds.has(tab.groupId))
      .map((tab) => without(tab, ['deletedAt', 'chromeTabId'])),
    queue: [...queued, ...watched].map((video) => without(video, ['deletedAt', 'playerOrigins'])),
    layouts,
    settings,
  };
}

/** The backup as the text of the file. */
export function backupText(backup: Backup): string {
  return JSON.stringify(backup, null, 2);
}

function without<T extends object, K extends keyof T>(record: T, keys: readonly K[]): Omit<T, K> {
  const dropped = new Set<PropertyKey>(keys);
  const kept = Object.entries(record).filter(([key]) => !dropped.has(key));
  return Object.fromEntries(kept) as Omit<T, K>;
}
