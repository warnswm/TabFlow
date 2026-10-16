import { describe, expect, it } from 'vitest';
import type { SavedTab } from '../index';
import { setupTestDb } from '../test-utils';

async function setupGroup() {
  const t = setupTestDb();
  const space = await t.spaces.ensureDefault();
  const group = await t.groups.create({
    spaceId: space.id,
    title: 'Учёба',
    color: 'blue',
    chromeGroupId: 7,
    windowId: 1,
  });
  const tabs = (await t.tabs.addMany(group.id, [
    { url: 'https://a.test', title: 'A', chromeTabId: 11 },
    { url: 'https://b.test', title: 'B', chromeTabId: 12 },
  ])) as [SavedTab, SavedTab];
  return { t, group, tabs };
}

describe('links between the mirror and Chrome', () => {
  it('links a restored group to its new native group and tabs', async () => {
    const { t, group, tabs } = await setupGroup();
    await t.groups.setState(group.id, 'stowed');

    await t.groups.linkToChrome(group.id, {
      chromeGroupId: 70,
      windowId: 2,
      tabs: tabs.map((tab, i) => ({ id: tab.id, chromeTabId: 110 + i })),
    });

    expect(await t.groups.get(group.id)).toMatchObject({
      state: 'active',
      chromeGroupId: 70,
      windowId: 2,
    });
    const saved = await t.tabs.listByGroup(group.id);
    expect(saved.map((tab) => tab.chromeTabId)).toEqual([110, 111]);
  });

  it('unlinks Chrome ids but keeps the state', async () => {
    const { t, group } = await setupGroup();

    await t.groups.unlinkFromChrome(group.id);

    const unlinked = await t.groups.get(group.id);
    expect(unlinked?.state).toBe('active');
    expect(unlinked?.chromeGroupId).toBeUndefined();
    const saved = await t.tabs.listByGroup(group.id);
    expect(saved.every((tab) => tab.chromeTabId === undefined)).toBe(true);
  });

  it('forgets a group and its tabs without the trash', async () => {
    const { t, group } = await setupGroup();

    await t.groups.forget(group.id);

    expect(await t.groups.listAll()).toEqual([]);
    expect(await t.db.tabs.count()).toBe(0);
    expect((await t.trash.list()).groups).toEqual([]);
  });

  it('forgets a single tab and reorders the rest', async () => {
    const { t, group, tabs } = await setupGroup();
    const [a, b] = tabs;
    const [c] = await t.tabs.addMany(group.id, [{ url: 'https://c.test', title: 'C' }]);

    await t.tabs.forget(a.id);
    await t.tabs.reorder([c?.id ?? '', b.id]);

    expect((await t.tabs.listByGroup(group.id)).map((tab) => tab.title)).toEqual(['C', 'B']);
    expect((await t.trash.list()).tabs).toEqual([]);
  });

  it('restores only the tabs deleted since the given time', async () => {
    const { t, group, tabs } = await setupGroup();
    const [a, b] = tabs;
    await t.tabs.remove(a.id);
    t.now.value += 60_000;
    await t.tabs.remove(b.id);

    const restored = await t.tabs.restoreDeletedSince(group.id, t.now.value - 1_000);

    expect(restored).toBe(1);
    const live = await t.tabs.listByGroup(group.id);
    expect(live.map((tab) => [tab.title, tab.chromeTabId])).toEqual([['B', undefined]]);
  });
});
