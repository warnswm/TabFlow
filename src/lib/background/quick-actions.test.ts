import { beforeEach, describe, expect, it } from 'vitest';
import type { Command } from '../messages';
import {
  type BackgroundTestContext,
  expectOk,
  setupBackground,
  single,
} from '../testing/background';
import { FAKE_APP_PAGE_URL } from '../testing/fake-tabs-api';
import { collapsedGroupTitle } from './collapse';
import { dayGroupTitle } from './quick-actions';

const URL = (name: string) => `https://${name}.example/`;

describe('quick actions (popup, context menu, shortcuts)', () => {
  let t: BackgroundTestContext;

  beforeEach(async () => {
    t = setupBackground();
    await t.bg.start();
  });

  async function run(command: Command) {
    return expectOk(await t.command(command));
  }

  async function openGroup(title: string, names: string[], windowId?: number) {
    const chrome = t.api.addGroup(
      title,
      'blue',
      names.map((name) => ({ url: URL(name), title: name })),
      windowId,
    );
    await t.settle();
    const group = single((await t.groups.listAll()).filter((g) => g.title === title));
    return { group, ...chrome };
  }

  async function groupByTitle(title: string) {
    return single((await t.groups.listAll()).filter((g) => g.title === title));
  }

  async function linkTitles(groupId: string) {
    return (await t.tabs.listByGroup(groupId)).map((tab) => tab.title);
  }

  const dayTitle = () => dayGroupTitle(t.now.value);

  describe('stowCurrent', () => {
    it('stows the whole group of the active tab', async () => {
      const { group, tabs } = await openGroup('Работа', ['a', 'b']);
      t.api.addTab({ url: URL('loose') });
      await t.api.activateTab(tabs[1]?.id ?? -1);
      await t.settle();

      const result = await run({ type: 'stowCurrent' });

      expect(result).toMatchObject({ groups: 1, tabs: 2, groupTitle: 'Работа' });
      expect(result.closedGroupIds).toEqual([group.id]);
      expect((await t.groups.get(group.id))?.state).toBe('stowed');
      expect(t.api.allTabs().map((tab) => tab.url)).toEqual([URL('loose')]);
    });

    it('stows a tab outside groups into the day group in «Входящие»', async () => {
      t.api.addTab({ url: URL('keep') });
      const tab = t.api.addTab({ url: URL('read'), title: 'Статья', active: true });
      await t.settle();

      const result = await run({ type: 'stowCurrent', chromeTabId: tab.id });

      expect(result).toMatchObject({ groups: 0, tabs: 1, groupTitle: dayTitle() });
      const day = await groupByTitle(dayTitle());
      expect(day.state).toBe('stowed');
      expect(day.spaceId).toBe((await t.spaces.ensureDefault()).id);
      expect(await linkTitles(day.id)).toEqual(['Статья']);
      expect(t.api.allTabs().map((tab) => tab.url)).toEqual([URL('keep')]);
    });

    it('collects the tabs of one day in one group, without duplicates', async () => {
      const first = t.api.addTab({ url: URL('a'), title: 'a' });
      const second = t.api.addTab({ url: URL('b'), title: 'b' });
      const copy = t.api.addTab({ url: `${URL('a')}#part`, title: 'a again' });
      await t.settle();

      for (const tab of [first, second, copy]) {
        await run({ type: 'stowCurrent', chromeTabId: tab.id });
      }

      const day = await groupByTitle(dayTitle());
      expect(await linkTitles(day.id)).toEqual(['a', 'b']);
      // The duplicate is closed too; the window keeps the main page.
      expect(t.api.allTabs().map((tab) => tab.url)).toEqual([FAKE_APP_PAGE_URL]);
    });

    it('starts a new day group on the next day', async () => {
      const today = t.api.addTab({ url: URL('a') });
      const tomorrow = t.api.addTab({ url: URL('b') });
      await t.settle();
      await run({ type: 'stowCurrent', chromeTabId: today.id });
      t.now.value += 24 * 60 * 60 * 1000;
      await run({ type: 'stowCurrent', chromeTabId: tomorrow.id });

      const days = (await t.groups.listAll()).map((group) => group.title);
      expect(days).toHaveLength(2);
      expect(new Set(days).size).toBe(2);
    });

    it('leaves pinned tabs and browser pages open', async () => {
      const pinned = t.api.addTab({ url: URL('mail'), pinned: true });
      const settings = t.api.addTab({ url: 'chrome://settings' });
      await t.settle();

      for (const tab of [pinned, settings]) {
        const response = await t.command({ type: 'stowCurrent', chromeTabId: tab.id });
        expect(response).toMatchObject({ ok: false, code: 'tab-not-saveable' });
      }
      expect(t.api.allTabs()).toHaveLength(2);
      expect(await t.groups.listAll()).toEqual([]);
    });

    it('reports a closed tab', async () => {
      const response = await t.command({ type: 'stowCurrent', chromeTabId: 999 });
      expect(response).toMatchObject({ ok: false, code: 'tab-not-found' });
    });
  });

  describe('sleepCurrent', () => {
    it('puts the group of the tab to sleep', async () => {
      t.api.addTab({ url: URL('elsewhere') });
      const { group, tabs } = await openGroup('Учёба', ['a', 'b']);

      const result = await run({ type: 'sleepCurrent', chromeTabId: tabs[0]?.id });

      expect(result).toMatchObject({ groups: 1, tabs: 2, groupTitle: 'Учёба' });
      expect((await t.groups.get(group.id))?.state).toBe('asleep');
    });

    it('refuses a tab outside groups', async () => {
      const tab = t.api.addTab({ url: URL('a') });
      await t.settle();
      const response = await t.command({ type: 'sleepCurrent', chromeTabId: tab.id });
      expect(response).toMatchObject({ ok: false, code: 'tab-not-in-group' });
    });
  });

  describe('sleepInactive', () => {
    it('puts to sleep every active group except the ones shown in the windows', async () => {
      const shown = await openGroup('Сейчас', ['a']);
      const other = await openGroup('Потом', ['b', 'c']);
      const second = t.api.openWindow();
      const shownThere = await openGroup('Во втором окне', ['d'], second);
      const third = await openGroup('Тоже потом', ['e', 'f'], second);
      await t.api.activateTab(shown.tabs[0]?.id ?? -1);
      await t.api.activateTab(shownThere.tabs[0]?.id ?? -1);
      await t.settle();

      const result = await run({ type: 'sleepInactive' });

      expect(result).toMatchObject({ groups: 2, tabs: 4, failed: 0 });
      const state = async (id: string) => (await t.groups.get(id))?.state;
      expect(await state(other.group.id)).toBe('asleep');
      expect(await state(third.group.id)).toBe('asleep');
      expect(await state(shown.group.id)).toBe('active');
      expect(await state(shownThere.group.id)).toBe('active');
    });

    it('has nothing to do without other active groups', async () => {
      await openGroup('Сейчас', ['a']);
      expect(await run({ type: 'sleepInactive' })).toMatchObject({ groups: 0, tabs: 0 });
    });
  });

  describe('stowSelected', () => {
    it('stows the selected tabs as one new group in «Входящие»', async () => {
      const keep = t.api.addTab({ url: URL('keep') });
      t.api.addTab({ url: URL('a'), title: 'a', active: true });
      const b = t.api.addTab({ url: URL('b'), title: 'b' });
      const copy = t.api.addTab({ url: `${URL('a')}#x`, title: 'a again' });
      const pinned = t.api.addTab({ url: URL('mail'), pinned: true });
      t.api.userSelectTabs([b.id, copy.id, pinned.id]);
      await t.settle();

      const result = await run({ type: 'stowSelected' });

      expect(result).toMatchObject({
        groups: 1,
        tabs: 2,
        groupTitle: collapsedGroupTitle(t.now.value),
      });
      const group = single(await t.groups.listAll());
      expect(group.state).toBe('stowed');
      expect(result.closedGroupIds).toEqual([group.id]);
      expect(await linkTitles(group.id)).toEqual(['a', 'b']);
      expect(t.api.allTabs().map((tab) => tab.id)).toEqual([keep.id, pinned.id]);
    });

    it('moves selected links out of their groups; an emptied group goes to the trash', async () => {
      const half = await openGroup('Половина', ['a', 'b']);
      const whole = await openGroup('Целиком', ['c']);
      await t.api.activateTab(half.tabs[1]?.id ?? -1);
      t.api.userSelectTabs([whole.tabs[0]?.id ?? -1]);
      await t.settle();

      const result = await run({ type: 'stowSelected' });

      const created = await groupByTitle(result.groupTitle ?? '');
      expect(await linkTitles(created.id)).toEqual(['b', 'c']);
      expect(await linkTitles(half.group.id)).toEqual(['a']);
      expect((await t.groups.get(half.group.id))?.state).toBe('active');
      expect(await t.groups.get(whole.group.id)).toBeUndefined(); // in the trash
      expect(t.api.allTabs().map((tab) => tab.title)).toEqual(['a']);
    });

    it('leaves pinned tabs and browser pages alone', async () => {
      t.api.addTab({ url: 'chrome://settings', active: true });
      await t.settle();
      const response = await t.command({ type: 'stowSelected' });
      expect(response).toMatchObject({ ok: false, code: 'tab-not-saveable' });
      expect(await t.groups.listAll()).toEqual([]);
    });
  });

  describe('saveToGroup', () => {
    it('saves a page into a stowed group and closes its tab', async () => {
      const { group } = await openGroup('Статьи', ['a']);
      await run({ type: 'stowGroup', groupId: group.id });
      t.api.addTab({ url: URL('keep') });
      const page = t.api.addTab({ url: URL('new'), title: 'new' });
      await t.settle();

      const result = await run({ type: 'saveToGroup', chromeTabId: page.id, groupId: group.id });

      expect(result).toMatchObject({ tabs: 1, groupTitle: 'Статьи' });
      expect(await linkTitles(group.id)).toEqual(['a', 'new']);
      // The main page opened when the group was stowed.
      expect(t.api.allTabs().map((tab) => tab.url)).toEqual([FAKE_APP_PAGE_URL, URL('keep')]);
    });

    it('moves a page into a group on the tab strip', async () => {
      const { group, groupId } = await openGroup('Работа', ['a']);
      const page = t.api.addTab({ url: URL('new'), title: 'new' });
      await t.settle();

      await run({ type: 'saveToGroup', chromeTabId: page.id, groupId: group.id });

      expect(await linkTitles(group.id)).toEqual(['a', 'new']);
      const chromeTitles = (await t.api.queryTabs({ groupId })).map((tab) => tab.title);
      expect(chromeTitles).toEqual(['a', 'new']);
      expect((await t.tabs.listByGroup(group.id))[1]?.chromeTabId).toBe(page.id);
    });

    it('moves a link of another group like «Перенести в группу»', async () => {
      const from = await openGroup('Откуда', ['a', 'b']);
      const to = await openGroup('Куда', ['c']);
      await run({ type: 'stowGroup', groupId: to.group.id });

      await run({ type: 'saveToGroup', chromeTabId: from.tabs[1]?.id ?? -1, groupId: to.group.id });

      expect(await linkTitles(from.group.id)).toEqual(['a']);
      expect(await linkTitles(to.group.id)).toEqual(['c', 'b']);
    });
  });

  describe('saveLink', () => {
    it('saves a link into the day group without opening it', async () => {
      t.api.addTab({ url: URL('page') });
      await t.settle();

      const result = await run({ type: 'saveLink', url: URL('later') });

      expect(result).toMatchObject({ tabs: 1, groupTitle: dayTitle() });
      const day = await groupByTitle(dayTitle());
      expect((await t.tabs.listByGroup(day.id)).map((tab) => tab.url)).toEqual([URL('later')]);
      expect(t.api.allTabs()).toHaveLength(1);
    });

    it('does not save a link twice', async () => {
      await run({ type: 'saveLink', url: URL('later') });
      const again = await run({ type: 'saveLink', url: `${URL('later')}#top` });
      expect(again.tabs).toBe(0);
      const day = await groupByTitle(dayTitle());
      expect(await t.tabs.listByGroup(day.id)).toHaveLength(1);
    });

    it('opens the link as a tab of a group on the tab strip', async () => {
      const { group, groupId } = await openGroup('Работа', ['a']);

      await run({ type: 'saveLink', url: URL('later'), groupId: group.id });

      const urls = (await t.api.queryTabs({ groupId })).map((tab) => tab.url);
      expect(urls).toEqual([URL('a'), URL('later')]);
      expect(await t.tabs.listByGroup(group.id)).toHaveLength(2);
    });

    it('refuses addresses that are not web pages or files', async () => {
      const response = await t.command({ type: 'saveLink', url: 'javascript:alert(1)' });
      expect(response).toMatchObject({ ok: false, code: 'tab-not-saveable' });
    });
  });

  it('openApp shows the main page that is already open', async () => {
    t.api.addTab({ url: URL('a') });
    await run({ type: 'openApp' });
    await run({ type: 'openApp' });
    expect(t.api.allTabs().filter((tab) => tab.url === FAKE_APP_PAGE_URL)).toHaveLength(1);
  });
});

describe('badge and context menu', () => {
  let t: BackgroundTestContext;

  beforeEach(async () => {
    t = setupBackground();
    await t.bg.start();
    await t.settle();
  });

  it('show the stowed groups and the recent groups', async () => {
    t.settings.mode = 'stowed';
    await t.bg.refreshUi();
    expect(t.ui.badge).toEqual({ text: '', title: 'TabFlow\nОчередь пуста' });

    t.api.addGroup('Работа', 'blue', [{ url: URL('a') }]);
    t.api.addTab({ url: URL('b') });
    await t.settle();
    expect(t.ui.groupItems()).toEqual(['Работа · Входящие']);

    expectOk(await t.command({ type: 'collapseAll' }));

    expect(t.ui.badge).toEqual({
      text: '2',
      title: 'TabFlow\nОчередь пуста\nУбрано в TabFlow: 2 группы',
    });
    expect(t.ui.groupItems()).toHaveLength(2);
  });

  it('rebuild the menu only when it changes', async () => {
    t.api.addGroup('Работа', 'blue', [{ url: URL('a') }]);
    await t.settle();
    const builds = t.ui.menuBuilds;

    t.api.addTab({ url: URL('b') }); // nothing TabFlow keeps changes
    await t.settle();

    expect(t.ui.menuBuilds).toBe(builds);
  });
});
