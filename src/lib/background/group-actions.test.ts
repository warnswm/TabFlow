import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_GROUP } from '../browser-api';
import { FAKE_APP_PAGE_URL } from '../testing/fake-tabs-api';
import {
  type BackgroundTestContext,
  expectOk,
  setupBackground,
  single,
} from '../testing/background';

const YT = (n: number) => `https://www.youtube.com/watch?v=${n}`;

describe('group actions', () => {
  let t: BackgroundTestContext;

  beforeEach(async () => {
    t = setupBackground();
    await t.bg.start();
  });

  /** A native group «Учёба» next to an ungrouped tab, mirrored into the database. */
  async function studyGroup(urls = [YT(1), YT(2), YT(3)]) {
    const other = t.api.addTab({ url: 'https://example.com/' });
    const chrome = t.api.addGroup(
      'Учёба',
      'blue',
      urls.map((url) => ({ url })),
    );
    await t.settle();
    const group = single(await t.groups.listAll());
    return { group, other, ...chrome };
  }

  describe('sleep', () => {
    it('discards every tab, collapses the group and marks it asleep', async () => {
      const { group, groupId, tabs } = await studyGroup();
      await t.api.activateTab(tabs[1]?.id ?? -1); // the active tab is in the group

      const result = expectOk(await t.command({ type: 'sleepGroup', groupId: group.id }));

      expect(result).toEqual({ groups: 1, tabs: 3, failed: 0, closedGroupIds: [] });
      const chromeTabs = await t.api.queryTabs({ groupId });
      expect(chromeTabs.every((tab) => tab.discarded)).toBe(true);
      expect((await t.api.getGroup(groupId))?.collapsed).toBe(true);
      expect((await t.groups.get(group.id))?.state).toBe('asleep');
      // Tabs stay on the strip and in the mirror.
      expect(await t.tabs.listByGroup(group.id)).toHaveLength(3);
    });

    it('moves focus away from the group, to the main page if nothing else is open', async () => {
      t.api.addGroup('Одна', 'red', [{ url: YT(1) }]);
      await t.settle();
      const group = single(await t.groups.listAll());

      expectOk(await t.command({ type: 'sleepGroup', groupId: group.id }));

      const active = t.api.allTabs().find((tab) => tab.active);
      expect(active?.url).toBe(FAKE_APP_PAGE_URL);
      expect((await t.groups.get(group.id))?.state).toBe('asleep');
    });

    it('refuses a group that is not on the tab strip', async () => {
      const { group } = await studyGroup();
      expectOk(await t.command({ type: 'stowGroup', groupId: group.id }));

      const response = await t.command({ type: 'sleepGroup', groupId: group.id });

      expect(response).toMatchObject({ ok: false, code: 'group-not-on-tab-strip' });
    });
  });

  describe('stow', () => {
    it('saves the links, then closes the tabs and the native group', async () => {
      const { group, groupId, other } = await studyGroup();

      const result = expectOk(await t.command({ type: 'stowGroup', groupId: group.id }));

      expect(result).toEqual({ groups: 1, tabs: 3, failed: 0, closedGroupIds: [group.id] });
      const stowed = await t.groups.get(group.id);
      expect(stowed?.state).toBe('stowed');
      expect(stowed?.chromeGroupId).toBeUndefined();
      const saved = await t.tabs.listByGroup(group.id);
      expect(saved.map((tab) => tab.url)).toEqual([YT(1), YT(2), YT(3)]);
      expect(saved.every((tab) => tab.chromeTabId === undefined)).toBe(true);
      expect(await t.api.getGroup(groupId)).toBeUndefined();
      expect(t.api.allTabs().map((tab) => tab.id)).toEqual([other.id]);
      // Closing the tabs did not touch the stowed group or create a new mirror.
      expect(await t.groups.listAll()).toHaveLength(1);
      expect((await t.trash.list()).tabs).toEqual([]);
    });

    it('saves duplicate URLs once and leaves browser pages open outside the group', async () => {
      t.api.addTab({ url: 'https://example.com/' });
      t.api.addGroup('Смесь', 'green', [
        { url: YT(1) },
        { url: 'chrome://settings' },
        { url: `${YT(1)}#comments` },
        { url: YT(2) },
      ]);
      await t.settle();
      const group = single(await t.groups.listAll());

      const result = expectOk(await t.command({ type: 'stowGroup', groupId: group.id }));

      expect(result.tabs).toBe(2);
      expect((await t.tabs.listByGroup(group.id)).map((tab) => tab.url)).toEqual([YT(1), YT(2)]);
      const settings = single(t.api.allTabs().filter((tab) => tab.url === 'chrome://settings'));
      expect(settings.groupId).toBe(NO_GROUP);
    });

    it('keeps the window open by showing the main page', async () => {
      const { tabs } = t.api.addGroup('Одна', 'red', [{ url: YT(1) }]);
      await t.settle();
      const group = single(await t.groups.listAll());
      const windowId = tabs[0]?.windowId;

      expectOk(await t.command({ type: 'stowGroup', groupId: group.id }));

      expect(t.api.windowIds()).toEqual([windowId]);
      expect(t.api.allTabs().map((tab) => tab.url)).toEqual([FAKE_APP_PAGE_URL]);
    });

    it('closes nothing when the database write fails', async () => {
      const { group } = await studyGroup();
      const tabsBefore = t.api.allTabs();
      vi.spyOn(t.groups, 'setState').mockRejectedValueOnce(new Error('disk full'));

      const response = await t.command({ type: 'stowGroup', groupId: group.id });

      expect(response).toMatchObject({ ok: false, code: 'unexpected' });
      expect(t.api.allTabs()).toEqual(tabsBefore);
      expect((await t.groups.get(group.id))?.state).toBe('active');
    });
  });

  describe('restore', () => {
    it('opens the group again as a native group with the same title and color', async () => {
      const { group } = await studyGroup();
      expectOk(await t.command({ type: 'stowGroup', groupId: group.id }));

      const result = expectOk(await t.command({ type: 'restoreGroup', groupId: group.id }));

      expect(result).toEqual({ groups: 1, tabs: 3, failed: 0, closedGroupIds: [] });
      const restored = single(await t.groups.listAll());
      expect(restored).toMatchObject({ id: group.id, state: 'active' });
      const chromeGroup = await t.api.getGroup(restored.chromeGroupId ?? -1);
      expect(chromeGroup).toMatchObject({ title: 'Учёба', color: 'blue', collapsed: false });
      const chromeTabs = await t.api.queryTabs({ groupId: chromeGroup?.id });
      expect(chromeTabs.map((tab) => tab.url)).toEqual([YT(1), YT(2), YT(3)]);
      expect(chromeTabs[0]?.active).toBe(true);
      const saved = await t.tabs.listByGroup(group.id);
      expect(saved.map((tab) => tab.chromeTabId)).toEqual(chromeTabs.map((tab) => tab.id));
    });

    it.each([
      { replaceIds: false, refusals: 0 },
      { replaceIds: true, refusals: 0 },
      { replaceIds: false, refusals: 2 },
    ])(
      'loads only the first tab; the rest wait discarded with their titles (%o)',
      async ({ replaceIds, refusals }) => {
        t.api.replaceIdsOnDiscard = replaceIds;
        t.api.refusedDiscardsAfterCreate = refusals;
        t.api.addTab({ url: 'https://example.com/' });
        t.api.addGroup('Курс', 'purple', [
          { url: YT(1), title: 'Урок 1' },
          { url: YT(2), title: 'Урок 2' },
          { url: YT(3), title: 'Урок 3' },
        ]);
        await t.settle();
        const group = single(await t.groups.listAll());
        expectOk(await t.command({ type: 'stowGroup', groupId: group.id }));

        expectOk(await t.command({ type: 'restoreGroup', groupId: group.id }));

        const restored = single(await t.groups.listAll());
        expect(restored.state).toBe('active');
        const chromeTabs = await t.api.queryTabs({ groupId: restored.chromeGroupId });
        expect(chromeTabs.map((tab) => [tab.active, tab.discarded])).toEqual([
          [true, false],
          [false, true],
          [false, true],
        ]);
        const saved = await t.tabs.listByGroup(group.id);
        expect(saved.map((tab) => tab.title)).toEqual(['Урок 1', 'Урок 2', 'Урок 3']);
        // Discarded only after the URL was committed: no tab came back as about:blank.
        expect(chromeTabs.map((tab) => tab.url)).toEqual([YT(1), YT(2), YT(3)]);
        expect(saved.map((tab) => tab.url)).toEqual([YT(1), YT(2), YT(3)]);
        expect(saved.map((tab) => tab.chromeTabId)).toEqual(chromeTabs.map((tab) => tab.id));
      },
    );

    it('puts the group with its title on the strip right after the first tab', async () => {
      const { group } = await studyGroup();
      expectOk(await t.command({ type: 'stowGroup', groupId: group.id }));
      const groupsWhenOpening: string[][] = [];
      const createTab = t.api.createTab.bind(t.api);
      vi.spyOn(t.api, 'createTab').mockImplementation(async (input) => {
        groupsWhenOpening.push(t.api.allGroups().map((g) => g.title));
        return createTab(input);
      });

      expectOk(await t.command({ type: 'restoreGroup', groupId: group.id }));

      expect(groupsWhenOpening).toEqual([[], ['Учёба'], ['Учёба']]);
      const chromeGroup = single(t.api.allGroups());
      const chromeTabs = await t.api.queryTabs({ groupId: chromeGroup.id });
      expect(chromeTabs.map((tab) => tab.url)).toEqual([YT(1), YT(2), YT(3)]);
    });

    it('starts the group with the next tab when the first one cannot be opened', async () => {
      const { group } = await studyGroup();
      expectOk(await t.command({ type: 'stowGroup', groupId: group.id }));
      t.api.failNext('createTab');

      const result = expectOk(await t.command({ type: 'restoreGroup', groupId: group.id }));

      expect(result).toMatchObject({ tabs: 2, failed: 1 });
      const chromeTabs = await t.api.queryTabs({ groupId: single(t.api.allGroups()).id });
      expect(chromeTabs.map((tab) => [tab.url, tab.active])).toEqual([
        [YT(2), true],
        [YT(3), false],
      ]);
    });

    describe('placeholders', () => {
      async function restoredWithPlaceholders() {
        t.api.addTab({ url: 'https://example.com/' });
        t.api.addGroup('Курс', 'purple', [
          { url: YT(1), title: 'Урок 1' },
          { url: YT(2), title: 'Урок 2' },
        ]);
        await t.settle();
        const group = single(await t.groups.listAll());
        expectOk(await t.command({ type: 'stowGroup', groupId: group.id }));
        expectOk(await t.command({ type: 'restoreGroup', groupId: group.id, mode: 'placeholder' }));
        const restored = single(await t.groups.listAll());
        const chromeTabs = await t.api.queryTabs({ groupId: restored.chromeGroupId });
        return { group, chromeTabs };
      }

      it('opens the waiting tabs as discarded placeholders that show the real page', async () => {
        const { chromeTabs } = await restoredWithPlaceholders();

        expect(chromeTabs.map((tab) => [tab.placeholder, tab.discarded])).toEqual([
          [false, false],
          [true, true],
        ]);
        expect(chromeTabs[1]).toMatchObject({ url: YT(2), title: 'Урок 2' });
      });

      it('goes to the real page when opened, keeping the saved link', async () => {
        const { group, chromeTabs } = await restoredWithPlaceholders();

        await t.api.activateTab(chromeTabs[1]?.id ?? -1);
        await t.settle();

        const opened = await t.api.getTab(chromeTabs[1]?.id ?? -1);
        expect(opened).toMatchObject({ url: YT(2), placeholder: false, discarded: false });
        const saved = await t.tabs.listByGroup(group.id);
        expect(saved.map((tab) => [tab.url, tab.title])).toEqual([
          [YT(1), 'Урок 1'],
          [YT(2), 'Урок 2'],
        ]);
      });

      it('waits for the icon before discarding, but not longer than 2 s', async () => {
        const { group } = await studyGroup();
        expectOk(await t.command({ type: 'stowGroup', groupId: group.id }));
        t.api.iconsNeverLoad = true;
        vi.useFakeTimers({ toFake: ['setTimeout'] });
        try {
          const pending = t.command({ type: 'restoreGroup', groupId: group.id });
          await vi.advanceTimersByTimeAsync(1_000);
          const waiting = t.api.allTabs().filter((tab) => tab.placeholder);
          expect(waiting).toHaveLength(2);
          expect(waiting.some((tab) => tab.discarded)).toBe(false);

          await vi.advanceTimersByTimeAsync(2_000);
          expectOk(await pending);
          expect(
            t.api
              .allTabs()
              .filter((tab) => tab.placeholder)
              .every((tab) => tab.discarded),
          ).toBe(true);
        } finally {
          vi.useRealTimers();
        }
      });

      it('saves the real URLs when a group with placeholders is stowed again', async () => {
        const { group } = await restoredWithPlaceholders();

        expectOk(await t.command({ type: 'stowGroup', groupId: group.id }));

        expect((await t.tabs.listByGroup(group.id)).map((tab) => tab.url)).toEqual([YT(1), YT(2)]);
      });
    });

    it('in background mode returns at once and discards the tabs afterwards', async () => {
      t.api.replaceIdsOnDiscard = true;
      const { group } = await studyGroup();
      expectOk(await t.command({ type: 'stowGroup', groupId: group.id }));

      expectOk(await t.command({ type: 'restoreGroup', groupId: group.id, mode: 'background' }));
      const restored = single(await t.groups.listAll());
      const chromeGroupId = restored.chromeGroupId;

      await vi.waitFor(async () => {
        const tabs = await t.api.queryTabs({ groupId: chromeGroupId });
        expect(tabs.map((tab) => tab.discarded)).toEqual([false, true, true]);
      });
      await t.settle();
      const chromeTabs = await t.api.queryTabs({ groupId: chromeGroupId });
      expect(chromeTabs.map((tab) => tab.url)).toEqual([YT(1), YT(2), YT(3)]);
      const saved = await t.tabs.listByGroup(group.id);
      expect(saved.map((tab) => tab.chromeTabId)).toEqual(chromeTabs.map((tab) => tab.id));
    });

    it('leaves a tab loaded, not lost, when Chrome never discards it', async () => {
      const { group } = await studyGroup();
      expectOk(await t.command({ type: 'stowGroup', groupId: group.id }));
      t.api.refusedDiscardsAfterCreate = Infinity;
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      vi.useFakeTimers({ toFake: ['setTimeout'] });
      try {
        const pending = t.command({ type: 'restoreGroup', groupId: group.id });
        for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(1_000);
        const result = expectOk(await pending);

        expect(result).toMatchObject({ tabs: 3, failed: 0 });
        const restored = single(await t.groups.listAll());
        const chromeTabs = await t.api.queryTabs({ groupId: restored.chromeGroupId });
        expect(chromeTabs.map((tab) => tab.discarded)).toEqual([false, false, false]);
        expect(warn).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('opens what it can and keeps the links of tabs that failed', async () => {
      const { group } = await studyGroup();
      expectOk(await t.command({ type: 'stowGroup', groupId: group.id }));
      t.api.failNext('createTab');

      const result = expectOk(await t.command({ type: 'restoreGroup', groupId: group.id }));

      expect(result).toMatchObject({ tabs: 2, failed: 1 });
      const all = await t.tabs.listByGroup(group.id);
      const trashed = (await t.trash.list()).tabs;
      expect(all.length + trashed.length).toBe(3);
    });

    it('without native groups opens the tabs and keeps the group stowed', async () => {
      const plain = setupBackground({ supportsGroups: false });
      await plain.bg.start();
      plain.api.addTab({ url: 'https://example.com/' });
      const space = await plain.spaces.ensureDefault();
      const group = await plain.groups.create({
        spaceId: space.id,
        title: 'Учёба',
        color: 'blue',
        state: 'stowed',
      });
      await plain.tabs.addMany(group.id, [{ url: YT(1), title: '1' }]);

      const result = expectOk(await plain.command({ type: 'restoreGroup', groupId: group.id }));

      expect(result.tabs).toBe(1);
      expect(plain.api.allTabs().map((tab) => tab.url)).toContain(YT(1));
      expect((await plain.groups.get(group.id))?.state).toBe('stowed');
    });

    it('reports an unknown group', async () => {
      const response = await t.command({ type: 'restoreGroup', groupId: 'missing' });
      expect(response).toMatchObject({ ok: false, code: 'group-not-found' });
    });
  });

  it('survives a full cycle: active → asleep → stowed → active', async () => {
    const { group } = await studyGroup();

    expectOk(await t.command({ type: 'sleepGroup', groupId: group.id }));
    expectOk(await t.command({ type: 'stowGroup', groupId: group.id }));
    expectOk(await t.command({ type: 'restoreGroup', groupId: group.id }));

    const restored = single(await t.groups.listAll());
    expect(restored.state).toBe('active');
    expect((await t.tabs.listByGroup(group.id)).map((tab) => tab.url)).toEqual([
      YT(1),
      YT(2),
      YT(3),
    ]);
    expect((await t.trash.list()).tabs).toEqual([]);
  });

  it('rejects malformed messages', async () => {
    expect(await t.bg.handleMessage({ type: 'dropDatabase' })).toMatchObject({
      ok: false,
      code: 'invalid-command',
    });
  });
});
