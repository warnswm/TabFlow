import { beforeEach, describe, expect, it } from 'vitest';
import { isCommand } from '../messages';
import {
  type BackgroundTestContext,
  expectOk,
  setupBackground,
  single,
} from '../testing/background';

const URL = (name: string) => `https://${name}.example/`;

describe('sleepLinks («Рядом»)', () => {
  let t: BackgroundTestContext;

  beforeEach(async () => {
    t = setupBackground();
    await t.bg.start();
  });

  async function openGroup(title: string, names: string[]) {
    const chrome = t.api.addGroup(
      title,
      'blue',
      names.map((name) => ({ url: URL(name), title: name })),
    );
    await t.settle();
    const group = single((await t.groups.listAll()).filter((g) => g.title === title));
    return { group, ...chrome };
  }

  async function link(groupId: string, title: string) {
    return single((await t.tabs.listByGroup(groupId)).filter((tab) => tab.title === title));
  }

  it('unloads the open tabs of the links; they stay on the tab strip', async () => {
    t.api.addTab({ url: 'https://other.example/', active: true });
    const { group, groupId } = await openGroup('Учёба', ['a', 'b', 'c']);
    const ids = [(await link(group.id, 'a')).id, (await link(group.id, 'c')).id];

    const result = expectOk(await t.command({ type: 'sleepLinks', tabIds: ids }));

    expect(result.tabs).toBe(2);
    const strip = await t.api.queryTabs({ groupId });
    expect(strip.map((tab) => [tab.title, tab.discarded])).toEqual([
      ['a', true],
      ['b', false],
      ['c', true],
    ]);
    expect(await t.tabs.listByGroup(group.id)).toHaveLength(3);
    expect((await t.groups.get(group.id))?.state).toBe('active');
  });

  it('puts the group to sleep when all its tabs are unloaded; follows new tab ids', async () => {
    t.api.replaceIdsOnDiscard = true;
    t.api.addTab({ url: 'https://other.example/', active: true });
    const { group, groupId } = await openGroup('Учёба', ['a', 'b']);
    const ids = (await t.tabs.listByGroup(group.id)).map((tab) => tab.id);

    expectOk(await t.command({ type: 'sleepLinks', tabIds: ids }));

    expect((await t.groups.get(group.id))?.state).toBe('asleep');
    const chromeIds = (await t.api.queryTabs({ groupId })).map((tab) => tab.id);
    expect((await t.tabs.listByGroup(group.id)).map((tab) => tab.chromeTabId)).toEqual(chromeIds);
  });

  it('leaves the shown tab and links without a tab as they are', async () => {
    // «a» is the first tab of the window: the shown one.
    const { group } = await openGroup('Учёба', ['a', 'b']);
    const { group: stowed } = await openGroup('Статьи', ['x']);
    expectOk(await t.command({ type: 'stowGroup', groupId: stowed.id }));
    const ids = [(await link(group.id, 'a')).id, (await link(stowed.id, 'x')).id];

    const result = expectOk(await t.command({ type: 'sleepLinks', tabIds: ids }));

    expect(result.tabs).toBe(0);
    expect(single(t.api.allTabs().filter((tab) => tab.title === 'a'))).toMatchObject({
      active: true,
      discarded: false,
    });
  });

  it('unloads open tabs outside TabFlow too; nothing is saved for them', async () => {
    const shown = t.api.addTab({ url: 'https://shown.example/', active: true });
    const page = t.api.addTab({ url: 'https://page.example/', title: 'page' });
    await t.settle();

    const result = expectOk(
      await t.command({ type: 'sleepLinks', tabIds: [], chromeTabIds: [page.id, shown.id] }),
    );

    expect(result.tabs).toBe(1);
    expect(single(t.api.allTabs().filter((tab) => tab.title === 'page')).discarded).toBe(true);
    expect(await t.groups.listAll()).toEqual([]);
  });

  it('takes up to nine links and nine open tabs', () => {
    const ten = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    expect(isCommand({ type: 'sleepLinks', tabIds: ten })).toBe(false);
    expect(isCommand({ type: 'sleepLinks', tabIds: ten.slice(0, 9) })).toBe(true);
    expect(isCommand({ type: 'sleepLinks', tabIds: ['a'] })).toBe(true);
    expect(isCommand({ type: 'sleepLinks', tabIds: [], chromeTabIds: [1, 2] })).toBe(true);
    expect(isCommand({ type: 'sleepLinks', tabIds: [], chromeTabIds: [-1] })).toBe(false);
  });
});
