import { describe, expect, it } from 'vitest';
import { RecordNotFoundError } from '../index';
import { setupTestDb } from '../test-utils';

describe('GroupRepository', () => {
  it('appends groups to a space in order', async () => {
    const t = setupTestDb();
    const space = await t.spaces.ensureDefault();
    await t.groups.create({ spaceId: space.id, title: 'Учёба', color: 'blue' });
    await t.groups.create({ spaceId: space.id, title: 'Работа', color: 'green', state: 'asleep' });

    const groups = await t.groups.listBySpace(space.id);
    expect(groups.map((g) => [g.title, g.state])).toEqual([
      ['Учёба', 'active'],
      ['Работа', 'asleep'],
    ]);
  });

  it('does not create a group in a missing space', async () => {
    const t = setupTestDb();
    await expect(
      t.groups.create({ spaceId: 'missing', title: 'X', color: 'red' }),
    ).rejects.toBeInstanceOf(RecordNotFoundError);
  });

  it('finds the group mirroring a native Chrome group', async () => {
    const t = setupTestDb();
    const space = await t.spaces.ensureDefault();
    const group = await t.groups.create({
      spaceId: space.id,
      title: 'Учёба',
      color: 'blue',
      chromeGroupId: 42,
      windowId: 1,
    });

    expect((await t.groups.findByChromeGroupId(42))?.id).toBe(group.id);
    expect(await t.groups.findByChromeGroupId(7)).toBeUndefined();
  });

  it('clears links to Chrome when the group is stowed', async () => {
    const t = setupTestDb();
    const space = await t.spaces.ensureDefault();
    const group = await t.groups.create({
      spaceId: space.id,
      title: 'Учёба',
      color: 'blue',
      chromeGroupId: 42,
      windowId: 1,
    });
    await t.tabs.addMany(group.id, [{ url: 'https://a.test', title: 'A', chromeTabId: 100 }]);

    await t.groups.setState(group.id, 'stowed');

    const stowed = await t.groups.get(group.id);
    expect(stowed?.state).toBe('stowed');
    expect(stowed?.chromeGroupId).toBeUndefined();
    expect(stowed?.windowId).toBeUndefined();
    expect((await t.tabs.listByGroup(group.id))[0]?.chromeTabId).toBeUndefined();
    expect(await t.groups.findByChromeGroupId(42)).toBeUndefined();
  });

  it('restores a group stowed, into the default space if its space is in the trash', async () => {
    const t = setupTestDb();
    const inbox = await t.spaces.ensureDefault();
    const work = await t.spaces.create('Работа');
    const group = await t.groups.create({
      spaceId: work.id,
      title: 'Отчёт',
      color: 'red',
      chromeGroupId: 5,
    });
    await t.tabs.addMany(group.id, [{ url: 'https://a.test', title: 'A' }]);

    await t.groups.remove(group.id);
    expect(await t.tabs.listByGroup(group.id)).toEqual([]);
    t.now.value += 1000;
    await t.spaces.remove(work.id);

    await t.groups.restore(group.id);

    const restored = await t.groups.get(group.id);
    expect(restored?.spaceId).toBe(inbox.id);
    expect(restored?.state).toBe('stowed');
    expect(restored?.chromeGroupId).toBeUndefined();
    expect(await t.tabs.listByGroup(group.id)).toHaveLength(1);
  });

  it('moves a group to another space', async () => {
    const t = setupTestDb();
    const inbox = await t.spaces.ensureDefault();
    const work = await t.spaces.create('Работа');
    const group = await t.groups.create({ spaceId: inbox.id, title: 'Отчёт', color: 'red' });

    await t.groups.move(group.id, work.id);

    expect(await t.groups.listBySpace(inbox.id)).toEqual([]);
    expect((await t.groups.listBySpace(work.id)).map((g) => g.id)).toEqual([group.id]);
  });
});
