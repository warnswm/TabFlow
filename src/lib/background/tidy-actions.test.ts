import { beforeEach, describe, expect, it } from 'vitest';
import { NO_GROUP } from '../browser-api';
import { undoCommands } from '../app/undo';
import { isCommand, type Command } from '../messages';
import {
  type BackgroundTestContext,
  expectOk,
  setupBackground,
  single,
} from '../testing/background';
import { FAKE_APP_PAGE_URL } from '../testing/fake-tabs-api';

const URL = (name: string) => `https://${name}.example/`;
const MIN = 60_000;

describe('autosleep, duplicates, grouping', () => {
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

  /** Runs the command and then its undo, as «Отменить» in the toast does. */
  async function undo(command: Command, result: ReturnType<typeof expectOk>) {
    for (const back of undoCommands(command, result, 'background') ?? []) {
      expect(isCommand(back), back.type).toBe(true);
      expectOk(await t.command(back));
    }
  }

  describe('autosleep', () => {
    it('puts a group unused for 30 minutes to sleep; «Уснула сама»', async () => {
      const { group, groupId } = await openGroup('Учёба', ['a', 'b']);
      t.api.addTab({ url: URL('other'), active: true });

      t.now.value += 29 * MIN;
      await t.bg.autoSleep();
      expect((await t.groups.get(group.id))?.state).toBe('active');

      t.now.value += 2 * MIN;
      await t.bg.autoSleep();
      expect((await t.api.queryTabs({ groupId })).every((tab) => tab.discarded)).toBe(true);
      const slept = await t.groups.get(group.id);
      expect(slept).toMatchObject({ state: 'asleep', autoSlept: true });

      // Woken up by the user: «Уснула сама» is forgotten.
      const [first] = await t.api.queryTabs({ groupId });
      if (first) await t.api.activateTab(first.id);
      await t.settle();
      const woken = await t.groups.get(group.id);
      expect(woken?.state).toBe('active');
      expect(woken?.autoSlept).toBeUndefined();
    });

    it('leaves the group of the tab on screen, a kept group and sound alone', async () => {
      const shown = await openGroup('На экране', ['a', 'b']);
      const kept = await openGroup('Не спит', ['c', 'd']);
      const music = await openGroup('Музыка', ['e']);
      t.api.addTab({ url: URL('f'), title: 'f', audible: true, windowId: undefined });
      t.api.userMoveToGroup(t.api.allTabs().at(-1)?.id ?? 0, music.groupId);
      await t.settle();
      await t.groups.update(kept.group.id, { keepAwake: true });
      const [shownTab] = await t.api.queryTabs({ groupId: shown.groupId });
      if (shownTab) await t.api.activateTab(shownTab.id);
      await t.settle();

      t.now.value += 60 * MIN;
      await t.bg.autoSleep();

      expect((await t.groups.get(shown.group.id))?.state).toBe('active');
      expect((await t.groups.get(kept.group.id))?.state).toBe('active');
      // The tab with sound stays loaded, the other one of its group sleeps.
      const musicTabs = await t.api.queryTabs({ groupId: music.groupId });
      expect(musicTabs.map((tab) => [tab.title, tab.discarded])).toEqual([
        ['e', true],
        ['f', false],
      ]);
      expect((await t.groups.get(music.group.id))?.state).toBe('active');
    });

    it('does nothing when off', async () => {
      const { group } = await openGroup('Учёба', ['a']);
      t.api.addTab({ url: URL('other'), active: true });
      t.settings.sleep = { minutes: 0, sites: [] };
      t.now.value += 600 * MIN;
      await t.bg.autoSleep();
      expect((await t.groups.get(group.id))?.state).toBe('active');
    });
  });

  describe('closeDuplicates', () => {
    it('closes extra copies of a page and opens them again on undo', async () => {
      const kept = t.api.addTab({ url: URL('a'), active: true });
      const extra = t.api.addTab({ url: `${URL('a')}?utm_source=mail` });
      t.api.addTab({ url: URL('b') });
      await t.settle();

      const command: Command = { type: 'closeDuplicates', keys: ['tab:a.example'] };
      const result = expectOk(await t.command(command));

      expect(result.tabs).toBe(1);
      const urls = t.api.allTabs().map((tab) => tab.url);
      expect(urls).toEqual([URL('a'), URL('b')]);
      expect(t.api.allTabs().map((tab) => tab.id)).toContain(kept.id);

      await undo(command, result);
      expect(t.api.allTabs().map((tab) => tab.url)).toEqual([
        URL('a'),
        `${URL('a')}?utm_source=mail`,
        URL('b'),
      ]);
      expect(t.api.allTabs().some((tab) => tab.id === extra.id)).toBe(false); // a new tab
    });

    it('only closes the sets of the preview', async () => {
      t.api.addTab({ url: URL('a'), active: true });
      t.api.addTab({ url: URL('a') });
      t.api.addTab({ url: URL('b') });
      t.api.addTab({ url: URL('b') });
      await t.settle();

      expectOk(await t.command({ type: 'closeDuplicates', keys: ['tab:b.example', 'tab:gone'] }));
      expect(t.api.allTabs().map((tab) => tab.url)).toEqual([URL('a'), URL('a'), URL('b')]);
    });

    it('moves a duplicate link to the trash before its tab closes; undo brings it back', async () => {
      t.api.addTab({ url: URL('a'), active: true });
      const { group, groupId } = await openGroup('Учёба', ['a', 'b']);

      const command: Command = { type: 'closeDuplicates', keys: ['tab:a.example'] };
      const result = expectOk(await t.command(command));

      expect(result.tabs).toBe(1);
      expect((await t.tabs.listByGroup(group.id)).map((tab) => tab.title)).toEqual(['b']);
      expect((await t.api.queryTabs({ groupId })).map((tab) => tab.url)).toEqual([URL('b')]);

      await undo(command, result);
      expect((await t.tabs.listByGroup(group.id)).map((tab) => tab.url).sort()).toEqual([
        URL('a'),
        URL('b'),
      ]);
      expect((await t.api.queryTabs({ groupId })).map((tab) => tab.url).sort()).toEqual([
        URL('a'),
        URL('b'),
      ]);
    });

    it('moves a repeated link of a stowed group to the trash with its group when it was the last', async () => {
      const first = await openGroup('Первая', ['a', 'b']);
      expectOk(await t.command({ type: 'stowGroup', groupId: first.group.id }));
      t.now.value += MIN;
      const second = await openGroup('Вторая', ['a']);
      expectOk(await t.command({ type: 'stowGroup', groupId: second.group.id }));

      const command: Command = { type: 'closeDuplicates', keys: ['link:a.example'] };
      const result = expectOk(await t.command(command));

      expect(result.duplicates?.links).toBe(1);
      // The oldest link stays; the second group held only the repeat and is in the trash.
      expect(await t.tabs.listByGroup(first.group.id)).toHaveLength(2);
      expect(await t.groups.get(second.group.id)).toBeUndefined();

      await undo(command, result);
      expect(await t.groups.get(second.group.id)).toMatchObject({ state: 'stowed' });
      expect(await t.tabs.listByGroup(second.group.id)).toHaveLength(1);
    });
  });

  describe('groupTabs', () => {
    it('makes native groups that TabFlow mirrors; undo puts the tabs back', async () => {
      t.api.addTab({ url: FAKE_APP_PAGE_URL, active: true });
      const a = t.api.addTab({ url: URL('a') });
      const b = t.api.addTab({ url: URL('b') });
      const c = t.api.addTab({ url: URL('c') });
      const pinned = t.api.addTab({ url: URL('d'), pinned: true });
      await t.settle();

      const command: Command = {
        type: 'groupTabs',
        groups: [{ title: 'Разработка', color: 'blue', chromeTabIds: [a.id, c.id, pinned.id] }],
      };
      const result = expectOk(await t.command(command));

      expect(result).toMatchObject({ groups: 1, tabs: 2 });
      const [native] = t.api.allGroups();
      expect(native).toMatchObject({ title: 'Разработка', color: 'blue' });
      const mirror = single(await t.groups.listAll());
      expect(mirror).toMatchObject({ title: 'Разработка', state: 'active' });
      expect((await t.tabs.listByGroup(mirror.id)).map((tab) => tab.url)).toEqual([
        URL('a'),
        URL('c'),
      ]);
      expect((await t.api.getTab(b.id))?.groupId).toBe(NO_GROUP);

      await undo(command, result);
      expect(t.api.allGroups()).toEqual([]);
      expect(await t.groups.listAll()).toEqual([]);
      expect(t.api.allTabs().map((tab) => tab.url)).toEqual([
        FAKE_APP_PAGE_URL,
        URL('a'),
        URL('b'),
        URL('c'),
        URL('d'),
      ]);
    });

    it('adds tabs to the group of the same title instead of a twin', async () => {
      const { group, groupId } = await openGroup('Учёба', ['a']);
      const loose = t.api.addTab({ url: URL('b') });
      await t.settle();

      expectOk(
        await t.command({
          type: 'groupTabs',
          groups: [
            {
              title: 'Учёба',
              color: 'green',
              chromeTabIds: [loose.id],
              joinChromeGroupId: groupId,
            },
          ],
        }),
      );

      expect(t.api.allGroups()).toHaveLength(1);
      expect((await t.tabs.listByGroup(group.id)).map((tab) => tab.url)).toEqual([
        URL('a'),
        URL('b'),
      ]);
    });

    it('skips tabs that are already in a group', async () => {
      const { groupId } = await openGroup('Учёба', ['a', 'b']);
      const ids = (await t.api.queryTabs({ groupId })).map((tab) => tab.id);

      const result = expectOk(
        await t.command({
          type: 'groupTabs',
          groups: [{ title: 'Другая', color: 'red', chromeTabIds: ids }],
        }),
      );
      expect(result.groups).toBe(0);
      expect(t.api.allGroups()).toHaveLength(1);
    });
  });

  it('opens the main page on a screen', async () => {
    t.api.addTab({ url: URL('a'), active: true });
    expectOk(await t.command({ type: 'openApp', screen: 'tidy' }));
    expect(t.api.allTabs().map((tab) => tab.url)).toContain(`${FAKE_APP_PAGE_URL}#/tidy`);
  });

  it('rejects malformed commands', () => {
    expect(isCommand({ type: 'closeDuplicates', keys: [1] })).toBe(false);
    expect(isCommand({ type: 'groupTabs', groups: [{ title: 'x', color: 'pink' }] })).toBe(false);
    expect(
      isCommand({
        type: 'groupTabs',
        groups: [{ title: 'x', color: 'pink', chromeTabIds: [1], extra: 1 }],
      }),
    ).toBe(false);
    expect(isCommand({ type: 'openApp', screen: 'other' })).toBe(false);
    expect(
      isCommand({
        type: 'undoCloseDuplicates',
        undo: { reopen: [{ url: 'https://a/', windowId: 1, index: 0 }], restore: [] },
      }),
    ).toBe(true);
  });
});
