import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FAKE_APP_PAGE_URL } from '../testing/fake-tabs-api';
import {
  type BackgroundTestContext,
  expectOk,
  setupBackground,
  single,
} from '../testing/background';
import { collapsedGroupTitle } from './collapse';

const YT = (n: number) => `https://www.youtube.com/watch?v=${n}`;

describe('collapse all', () => {
  let t: BackgroundTestContext;

  beforeEach(async () => {
    t = setupBackground();
    await t.bg.start();
  });

  it('stows each native group and the loose tabs, keeping pinned and browser pages', async () => {
    const mail = t.api.addTab({ url: 'https://mail.example.com/', pinned: true });
    const settings = t.api.addTab({ url: 'chrome://settings' });
    t.api.addTab({ url: YT(1) });
    t.api.addTab({ url: 'https://docs.example.com/a', active: true });
    t.api.addTab({ url: `${YT(1)}#t=30` }); // duplicate of a loose tab
    t.api.addGroup('Учёба', 'blue', [{ url: YT(2) }, { url: YT(3) }]);
    await t.settle();

    const result = expectOk(await t.command({ type: 'collapseAll' }));

    const groups = await t.groups.listAll();
    // Undo reopens exactly the stowed groups.
    expect(result).toEqual({
      groups: 2,
      tabs: 4,
      failed: 0,
      closedGroupIds: expect.arrayContaining(groups.map((group) => group.id)),
    });
    expect(result.closedGroupIds).toHaveLength(2);
    expect(groups.every((group) => group.state === 'stowed')).toBe(true);
    const inbox = await t.spaces.ensureDefault();
    expect(groups.every((group) => group.spaceId === inbox.id)).toBe(true);

    const study = single(groups.filter((group) => group.title === 'Учёба'));
    expect(study.color).toBe('blue');
    expect((await t.tabs.listByGroup(study.id)).map((tab) => tab.url)).toEqual([YT(2), YT(3)]);

    const loose = single(groups.filter((group) => group.title !== 'Учёба'));
    expect(loose.title).toBe(collapsedGroupTitle(t.now.value));
    expect((await t.tabs.listByGroup(loose.id)).map((tab) => tab.url)).toEqual([
      YT(1),
      'https://docs.example.com/a',
    ]);

    const left = t.api.allTabs();
    expect(left.map((tab) => tab.id)).toEqual(expect.arrayContaining([mail.id, settings.id]));
    expect(left.map((tab) => tab.url).sort()).toEqual(
      [FAKE_APP_PAGE_URL, 'chrome://settings', 'https://mail.example.com/'].sort(),
    );
    expect(left.find((tab) => tab.active)?.url).toBe(FAKE_APP_PAGE_URL);
    expect(t.api.allGroups()).toEqual([]);
  });

  it('only touches the current window', async () => {
    const first = t.api.openWindow();
    t.api.addTab({ windowId: first, url: YT(1) });
    const second = t.api.openWindow();
    t.api.addTab({ windowId: second, url: YT(2) }); // focused window
    await t.settle();

    expectOk(await t.command({ type: 'collapseAll' }));

    expect((await t.api.queryTabs({ windowId: first })).map((tab) => tab.url)).toEqual([YT(1)]);
    expect((await t.api.queryTabs({ windowId: second })).map((tab) => tab.url)).toEqual([
      FAKE_APP_PAGE_URL,
    ]);
  });

  it('does nothing when there is nothing to save', async () => {
    t.api.addTab({ url: 'chrome://newtab' });
    await t.settle();

    const result = expectOk(await t.command({ type: 'collapseAll' }));

    expect(result).toEqual({ groups: 0, tabs: 0, failed: 0, closedGroupIds: [] });
    expect(t.api.allTabs().map((tab) => tab.url)).toEqual(['chrome://newtab']);
    expect(await t.groups.listAll()).toEqual([]);
  });

  it('closes nothing when the database write fails', async () => {
    t.api.addTab({ url: YT(1) });
    t.api.addTab({ url: YT(2) });
    await t.settle();
    const before = t.api.allTabs();
    vi.spyOn(t.tabs, 'addMany').mockRejectedValueOnce(new Error('disk full'));

    const response = await t.command({ type: 'collapseAll' });

    expect(response).toMatchObject({ ok: false, code: 'unexpected' });
    expect(t.api.allTabs()).toEqual(before);
    expect(await t.groups.listAll()).toEqual([]); // the transaction was rolled back
  });

  it('formats the title of the loose tabs group', () => {
    expect(collapsedGroupTitle(new Date(2026, 9, 16, 9, 5).getTime())).toBe('16 окт, 09:05');
  });
});
