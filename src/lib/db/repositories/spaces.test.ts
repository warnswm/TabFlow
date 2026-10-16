import { describe, expect, it } from 'vitest';
import { DEFAULT_SPACE_NAME, RecordNotFoundError, type SavedTab } from '../index';
import { setupTestDb } from '../test-utils';

describe('SpaceRepository', () => {
  it('creates the default space once and keeps it first', async () => {
    const t = setupTestDb();
    const work = await t.spaces.create('  Работа ');
    const inbox = await t.spaces.ensureDefault();
    const again = await t.spaces.ensureDefault();

    expect(again.id).toBe(inbox.id);
    expect(inbox.name).toBe(DEFAULT_SPACE_NAME);
    expect(work.name).toBe('Работа');
    expect((await t.spaces.list()).map((s) => s.name)).toEqual([DEFAULT_SPACE_NAME, 'Работа']);
  });

  it('does not delete the default space', async () => {
    const t = setupTestDb();
    const inbox = await t.spaces.ensureDefault();
    await expect(t.spaces.remove(inbox.id)).rejects.toThrow('default space');
  });

  it('moves a space with its groups and tabs to the trash and back', async () => {
    const t = setupTestDb();
    const space = await t.spaces.create('Учёба');
    const group = await t.groups.create({ spaceId: space.id, title: 'TS', color: 'blue' });
    const [keep, removedEarlier] = (await t.tabs.addMany(group.id, [
      { url: 'https://a.test', title: 'A' },
      { url: 'https://b.test', title: 'B' },
    ])) as [SavedTab, SavedTab];
    t.now.value += 1000;
    await t.tabs.remove(removedEarlier.id);
    t.now.value += 1000;

    await t.spaces.remove(space.id);
    expect(await t.spaces.list()).toEqual([]);
    expect(await t.groups.listBySpace(space.id)).toEqual([]);
    expect(await t.tabs.listByGroup(group.id)).toEqual([]);

    await t.spaces.restore(space.id);
    expect((await t.spaces.list()).map((s) => s.id)).toEqual([space.id]);
    expect((await t.groups.listBySpace(space.id)).map((g) => g.id)).toEqual([group.id]);
    // The tab deleted on its own before stays in the trash.
    expect((await t.tabs.listByGroup(group.id)).map((tab) => tab.id)).toEqual([keep.id]);
  });

  it('rejects operations on missing spaces', async () => {
    const t = setupTestDb();
    await expect(t.spaces.rename('missing', 'X')).rejects.toBeInstanceOf(RecordNotFoundError);
    await expect(t.spaces.restore('missing')).rejects.toBeInstanceOf(RecordNotFoundError);
  });
});
