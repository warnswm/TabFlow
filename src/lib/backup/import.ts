/**
 * Adds a backup to the database; nothing that is already there is changed or removed.
 *
 * - Spaces: «Входящие» of the file go to «Входящие»; another space joins the live space with the
 *   same name (case and «ё» do not matter), otherwise it is created after the last one.
 * - Groups come stowed — their tabs are not open in this browser — at the end of their space, in
 *   the order of the file. A group whose id is already in the database (live or in the trash) is
 *   skipped: it is the same group, imported or restored before. A group without links is skipped.
 *   With `renewTakenIds` («Заменить»: the old records are in the trash now) it comes in anyway,
 *   under a new id; so do videos.
 * - Videos: one already in the queue (same `videoKey`) is skipped, the rest go to its end.
 * - Layouts of «Рядом»: one with an id already there is skipped.
 *
 * Everything runs in one transaction: either the whole file is added or nothing is.
 */
import { orderAfterLast, orderBetween } from '../db/order';
import { type Clock, liveOnly, newId } from '../db/repositories/common';
import { SpaceRepository } from '../db/repositories/spaces';
import type { TabFlowDB } from '../db/db';
import type { Id, LayoutLink, TabGroup } from '../db/models';
import { videoKey } from '../queue/video-url';
import type { Backup, BackupTab } from './format';

/** What an import added — undo removes exactly this. */
export interface ImportedIds {
  spaces: Id[];
  groups: Id[];
  queue: Id[];
  layouts: Id[];
}

export interface ImportOutcome {
  ids: ImportedIds;
  groups: number;
  tabs: number;
  videos: number;
  layouts: number;
  /** Groups, videos and layouts that were already in TabFlow. */
  skipped: number;
}

const byOrder = <T extends { order: number }>(records: readonly T[]): T[] =>
  [...records].sort((a, b) => a.order - b.order);

/** Space names match regardless of case, «ё» and spaces around. */
const nameKey = (name: string) => name.trim().toLocaleLowerCase('ru').replaceAll('ё', 'е');

export async function importBackup(
  db: TabFlowDB,
  clock: Clock,
  backup: Backup,
  { renewTakenIds = false } = {},
): Promise<ImportOutcome> {
  return db.transaction('rw', [db.spaces, db.groups, db.tabs, db.queue, db.layouts], async () => {
    const now = clock();
    const ids: ImportedIds = { spaces: [], groups: [], queue: [], layouts: [] };
    const outcome: ImportOutcome = { ids, groups: 0, tabs: 0, videos: 0, layouts: 0, skipped: 0 };

    // Spaces.
    const inbox = await new SpaceRepository(db, clock).ensureDefault();
    const liveSpaces = liveOnly(await db.spaces.toArray());
    const spaceByName = new Map(
      liveSpaces
        .filter((space) => !space.isDefault)
        .map((space) => [nameKey(space.name), space.id]),
    );
    const spaceOf = new Map<Id, Id>();
    let spaceOrder = orderAfterLast(liveSpaces);
    for (const space of byOrder(backup.spaces)) {
      if (space.isDefault) {
        spaceOf.set(space.id, inbox.id);
        continue;
      }
      const existing = spaceByName.get(nameKey(space.name));
      if (existing !== undefined) {
        spaceOf.set(space.id, existing);
        continue;
      }
      const id = (await db.spaces.get(space.id)) ? newId() : space.id;
      await db.spaces.add({ ...space, id, isDefault: false, order: spaceOrder });
      spaceOrder = orderBetween(spaceOrder, undefined);
      spaceByName.set(nameKey(space.name), id);
      spaceOf.set(space.id, id);
      ids.spaces.push(id);
    }

    // Groups with their links.
    const tabsOf = new Map<Id, BackupTab[]>();
    for (const tab of backup.tabs) {
      const list = tabsOf.get(tab.groupId) ?? [];
      list.push(tab);
      tabsOf.set(tab.groupId, list);
    }
    /** New ids of links whose id was taken — layouts follow them. */
    const tabIdOf = new Map<Id, Id>();
    const nextGroupOrder = new Map<Id, number>();
    for (const group of byOrder(backup.groups)) {
      const tabs = byOrder(tabsOf.get(group.id) ?? []);
      if (tabs.length === 0) continue;
      const taken = (await db.groups.get(group.id)) !== undefined;
      if (taken && !renewTakenIds) {
        outcome.skipped++;
        continue;
      }
      const groupId = taken ? newId() : group.id;
      const spaceId = spaceOf.get(group.spaceId) ?? inbox.id;
      const order =
        nextGroupOrder.get(spaceId) ??
        orderAfterLast(liveOnly(await db.groups.where('spaceId').equals(spaceId).toArray()));
      nextGroupOrder.set(spaceId, orderBetween(order, undefined));
      const stowed: TabGroup = {
        ...group,
        id: groupId,
        spaceId,
        order,
        state: 'stowed',
        stateChangedAt: group.state === 'stowed' ? (group.stateChangedAt ?? now) : now,
      };
      await db.groups.add(stowed);
      ids.groups.push(groupId);
      outcome.groups++;

      for (const tab of tabs) {
        const id = (await db.tabs.get(tab.id)) ? newId() : tab.id;
        if (id !== tab.id) tabIdOf.set(tab.id, id);
        await db.tabs.add({ ...tab, id, groupId });
        outcome.tabs++;
      }
    }

    // Queue.
    const liveVideos = liveOnly(await db.queue.toArray());
    const videoKeys = new Set(liveVideos.map((video) => videoKey(video.url)));
    let videoOrder = orderAfterLast(liveVideos);
    for (const video of byOrder(backup.queue)) {
      const key = videoKey(video.url);
      const taken = (await db.queue.get(video.id)) !== undefined;
      if (videoKeys.has(key) || (taken && !renewTakenIds)) {
        outcome.skipped++;
        continue;
      }
      const id = taken ? newId() : video.id;
      await db.queue.add({ ...video, id, order: videoOrder });
      videoOrder = orderBetween(videoOrder, undefined);
      videoKeys.add(key);
      ids.queue.push(id);
      outcome.videos++;
    }

    // Layouts of «Рядом».
    let layoutOrder = orderAfterLast(await db.layouts.toArray());
    for (const layout of byOrder(backup.layouts)) {
      if (await db.layouts.get(layout.id)) {
        outcome.skipped++;
        continue;
      }
      const links: LayoutLink[] = [];
      for (const link of layout.links) links.push(await relink(db, link, tabIdOf));
      await db.layouts.add({ ...layout, links, order: layoutOrder });
      layoutOrder = orderBetween(layoutOrder, undefined);
      ids.layouts.push(layout.id);
      outcome.layouts++;
    }
    return outcome;
  });
}

/**
 * A layout link keeps its saved link only when that link is in the database with the same address;
 * otherwise the copy of the address opens the page.
 */
async function relink(
  db: TabFlowDB,
  link: LayoutLink,
  tabIdOf: ReadonlyMap<Id, Id>,
): Promise<LayoutLink> {
  const { url, title } = link;
  if (link.tabId === undefined) return { url, title };
  const tabId = tabIdOf.get(link.tabId) ?? link.tabId;
  const tab = await db.tabs.get(tabId);
  return tab?.url === url ? { tabId, url, title } : { url, title };
}

/**
 * Undo of an import: the added records are removed for good — they were not there before.
 * A group already put back on the tab strip stays, and so does a space that holds other groups.
 */
export async function removeImported(db: TabFlowDB, ids: ImportedIds): Promise<void> {
  await db.transaction('rw', [db.spaces, db.groups, db.tabs, db.queue, db.layouts], async () => {
    for (const groupId of ids.groups) {
      const group = await db.groups.get(groupId);
      if (!group || group.chromeGroupId !== undefined) continue;
      await db.tabs.where('groupId').equals(groupId).delete();
      await db.groups.delete(groupId);
    }
    for (const spaceId of ids.spaces) {
      const left = await db.groups.where('spaceId').equals(spaceId).count();
      if (left === 0) await db.spaces.delete(spaceId);
    }
    await db.queue.bulkDelete(ids.queue);
    await db.layouts.bulkDelete(ids.layouts);
  });
}
