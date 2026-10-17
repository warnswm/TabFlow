import { describe, expect, it } from 'vitest';
import { setupTestDb } from '../test-utils';

describe('placing records by drag & drop', () => {
  it('puts a group at a position in its own space and in another one', async () => {
    const t = setupTestDb();
    const inbox = await t.spaces.ensureDefault();
    const work = await t.spaces.create('Работа');
    const a = await t.groups.create({ spaceId: inbox.id, title: 'A', color: 'blue' });
    await t.groups.create({ spaceId: inbox.id, title: 'B', color: 'blue' });
    const c = await t.groups.create({ spaceId: inbox.id, title: 'C', color: 'blue' });
    await t.groups.create({ spaceId: work.id, title: 'W', color: 'red' });

    await t.groups.place(c.id, inbox.id, 0);
    expect((await t.groups.listBySpace(inbox.id)).map((g) => g.title)).toEqual(['C', 'A', 'B']);

    await t.groups.place(a.id, work.id, 0);
    expect((await t.groups.listBySpace(work.id)).map((g) => g.title)).toEqual(['A', 'W']);
    expect((await t.groups.listBySpace(inbox.id)).map((g) => g.title)).toEqual(['C', 'B']);
  });

  it('rewrites the keys of the whole list when there is no room between neighbours', async () => {
    const t = setupTestDb();
    const inbox = await t.spaces.ensureDefault();
    const a = await t.groups.create({ spaceId: inbox.id, title: 'A', color: 'blue' });
    const b = await t.groups.create({ spaceId: inbox.id, title: 'B', color: 'blue' });
    const c = await t.groups.create({ spaceId: inbox.id, title: 'C', color: 'blue' });
    await t.db.groups.update(a.id, { order: 1 });
    await t.db.groups.update(b.id, { order: 1 + 1e-9 });

    await t.groups.place(c.id, inbox.id, 1);
    const groups = await t.groups.listBySpace(inbox.id);
    expect(groups.map((g) => g.title)).toEqual(['A', 'C', 'B']);
    expect(groups.map((g) => g.order)).toEqual([1024, 2048, 3072]);
  });

  it('reorders spaces; «Входящие» stays first and cannot be moved', async () => {
    const t = setupTestDb();
    const inbox = await t.spaces.ensureDefault();
    await t.spaces.create('Работа');
    await t.spaces.create('Учёба');
    const personal = await t.spaces.create('Личное');

    await t.spaces.place(personal.id, 0);
    // The overview shows «Входящие» first whatever its key; the others follow their keys.
    const others = (await t.spaces.list()).filter((s) => !s.isDefault);
    expect(others.map((s) => s.name)).toEqual(['Личное', 'Работа', 'Учёба']);
    await expect(t.spaces.place(inbox.id, 2)).rejects.toThrow();
  });

  it('puts a tab at a position in its group and moves it to another group', async () => {
    const t = setupTestDb();
    const inbox = await t.spaces.ensureDefault();
    const g1 = await t.groups.create({ spaceId: inbox.id, title: '1', color: 'blue' });
    const g2 = await t.groups.create({ spaceId: inbox.id, title: '2', color: 'blue' });
    const [a, , c] = await t.tabs.addMany(g1.id, [
      { url: 'https://a.example/', title: 'a' },
      { url: 'https://b.example/', title: 'b' },
      { url: 'https://c.example/', title: 'c', chromeTabId: 7 },
    ]);
    await t.tabs.addMany(g2.id, [{ url: 'https://x.example/', title: 'x' }]);
    if (!a || !c) throw new Error('tabs not created');

    await t.tabs.place(c.id, g1.id, 0);
    expect((await t.tabs.listByGroup(g1.id)).map((tab) => tab.title)).toEqual(['c', 'a', 'b']);

    await t.tabs.place(a.id, g2.id, 1);
    expect((await t.tabs.listByGroup(g2.id)).map((tab) => tab.title)).toEqual(['x', 'a']);
    expect((await t.tabs.listByGroup(g1.id)).map((tab) => tab.title)).toEqual(['c', 'b']);
    // The Chrome id stays: the caller decides what happens to the open tab.
    expect((await t.tabs.get(c.id))?.chromeTabId).toBe(7);
  });
});
