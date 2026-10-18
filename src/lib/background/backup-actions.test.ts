import { beforeEach, describe, expect, it } from 'vitest';
import { undoCommands } from '../app/undo';
import { createBackup } from '../backup/export';
import type { Backup } from '../backup/format';
import { setupTestDb } from '../db/test-utils';
import type { Command } from '../messages';
import {
  type BackgroundTestContext,
  expectOk,
  setupBackground,
  single,
} from '../testing/background';

/** A backup of another TabFlow: a space «Учёба» with a group of two links and a video. */
async function otherBackup(): Promise<Backup> {
  const source = setupTestDb();
  const space = await source.spaces.create('Учёба');
  const group = await source.groups.create({ spaceId: space.id, title: 'Курс', color: 'purple' });
  await source.tabs.addMany(group.id, [
    { url: 'https://example.com/lesson-1', title: 'Урок 1' },
    { url: 'https://example.com/lesson-2', title: 'Урок 2' },
  ]);
  await source.queue.add({
    url: 'https://www.youtube.com/watch?v=lecture',
    title: 'Лекция',
    site: 'youtube.com',
  });
  return createBackup(source, {}, source.now.value);
}

describe('importBackup command', () => {
  let t: BackgroundTestContext;

  beforeEach(async () => {
    t = setupBackground();
    await t.bg.start();
  });

  /** What TabFlow holds before the import: an open group and a queued video. */
  async function ownData() {
    t.api.addTab({ url: 'https://example.com/' });
    const chrome = t.api.addGroup('Покупки', 'pink', [
      { url: 'https://shop.example/1' },
      { url: 'https://shop.example/2' },
    ]);
    await t.settle();
    const group = single(await t.groups.listAll());
    const video = (
      await t.queue.add({ url: 'https://vk.com/video1', title: 'Своё', site: 'vk.com' })
    ).item;
    return { group, video, chromeGroupId: chrome.groupId };
  }

  async function undo(command: Command, response: Awaited<ReturnType<typeof t.command>>) {
    const commands = undoCommands(command, expectOk(response), 'background') ?? [];
    for (const next of commands) expectOk(await t.command(next));
    return commands;
  }

  it('adds the file and keeps what is there', async () => {
    const { group } = await ownData();
    const command: Command = { type: 'importBackup', backup: await otherBackup(), replace: false };

    const result = expectOk(await t.command(command));

    expect(result.imported).toMatchObject({ groups: 1, tabs: 2, videos: 1, replaced: false });
    expect((await t.groups.get(group.id))?.state).toBe('active');
    expect((await t.spaces.list()).map((s) => s.name)).toEqual(['Входящие', 'Учёба']);
    expect((await t.queue.list()).map((v) => v.title)).toEqual(['Своё', 'Лекция']);
    expect(t.api.allTabs()).toHaveLength(3);
  });

  it('undo of «Добавить» removes the added records', async () => {
    await ownData();
    const command: Command = { type: 'importBackup', backup: await otherBackup(), replace: false };
    const response = await t.command(command);

    await undo(command, response);

    expect((await t.spaces.list()).map((s) => s.name)).toEqual(['Входящие']);
    expect((await t.groups.listAll()).map((g) => g.title)).toEqual(['Покупки']);
    expect((await t.queue.list()).map((v) => v.title)).toEqual(['Своё']);
  });

  it('«Заменить» moves everything to the trash first, closing open groups', async () => {
    const { group, video, chromeGroupId } = await ownData();
    const command: Command = { type: 'importBackup', backup: await otherBackup(), replace: true };

    const result = expectOk(await t.command(command));

    expect(result.imported?.replaced).toBe(true);
    expect(result.closedGroupIds).toEqual([group.id]);
    expect(await t.api.getGroup(chromeGroupId)).toBeUndefined();
    expect(t.api.allTabs().map((tab) => tab.url)).toEqual(['https://example.com/']);
    expect((await t.groups.listAll()).map((g) => g.title)).toEqual(['Курс']);
    expect((await t.queue.list()).map((v) => v.title)).toEqual(['Лекция']);
    const trash = await t.trash.list();
    expect(trash.groups.map((g) => g.id)).toEqual([group.id]);
    expect(trash.queue.map((v) => v.id)).toEqual([video.id]);
  });

  it('undo of «Заменить» brings the old data back and reopens closed groups', async () => {
    const { group, video } = await ownData();
    const command: Command = { type: 'importBackup', backup: await otherBackup(), replace: true };
    const response = await t.command(command);

    await undo(command, response);

    expect((await t.groups.listAll()).map((g) => g.title)).toEqual(['Покупки']);
    const back = await t.groups.get(group.id);
    expect(back?.state).not.toBe('stowed');
    expect(back?.chromeGroupId).toBeDefined();
    expect((await t.queue.list()).map((v) => v.id)).toEqual([video.id]);
    expect((await t.spaces.list()).map((s) => s.name)).toEqual(['Входящие']);
  });

  it('«Заменить» with its own backup brings everything back stowed, under new ids', async () => {
    const { group, video } = await ownData();
    const backup = await createBackup(t, {}, t.now.value);
    const command: Command = { type: 'importBackup', backup, replace: true };

    const result = expectOk(await t.command(command));

    expect(result.imported).toMatchObject({ groups: 1, tabs: 2, videos: 1, skipped: 0 });
    const copy = single(await t.groups.listAll());
    expect(copy).toMatchObject({ title: 'Покупки', state: 'stowed' });
    expect(copy.id).not.toBe(group.id);
    expect(single(await t.queue.list()).id).not.toBe(video.id);

    await undo(command, await Promise.resolve({ ok: true as const, result }));

    expect(single(await t.groups.listAll()).id).toBe(group.id);
    expect(single(await t.queue.list()).id).toBe(video.id);
  });

  it('refuses a file that is not a backup and changes nothing', async () => {
    await ownData();
    const response = await t.command({
      type: 'importBackup',
      backup: { format: 'onetab' } as unknown as Backup,
      replace: true,
    });

    expect(response).toMatchObject({ ok: false, code: 'invalid-backup', message: 'not-backup' });
    expect((await t.groups.listAll()).map((g) => g.state)).toEqual(['active']);
  });
});
