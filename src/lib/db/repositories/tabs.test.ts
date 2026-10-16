import { describe, expect, it } from 'vitest';
import type { SavedTab } from '../index';
import { setupTestDb } from '../test-utils';

async function setupGroup() {
  const t = setupTestDb();
  const space = await t.spaces.ensureDefault();
  const group = await t.groups.create({ spaceId: space.id, title: 'Учёба', color: 'blue' });
  return { t, group };
}

describe('TabRepository', () => {
  it('adds tabs in the given order, after existing ones', async () => {
    const { t, group } = await setupGroup();
    await t.tabs.addMany(group.id, [{ url: 'https://a.test', title: 'A' }]);
    await t.tabs.addMany(group.id, [
      { url: 'https://b.test', title: 'B', pinned: true },
      { url: 'https://c.test', title: 'C' },
    ]);

    const tabs = await t.tabs.listByGroup(group.id);
    expect(tabs.map((tab) => tab.title)).toEqual(['A', 'B', 'C']);
    expect(tabs.map((tab) => tab.pinned)).toEqual([false, true, false]);
  });

  it('finds live tabs by URL and by Chrome tab id', async () => {
    const { t, group } = await setupGroup();
    const [a, b] = (await t.tabs.addMany(group.id, [
      { url: 'https://same.test', title: 'A', chromeTabId: 1 },
      { url: 'https://same.test', title: 'B' },
    ])) as [SavedTab, SavedTab];
    await t.tabs.remove(b.id);

    expect((await t.tabs.findByUrl('https://same.test')).map((tab) => tab.id)).toEqual([a.id]);
    expect((await t.tabs.findByChromeTabId(1))?.id).toBe(a.id);
  });

  it('moves a tab to another group', async () => {
    const { t, group } = await setupGroup();
    const other = await t.groups.create({ spaceId: group.spaceId, title: 'Дом', color: 'green' });
    const [tab] = (await t.tabs.addMany(group.id, [{ url: 'https://a.test', title: 'A' }])) as [
      SavedTab,
    ];

    await t.tabs.move(tab.id, other.id);

    expect(await t.tabs.listByGroup(group.id)).toEqual([]);
    expect((await t.tabs.listByGroup(other.id)).map((x) => x.id)).toEqual([tab.id]);
  });

  it('restoring a tab of a deleted group brings the group back', async () => {
    const { t, group } = await setupGroup();
    const [first, second] = (await t.tabs.addMany(group.id, [
      { url: 'https://a.test', title: 'A' },
      { url: 'https://b.test', title: 'B' },
    ])) as [SavedTab, SavedTab];
    await t.tabs.remove(first.id);
    t.now.value += 1000;
    await t.groups.remove(group.id);

    await t.tabs.restore(first.id);

    expect((await t.groups.get(group.id))?.state).toBe('stowed');
    // `second` was deleted together with the group, so it comes back with it.
    expect((await t.tabs.listByGroup(group.id)).map((tab) => tab.id)).toEqual([
      second.id,
      first.id,
    ]);
  });
});
