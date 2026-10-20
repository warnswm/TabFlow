import { describe, expect, it } from 'vitest';
import { setupTestDb, type TestContext } from '../db/test-utils';
import { backupText, createBackup } from './export';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type Backup,
  BackupError,
  backupFileName,
  parseBackup,
  summarizeBackup,
} from './format';
import { importBackup, removeImported } from './import';

const YT = (n: number) => `https://www.youtube.com/watch?v=video${n}`;

/** A TabFlow with «Входящие», a space «Работа», a stowed and an open group, two videos, a layout. */
async function fill(t: TestContext) {
  const inbox = await t.spaces.ensureDefault();
  const work = await t.spaces.create('Работа');
  const stowed = await t.groups.create({ spaceId: inbox.id, title: 'Статьи', color: 'blue' });
  const [article] = await t.tabs.addMany(stowed.id, [
    { url: 'https://example.com/a', title: 'A' },
    { url: 'https://example.com/b', title: 'B' },
  ]);
  const open = await t.groups.create({
    spaceId: work.id,
    title: 'Проект',
    color: 'green',
    state: 'active',
    chromeGroupId: 7,
    windowId: 1,
  });
  await t.tabs.addMany(open.id, [{ url: 'https://example.com/c', title: 'C', chromeTabId: 70 }]);
  const video = (await t.queue.add({ url: YT(1), title: 'Первое', site: 'youtube.com' })).item;
  await t.queue.add({ url: YT(2), title: 'Второе', site: 'youtube.com' });
  await t.queue.markWatched(video.id);
  const layout = await t.layouts.create('Пара', [
    { tabId: article?.id, url: 'https://example.com/a', title: 'A' },
    { url: 'https://example.org/', title: 'Org' },
  ]);
  return { inbox, work, stowed, open, layout };
}

async function exported(t: TestContext): Promise<Backup> {
  return createBackup(t, { badgeMode: 'queue' }, t.now.value);
}

describe('createBackup', () => {
  it('keeps live records without the links to Chrome', async () => {
    const t = setupTestDb();
    const { open } = await fill(t);
    const trashed = await t.groups.create({
      spaceId: open.spaceId,
      title: 'Удалённая',
      color: 'red',
    });
    await t.tabs.addMany(trashed.id, [{ url: 'https://example.com/x', title: 'X' }]);
    await t.groups.remove(trashed.id);

    const backup = await exported(t);

    expect(backup).toMatchObject({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: t.now.value,
      settings: { badgeMode: 'queue' },
    });
    expect(backup.spaces.map((s) => s.name)).toEqual(['Входящие', 'Работа']);
    expect(backup.groups.map((g) => g.title).sort()).toEqual(['Проект', 'Статьи']);
    expect(backup.tabs).toHaveLength(3);
    expect(backup.queue.map((v) => v.title).sort()).toEqual(['Второе', 'Первое']);
    expect(backup.layouts).toHaveLength(1);
    const text = backupText(backup);
    expect(text).not.toContain('chromeGroupId');
    expect(text).not.toContain('chromeTabId');
    expect(text).not.toContain('windowId');
    expect(text).not.toContain('Удалённая');
  });

  it('names the file by the date', () => {
    expect(backupFileName(new Date(2026, 9, 19, 23, 50).getTime())).toBe('tabflow-2026-10-19.json');
  });
});

describe('parseBackup', () => {
  it('reads back what was exported', async () => {
    const t = setupTestDb();
    await fill(t);
    const backup = await exported(t);

    expect(parseBackup(backupText(backup))).toEqual(backup);
    expect(summarizeBackup(backup)).toEqual({
      spaces: 1,
      groups: 2,
      tabs: 3,
      videos: 2,
      layouts: 1,
      exportedAt: t.now.value,
    });
  });

  it.each([
    ['not-json', '{ broken'],
    ['not-backup', '{"spaces": []}'],
    ['not-backup', '[1, 2]'],
    ['newer-version', JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION + 1 })],
  ])('rejects a file: %s', (code, text) => {
    expect(() => parseBackup(text)).toThrow(BackupError);
    try {
      parseBackup(text);
    } catch (error) {
      expect((error as BackupError).code).toBe(code);
    }
  });

  it('keeps notes, favorites, the lock and «Оставить»', async () => {
    const t = setupTestDb();
    const { stowed } = await fill(t);
    const [link] = await t.tabs.listByGroup(stowed.id);
    if (!link) throw new Error('no link');
    await t.groups.update(stowed.id, { note: 'Прочитать к пятнице', locked: true });
    await t.groups.setFavorite(stowed.id, true);
    await t.groups.markReviewed(stowed.id);
    await t.tabs.update(link.id, { note: 'Глава 2' });
    const [video] = await t.queue.list();
    if (!video) throw new Error('no video');
    await t.queue.markReviewed(video.id);

    const backup = parseBackup(backupText(await exported(t)));

    expect(backup.groups.find((g) => g.id === stowed.id)).toMatchObject({
      note: 'Прочитать к пятнице',
      favorite: true,
      locked: true,
      reviewedAt: t.now.value,
    });
    expect(backup.tabs.find((tab) => tab.id === link.id)?.note).toBe('Глава 2');
    expect(backup.queue.find((v) => v.id === video.id)?.reviewedAt).toBe(t.now.value);
  });

  it('skips records that do not fit and drops unknown fields', () => {
    const backup = parseBackup(
      JSON.stringify({
        format: BACKUP_FORMAT,
        version: 1,
        spaces: [
          { id: 's1', name: 'Работа', order: 1, isDefault: false, extra: 'x' },
          { name: '?' },
        ],
        groups: [
          { id: 'g1', spaceId: 's1', title: 'Ок', color: 'neon', state: 'zzz', order: 1 },
          { id: 'g2', title: 'Без пространства', order: 2 },
        ],
        tabs: [
          { id: 't1', groupId: 'g1', url: 'https://example.com/', title: 'Сайт', order: 1 },
          { id: 't2', groupId: 'g1', url: 'javascript:alert(1)', title: 'Код', order: 2 },
          { id: 't3', groupId: 'missing', url: 'https://example.com/', title: 'Сирота', order: 3 },
          { id: 't1', groupId: 'g1', url: 'https://example.com/dup', title: 'Повтор', order: 4 },
        ],
        queue: [{ id: 'v1', url: 'chrome://settings', title: 'Нет', order: 1 }],
        layouts: [{ id: 'l1', name: 'Одна', order: 1, links: [{ url: 'https://a.com/' }] }],
        settings: { badgeMode: 'nope', restoreMode: 'background' },
      }),
    );

    expect(backup.spaces).toEqual([
      { id: 's1', name: 'Работа', order: 1, isDefault: false, createdAt: 0, updatedAt: 0 },
    ]);
    expect(backup.groups).toEqual([
      expect.objectContaining({ id: 'g1', color: 'grey', state: 'stowed' }),
    ]);
    expect(backup.tabs.map((tab) => tab.title)).toEqual(['Сайт']);
    expect(backup.queue).toEqual([]);
    expect(backup.layouts).toEqual([]);
    expect(backup.settings).toEqual({ restoreMode: 'background' });
  });
});

describe('importBackup', () => {
  it('fills an empty TabFlow: groups come stowed, spaces and order as in the file', async () => {
    const source = setupTestDb();
    const { stowed, open } = await fill(source);
    const backup = await exported(source);
    const t = setupTestDb();

    const outcome = await importBackup(t.db, () => t.now.value, backup);

    expect(outcome).toMatchObject({ groups: 2, tabs: 3, videos: 2, layouts: 1, skipped: 0 });
    expect((await t.spaces.list()).map((s) => s.name)).toEqual(['Входящие', 'Работа']);
    const groups = await t.groups.listAll();
    expect(groups.map((g) => g.state)).toEqual(['stowed', 'stowed']);
    expect(groups.every((g) => g.chromeGroupId === undefined)).toBe(true);
    expect((await t.tabs.listByGroup(stowed.id)).map((tab) => tab.title)).toEqual(['A', 'B']);
    expect((await t.tabs.listByGroup(open.id)).map((tab) => tab.chromeTabId)).toEqual([undefined]);
    expect((await t.queue.list('queued')).map((v) => v.title)).toEqual(['Второе']);
    expect((await t.queue.list('watched')).map((v) => v.title)).toEqual(['Первое']);
    const [layout] = await t.layouts.list();
    expect(layout?.links[0]?.tabId).toBe(backup.tabs.find((tab) => tab.title === 'A')?.id);
  });

  it('adds to a TabFlow with data: same names join, the same ids and videos are skipped', async () => {
    const source = setupTestDb();
    await fill(source);
    const extra = await source.groups.create({
      spaceId: (await source.spaces.list())[1]?.id ?? '',
      title: 'Новая',
      color: 'red',
    });
    await source.tabs.addMany(extra.id, [{ url: 'https://example.com/n', title: 'N' }]);
    const backup = await exported(source);

    const t = setupTestDb();
    await importBackup(t.db, () => t.now.value, backup);
    await t.groups.remove(extra.id);
    const own = await t.spaces.create('работа ');
    const mine = await t.groups.create({ spaceId: own.id, title: 'Моя', color: 'red' });
    await t.tabs.addMany(mine.id, [{ url: 'https://example.com/m', title: 'M' }]);
    await removeSpace(t, 'Работа');

    const outcome = await importBackup(t.db, () => t.now.value, backup);

    // «Статьи», «Проект» are there, «Новая» is in the trash: all three are skipped.
    expect(outcome).toMatchObject({ groups: 0, videos: 0, layouts: 0, skipped: 6 });
    expect(outcome.ids.spaces).toEqual([]);
  });

  it('puts groups of a known space after its own groups', async () => {
    const source = setupTestDb();
    await fill(source);
    const backup = await exported(source);
    const t = setupTestDb();
    const work = await t.spaces.create('РАБОТА');
    const mine = await t.groups.create({ spaceId: work.id, title: 'Моя', color: 'red' });
    await t.tabs.addMany(mine.id, [{ url: 'https://example.com/m', title: 'M' }]);

    const outcome = await importBackup(t.db, () => t.now.value, backup);

    expect(outcome.ids.spaces).toEqual([]);
    expect((await t.spaces.list()).map((s) => s.name)).toEqual(['Входящие', 'РАБОТА']);
    expect((await t.groups.listBySpace(work.id)).map((g) => g.title)).toEqual(['Моя', 'Проект']);
  });

  it('gives a link a new id when its id is taken; the layout follows it', async () => {
    const source = setupTestDb();
    const { stowed } = await fill(source);
    const backup = await exported(source);
    const t = setupTestDb();
    const inbox = await t.spaces.ensureDefault();
    const other = await t.groups.create({ spaceId: inbox.id, title: 'Чужая', color: 'red' });
    const taken = backup.tabs.find((tab) => tab.title === 'A');
    await t.db.tabs.add({ ...(taken as NonNullable<typeof taken>), groupId: other.id });

    await importBackup(t.db, () => t.now.value, backup);

    const [first] = await t.tabs.listByGroup(stowed.id);
    expect(first?.title).toBe('A');
    expect(first?.id).not.toBe(taken?.id);
    const [layout] = await t.layouts.list();
    expect(layout?.links[0]?.tabId).toBe(first?.id);
  });

  it('undo removes exactly what was added', async () => {
    const source = setupTestDb();
    await fill(source);
    const backup = await exported(source);
    const t = setupTestDb();
    const inbox = await t.spaces.ensureDefault();
    const mine = await t.groups.create({ spaceId: inbox.id, title: 'Моя', color: 'red' });
    await t.tabs.addMany(mine.id, [{ url: 'https://example.com/m', title: 'M' }]);

    const outcome = await importBackup(t.db, () => t.now.value, backup);
    await removeImported(t.db, outcome.ids);

    expect((await t.spaces.list()).map((s) => s.name)).toEqual(['Входящие']);
    expect((await t.groups.listAll()).map((g) => g.title)).toEqual(['Моя']);
    expect(await t.tabs.listAll()).toHaveLength(1);
    expect(await t.db.queue.count()).toBe(0);
    expect(await t.db.layouts.count()).toBe(0);
  });
});

async function removeSpace(t: TestContext, name: string) {
  const space = (await t.spaces.list()).find((s) => s.name === name);
  if (space) await t.spaces.remove(space.id);
}
