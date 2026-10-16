import { describe, expect, it } from 'vitest';
import { DAY_MS, setupTestDb } from '../test-utils';

describe('TrashRepository', () => {
  it('lists deleted records, newest first', async () => {
    const t = setupTestDb();
    const space = await t.spaces.ensureDefault();
    const group = await t.groups.create({ spaceId: space.id, title: 'Учёба', color: 'blue' });
    const { item: a } = await t.queue.add({ url: 'https://a.test', title: 'A', site: 'a.test' });
    const { item: b } = await t.queue.add({ url: 'https://b.test', title: 'B', site: 'b.test' });

    await t.queue.remove(a.id);
    t.now.value += 1000;
    await t.queue.remove(b.id);
    await t.groups.remove(group.id);

    const trash = await t.trash.list();
    expect(trash.queue.map((item) => item.id)).toEqual([b.id, a.id]);
    expect(trash.groups.map((g) => g.id)).toEqual([group.id]);
    expect(trash.spaces).toEqual([]);
  });

  it('purges only records deleted more than 30 days ago', async () => {
    const t = setupTestDb();
    const space = await t.spaces.ensureDefault();
    const group = await t.groups.create({ spaceId: space.id, title: 'Старое', color: 'grey' });
    await t.tabs.addMany(group.id, [{ url: 'https://old.test', title: 'Old' }]);
    await t.groups.remove(group.id);

    t.now.value += 10 * DAY_MS;
    const { item } = await t.queue.add({ url: 'https://new.test', title: 'New', site: 'new.test' });
    await t.queue.remove(item.id);

    t.now.value += 21 * DAY_MS; // group: 31 days in the trash, video: 21 days
    const result = await t.trash.purgeExpired();

    expect(result).toEqual({ spaces: 0, groups: 1, tabs: 1, queue: 0 });
    expect(await t.db.groups.get(group.id)).toBeUndefined();
    expect((await t.trash.list()).queue.map((x) => x.id)).toEqual([item.id]);
    // Live records are untouched.
    expect(await t.spaces.list()).toHaveLength(1);
  });
});
