import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPlaceholderUrl } from '../placeholder';
import { FAKE_PLACEHOLDER_PAGE_URL } from '../testing/fake-tabs-api';
import {
  type BackgroundTestContext,
  expectOk,
  setupBackground,
  single,
} from '../testing/background';
import { ICON_REFRESH_WINDOW_MS } from './placeholder-icons';

const YT = (n: number) => `https://www.youtube.com/watch?v=${n}`;
const placeholder = (n: number) =>
  buildPlaceholderUrl(FAKE_PLACEHOLDER_PAGE_URL, { url: YT(n), title: `Видео ${n}` });

describe('placeholder icons after a browser restart', () => {
  let t: BackgroundTestContext;

  beforeEach(async () => {
    t = setupBackground();
    await t.bg.start();
  });

  /** A group restored with placeholders: the first tab is shown, the others wait discarded. */
  async function restoredGroup() {
    t.api.addTab({ url: 'https://example.com/' });
    t.api.addGroup('Учёба', 'blue', [{ url: YT(1) }, { url: YT(2) }, { url: YT(3) }]);
    await t.settle();
    const group = single(await t.groups.listAll());
    expectOk(await t.command({ type: 'stowGroup', groupId: group.id }));
    expectOk(await t.command({ type: 'restoreGroup', groupId: group.id, mode: 'placeholder' }));
  }

  const waiting = () => t.api.allTabs().filter((tab) => tab.placeholder && !tab.active);

  describe('after the extension is reloaded or updated', () => {
    it('opens the closed placeholders again in their group instead of the trash', async () => {
      await restoredGroup();
      const group = single(await t.groups.listAll());
      const chromeGroupBefore = group.chromeGroupId;
      expect(waiting()).toHaveLength(2);

      await t.reloadExtension(); // Chrome closes the placeholders: they are TabFlow pages
      await t.settle();

      const [chrome] = t.api.allGroups();
      expect(chrome?.title).toBe('Учёба');
      expect((await t.api.queryTabs({ groupId: chrome?.id })).map((tab) => tab.url)).toEqual([
        YT(1),
        YT(2),
        YT(3),
      ]);
      await vi.waitFor(() => {
        expect(waiting().map((tab) => [tab.discarded, tab.hasIcon])).toEqual([
          [true, true],
          [true, true],
        ]);
      });
      await t.settle();
      const mirror = single(await t.groups.listAll());
      expect(mirror).toMatchObject({ id: group.id, state: 'active' });
      expect(mirror.chromeGroupId).toBe(chromeGroupBefore);
      expect((await t.tabs.listByGroup(group.id)).map((tab) => tab.url)).toEqual([
        YT(1),
        YT(2),
        YT(3),
      ]);
      expect((await t.trash.list()).tabs).toEqual([]);
    });

    it('keeps the order when a closed placeholder sat between open tabs', async () => {
      t.api.addTab({ url: 'https://example.com/' });
      const { groupId } = t.api.addGroup('Смесь', 'green', [
        { url: YT(1) },
        { url: placeholder(2), discarded: true },
        { url: YT(3) },
      ]);
      await t.settle();
      const group = single(await t.groups.listAll());

      await t.reloadExtension();
      await t.settle();

      expect((await t.api.queryTabs({ groupId })).map((tab) => tab.url)).toEqual([
        YT(1),
        YT(2),
        YT(3),
      ]);
      expect((await t.tabs.listByGroup(group.id)).map((tab) => tab.url)).toEqual([
        YT(1),
        YT(2),
        YT(3),
      ]);
    });
  });

  it('restores a link from the trash into an open group as a placeholder', async () => {
    t.api.addTab({ url: 'https://example.com/' });
    const { groupId } = t.api.addGroup('Учёба', 'blue', [{ url: YT(1) }, { url: YT(2) }]);
    await t.settle();
    const group = single(await t.groups.listAll());
    const [, second] = await t.tabs.listByGroup(group.id);
    expectOk(await t.command({ type: 'deleteTab', tabId: second?.id ?? '' }));

    expectOk(await t.command({ type: 'restoreDeleted', kind: 'tab', id: second?.id ?? '' }));

    const restored = (await t.api.queryTabs({ groupId })).at(-1);
    expect(restored).toMatchObject({ url: YT(2), placeholder: true });
    await vi.waitFor(async () => {
      expect((await t.api.queryTabs({ groupId })).at(-1)).toMatchObject({ discarded: true });
    });
  });

  it('reloads the waiting placeholders and discards them again once their icon is back', async () => {
    await restoredGroup();
    t.api.exit();
    await t.settle(); // the old service worker handles the closed windows first
    const reload = vi.spyOn(t.api, 'reloadTab');

    await t.restartBrowser();
    expect(waiting()).toHaveLength(2);

    await vi.waitFor(() => {
      expect(waiting().map((tab) => [tab.discarded, tab.hasIcon])).toEqual([
        [true, true],
        [true, true],
      ]);
    });
    expect(reload).toHaveBeenCalledTimes(2);
    // Still placeholders: no site was loaded, the links stay in the group.
    expect(waiting().map((tab) => tab.url)).toEqual([YT(2), YT(3)]);
    await t.settle();
    const group = single(await t.groups.listAll());
    expect((await t.tabs.listByGroup(group.id)).map((tab) => tab.url)).toEqual([
      YT(1),
      YT(2),
      YT(3),
    ]);
  });

  it('also refreshes placeholders Chrome restores shortly after the start', async () => {
    t.api.exit();
    await t.settle(); // the old service worker handles the closed windows first
    await t.restartBrowser();
    const reload = vi.spyOn(t.api, 'reloadTab');

    t.api.addTab({ url: 'https://example.com/' }); // the shown tab
    const late = t.api.addTab({ url: placeholder(7), discarded: true, hasIcon: false });
    await t.settle();
    t.now.value += ICON_REFRESH_WINDOW_MS;
    t.api.addTab({ url: placeholder(8), discarded: true, hasIcon: false }); // too late: a tab of this session
    await t.settle();

    await vi.waitFor(async () => {
      expect(await t.api.getTab(late.id)).toMatchObject({ discarded: true, hasIcon: true });
    });
    expect(reload.mock.calls.map(([tabId]) => tabId)).toEqual([late.id]);
  });

  it('leaves placeholders alone when the service worker merely wakes up', async () => {
    await restoredGroup();
    const reload = vi.spyOn(t.api, 'reloadTab');

    await t.bg.start(); // same browser session

    await t.settle();
    expect(reload).not.toHaveBeenCalled();
  });
});
