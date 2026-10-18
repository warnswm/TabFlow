import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BackgroundTestContext,
  expectOk,
  setupBackground,
  single,
} from '../testing/background';

const MANGA = (n: number) => `https://mangafire.to/read/${n}`;
const DORAMA = (n: number) => `https://dorama.land/watch/${n}`;

describe('a stowed group opened again from Chrome', () => {
  let t: BackgroundTestContext;

  beforeEach(async () => {
    t = setupBackground();
    await t.bg.start();
    t.api.addTab({ url: 'https://example.com/' });
  });

  /** A group on the strip, stowed in TabFlow: Chrome keeps it among its saved groups. */
  async function stowed(title: string, urls: string[], color: 'blue' | 'pink' = 'blue') {
    t.api.addGroup(
      title,
      color,
      urls.map((url) => ({ url })),
    );
    await t.settle();
    const group = single((await t.groups.listAll()).filter((g) => g.title === title));
    expectOk(await t.command({ type: 'stowGroup', groupId: group.id }));
    return group;
  }

  /** The user clicks the closed group in Chrome's bookmarks bar: Chrome opens its tabs again. */
  function openFromChrome(title: string, urls: string[], color: 'blue' | 'pink' = 'blue') {
    return t.api.addGroup(
      title,
      color,
      urls.map((url) => ({ url })),
    );
  }

  const urls = [MANGA(1), MANGA(2), MANGA(3)];

  it('comes back as the same group instead of a duplicate', async () => {
    const group = await stowed('manga', urls);

    const { groupId, tabs } = openFromChrome('manga', urls);
    await t.settle();

    const mirror = single(await t.groups.listAll());
    expect(mirror).toMatchObject({ id: group.id, state: 'active', chromeGroupId: groupId });
    expect((await t.tabs.listByGroup(group.id)).map((tab) => [tab.url, tab.chromeTabId])).toEqual(
      tabs.map((tab) => [tab.url, tab.id]),
    );
    expect((await t.trash.list()).tabs).toEqual([]);
  });

  it('opens links Chrome does not know as placeholders in the group', async () => {
    const group = await stowed('manga', urls);
    expectOk(await t.command({ type: 'saveLink', url: MANGA(4), groupId: group.id }));

    const { groupId } = openFromChrome('manga', urls);
    await t.settle();

    const chromeTabs = await t.api.queryTabs({ groupId });
    expect(chromeTabs.map((tab) => tab.url)).toEqual([...urls, MANGA(4)]);
    expect(chromeTabs.at(-1)?.placeholder).toBe(true);
    await vi.waitFor(async () => {
      expect((await t.api.queryTabs({ groupId })).at(-1)?.discarded).toBe(true);
    });
    await t.settle();
    const links = await t.tabs.listByGroup(group.id);
    expect(links.map((tab) => tab.url)).toEqual([...urls, MANGA(4)]);
    expect(links.every((tab) => tab.chromeTabId !== undefined)).toBe(true);
    expect((await t.trash.list()).tabs).toEqual([]);
  });

  it('a look-alike with another title or other pages stays a group of its own', async () => {
    await stowed('manga', urls);

    openFromChrome('Чтение', urls);
    openFromChrome('manga', [DORAMA(1), DORAMA(2)]);
    await t.settle();

    const groups = await t.groups.listAll();
    expect(groups.map((g) => [g.title, g.state]).sort()).toEqual([
      ['manga', 'active'],
      ['manga', 'stowed'],
      ['Чтение', 'active'],
    ]);
  });

  it('is recognized when it was opened while the service worker slept', async () => {
    const group = await stowed('manga', urls);
    expectOk(await t.command({ type: 'saveLink', url: MANGA(4), groupId: group.id }));

    t.api.sleepWorker();
    const { groupId } = openFromChrome('manga', urls);
    await t.wakeWorker();
    await t.settle();

    const mirror = single(await t.groups.listAll());
    expect(mirror).toMatchObject({ id: group.id, state: 'active', chromeGroupId: groupId });
    expect((await t.api.queryTabs({ groupId })).map((tab) => tab.url)).toEqual([...urls, MANGA(4)]);
    expect((await t.trash.list()).tabs).toEqual([]);
  });
});

describe('order of the groups on the tab strip', () => {
  let t: BackgroundTestContext;

  beforeEach(async () => {
    t = setupBackground();
    await t.bg.start();
    t.api.addTab({ url: 'https://example.com/' });
  });

  /** Titles of the native groups from left to right. */
  async function strip() {
    const titles: string[] = [];
    for (const tab of await t.api.queryTabs({})) {
      const title = tab.groupId === -1 ? '·' : (await t.api.getGroup(tab.groupId))?.title;
      if (title !== undefined && titles.at(-1) !== title) titles.push(title);
    }
    return titles;
  }

  async function groupNamed(title: string) {
    return single((await t.groups.listAll()).filter((g) => g.title === title));
  }

  async function openGroups(...titles: string[]) {
    for (const [i, title] of titles.entries()) {
      t.api.addGroup(title, 'blue', [
        { url: `https://example.com/${i}/a` },
        { url: `https://example.com/${i}/b` },
      ]);
    }
    await t.settle();
  }

  it('follows the order of tiles after a drag in TabFlow', async () => {
    await openGroups('A', 'B', 'C');
    const inbox = await t.spaces.ensureDefault();

    await t.groups.place((await groupNamed('C')).id, inbox.id, 0);
    const result = expectOk(await t.command({ type: 'arrangeGroups' }));

    expect(await strip()).toEqual(['·', 'C', 'A', 'B']);
    expect(result.groups).toBe(3);
    // Tabs keep their links and order inside each group.
    const c = await groupNamed('C');
    expect((await t.tabs.listByGroup(c.id)).map((tab) => tab.url)).toEqual([
      'https://example.com/2/a',
      'https://example.com/2/b',
    ]);
  });

  it('follows the order of spaces, «Входящие» first', async () => {
    await openGroups('A', 'B');
    const work = await t.spaces.create('Работа');
    await t.groups.move((await groupNamed('A')).id, work.id);

    expectOk(await t.command({ type: 'arrangeGroups' }));

    expect(await strip()).toEqual(['·', 'B', 'A']);
  });

  it('moves nothing when the order is already right', async () => {
    await openGroups('A', 'B');

    const result = expectOk(await t.command({ type: 'arrangeGroups' }));

    expect(result.groups).toBe(0);
    expect(await strip()).toEqual(['·', 'A', 'B']);
  });

  it('puts a restored group at its place instead of the end', async () => {
    await openGroups('A', 'B', 'C');
    const a = await groupNamed('A');
    expectOk(await t.command({ type: 'stowGroup', groupId: a.id }));
    expect(await strip()).toEqual(['·', 'B', 'C']);

    expectOk(await t.command({ type: 'restoreGroup', groupId: a.id }));

    expect(await strip()).toEqual(['·', 'A', 'B', 'C']);
  });

  it('puts a group opened from Chrome at its place', async () => {
    await openGroups('A', 'B');
    const a = await groupNamed('A');
    expectOk(await t.command({ type: 'stowGroup', groupId: a.id }));

    t.api.addGroup('A', 'blue', [
      { url: 'https://example.com/0/a' },
      { url: 'https://example.com/0/b' },
    ]);
    await t.settle();

    expect(await strip()).toEqual(['·', 'A', 'B']);
    expect((await groupNamed('A')).id).toBe(a.id);
  });
});
