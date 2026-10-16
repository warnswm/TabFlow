import { beforeEach, describe, expect, it } from 'vitest';
import { DAY_MS } from '../db/test-utils';
import { type BackgroundTestContext, setupBackground, single } from '../testing/background';

const YT = (n: number) => `https://www.youtube.com/watch?v=${n}`;

describe('mirror of native groups', () => {
  let t: BackgroundTestContext;

  beforeEach(async () => {
    t = setupBackground();
    await t.bg.start();
  });

  async function mirrorOf(title: string) {
    const groups = await t.groups.listAll();
    return single(groups.filter((group) => group.title === title));
  }

  async function savedUrls(groupId: string) {
    return (await t.tabs.listByGroup(groupId)).map((tab) => tab.url);
  }

  it('mirrors a new native group into «Входящие» with its tabs in strip order', async () => {
    const { groupId, tabs } = t.api.addGroup('Учёба', 'blue', [{ url: YT(1) }, { url: YT(2) }]);
    await t.settle();

    const mirror = await mirrorOf('Учёба');
    const inbox = await t.spaces.ensureDefault();
    expect(mirror).toMatchObject({
      spaceId: inbox.id,
      color: 'blue',
      state: 'active',
      chromeGroupId: groupId,
    });
    const saved = await t.tabs.listByGroup(mirror.id);
    expect(saved.map((tab) => [tab.url, tab.chromeTabId])).toEqual(
      tabs.map((tab) => [tab.url, tab.id]),
    );
  });

  it('mirrors groups that already existed when the worker started', async () => {
    const fresh = setupBackground();
    fresh.api.addGroup('Работа', 'red', [{ url: 'https://github.com/' }]);

    await fresh.bg.start();

    expect((await fresh.groups.listAll()).map((group) => group.title)).toEqual(['Работа']);
  });

  it('never drops a saved link because its tab shows a browser page', async () => {
    const { tabs } = t.api.addGroup('Учёба', 'blue', [
      { url: YT(1), title: 'Урок 1' },
      { url: YT(2), title: 'Урок 2' },
    ]);
    await t.settle();

    t.api.userUpdateTab(tabs[1]?.id ?? -1, { url: 'about:blank', title: 'about:blank' });
    await t.settle();

    const saved = await t.tabs.listByGroup((await mirrorOf('Учёба')).id);
    expect(saved.map((tab) => [tab.url, tab.title])).toEqual([
      [YT(1), 'Урок 1'],
      [YT(2), 'Урок 2'],
    ]);
    expect((await t.trash.list()).tabs).toEqual([]);
  });

  it('does not mirror browser pages inside a group', async () => {
    t.api.addGroup('Смесь', 'green', [{ url: 'chrome://settings' }, { url: YT(1) }]);
    await t.settle();

    expect(await savedUrls((await mirrorOf('Смесь')).id)).toEqual([YT(1)]);
  });

  it('follows renames, color changes, navigation and new tabs', async () => {
    const { groupId, tabs } = t.api.addGroup('', 'grey', [{ url: YT(1) }]);
    const [first] = tabs;
    await t.api.updateGroup(groupId, { title: 'Курс TS', color: 'purple' });
    t.api.userUpdateTab(first?.id ?? -1, { url: YT(9), title: 'Урок 9' });
    const added = t.api.addTab({ url: YT(10) });
    t.api.userMoveToGroup(added.id, groupId);
    await t.settle();

    const mirror = single(await t.groups.listAll());
    expect(mirror).toMatchObject({ title: 'Курс TS', color: 'purple' });
    const saved = await t.tabs.listByGroup(mirror.id);
    expect(saved.map((tab) => [tab.url, tab.title])).toEqual([
      [YT(9), 'Урок 9'],
      [YT(10), YT(10)],
    ]);
  });

  it('sends a tab closed in Chrome to the trash', async () => {
    const { tabs } = t.api.addGroup('Учёба', 'blue', [{ url: YT(1) }, { url: YT(2) }]);
    await t.settle();

    await t.api.removeTabs([tabs[1]?.id ?? -1]);
    await t.settle();

    const mirror = await mirrorOf('Учёба');
    expect(await savedUrls(mirror.id)).toEqual([YT(1)]);
    expect((await t.trash.list()).tabs.map((tab) => tab.url)).toEqual([YT(2)]);
  });

  it('forgets a tab that left the group but is still open', async () => {
    const { tabs } = t.api.addGroup('Учёба', 'blue', [{ url: YT(1) }, { url: YT(2) }]);
    await t.settle();

    await t.api.ungroupTabs([tabs[1]?.id ?? -1]);
    await t.settle();

    expect(await savedUrls((await mirrorOf('Учёба')).id)).toEqual([YT(1)]);
    expect((await t.trash.list()).tabs).toEqual([]);
  });

  it('keeps a group closed in Chrome as stowed, with all its links', async () => {
    const { tabs } = t.api.addGroup('Учёба', 'blue', [{ url: YT(1) }, { url: YT(2) }]);
    t.api.addTab({ url: 'https://example.com/' }); // keeps the window open
    await t.settle();

    await t.api.removeTabs(tabs.map((tab) => tab.id));
    await t.settle();

    const mirror = await mirrorOf('Учёба');
    expect(mirror.state).toBe('stowed');
    expect(mirror.chromeGroupId).toBeUndefined();
    expect(await savedUrls(mirror.id)).toEqual([YT(1), YT(2)]);
    expect((await t.trash.list()).tabs).toEqual([]);
  });

  it('stows the groups of a closed window', async () => {
    const other = t.api.openWindow();
    t.api.addGroup('Работа', 'red', [{ url: 'https://github.com/' }], other);
    await t.settle();

    t.api.closeWindow(other);
    await t.settle();

    expect((await mirrorOf('Работа')).state).toBe('stowed');
  });

  it('forgets a group dissolved in Chrome (tabs ungrouped, still open)', async () => {
    const { tabs } = t.api.addGroup('Временная', 'cyan', [{ url: YT(1) }, { url: YT(2) }]);
    await t.settle();

    await t.api.ungroupTabs(tabs.map((tab) => tab.id));
    await t.settle();

    expect(await t.groups.listAll()).toEqual([]);
    expect((await t.trash.list()).groups).toEqual([]);
  });

  it('marks a group asleep when all its tabs are discarded, active when one reloads', async () => {
    t.api.addTab({ url: 'https://example.com/', active: true });
    const { tabs } = t.api.addGroup('Учёба', 'blue', [{ url: YT(1) }, { url: YT(2) }]);
    await t.settle();

    for (const tab of tabs) await t.api.discardTab(tab.id);
    await t.settle();
    expect((await mirrorOf('Учёба')).state).toBe('asleep');

    await t.api.activateTab(tabs[0]?.id ?? -1);
    await t.settle();
    expect((await mirrorOf('Учёба')).state).toBe('active');
  });

  it('follows tab ids replaced by discarding without duplicating tabs', async () => {
    t.api.replaceIdsOnDiscard = true;
    t.api.addTab({ url: 'https://example.com/', active: true });
    const { tabs } = t.api.addGroup('Учёба', 'blue', [{ url: YT(1) }]);
    await t.settle();

    const discarded = await t.api.discardTab(tabs[0]?.id ?? -1);
    await t.settle();

    const saved = single(await t.tabs.listByGroup((await mirrorOf('Учёба')).id));
    expect(saved.chromeTabId).toBe(discarded?.id);
  });

  describe('after a browser restart', () => {
    it('relinks restored groups instead of duplicating them', async () => {
      t.api.addGroup('Учёба', 'blue', [{ url: YT(1) }, { url: YT(2) }]);
      t.api.addGroup('Работа', 'red', [{ url: 'https://github.com/' }]);
      await t.settle();
      const before = await t.groups.listAll();

      await t.restartBrowser();

      const after = await t.groups.listAll();
      expect(after.map((group) => group.id).sort()).toEqual(before.map((group) => group.id).sort());
      for (const group of after) {
        const chromeGroup = await t.api.getGroup(group.chromeGroupId ?? -1);
        expect(chromeGroup?.title).toBe(group.title);
        const chromeTabs = await t.api.queryTabs({ groupId: chromeGroup?.id });
        const saved = await t.tabs.listByGroup(group.id);
        expect(saved.map((tab) => tab.chromeTabId)).toEqual(chromeTabs.map((tab) => tab.id));
      }
    });

    it('brings back groups stowed when the last window closed', async () => {
      t.api.addGroup('Учёба', 'blue', [{ url: YT(1) }, { url: YT(2) }]);
      await t.settle();
      const { id } = await mirrorOf('Учёба');

      // Chrome reports the window as closed on exit, then restores the session.
      t.api.exit();
      await t.settle();
      expect((await mirrorOf('Учёба')).state).toBe('stowed');
      await t.restartBrowser();

      const mirror = await mirrorOf('Учёба');
      expect(mirror.id).toBe(id);
      expect(mirror.state).not.toBe('stowed');
      expect(await savedUrls(id)).toEqual([YT(1), YT(2)]);
    });

    it('stows groups that did not come back', async () => {
      const { tabs } = t.api.addGroup('Учёба', 'blue', [{ url: YT(1) }]);
      t.api.addTab({ url: 'https://example.com/' });
      await t.settle();
      // Closed while the worker was not listening.
      await t.api.removeTabs(tabs.map((tab) => tab.id));
      await t.restartBrowser();

      const mirror = await mirrorOf('Учёба');
      expect(mirror.state).toBe('stowed');
      expect(await savedUrls(mirror.id)).toEqual([YT(1)]);
    });

    it('empties trash older than 30 days in a new session', async () => {
      const { tabs } = t.api.addGroup('Учёба', 'blue', [{ url: YT(1) }, { url: YT(2) }]);
      await t.settle();
      await t.api.removeTabs([tabs[1]?.id ?? -1]);
      await t.settle();
      expect((await t.trash.list()).tabs).toHaveLength(1);

      t.now.value += 31 * DAY_MS;
      await t.restartBrowser();

      expect((await t.trash.list()).tabs).toEqual([]);
    });
  });
});
