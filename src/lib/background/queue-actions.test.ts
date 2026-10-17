import { beforeEach, describe, expect, it } from 'vitest';
import type { Command, VideoReport } from '../messages';
import {
  type BackgroundTestContext,
  expectOk,
  setupBackground,
  single,
} from '../testing/background';

const ID = 'dQw4w9WgXcQ';
const WATCH = `https://www.youtube.com/watch?v=${ID}`;
const LECTURE = 'https://lektorium.tv/lecture/42';

describe('video queue', () => {
  let t: BackgroundTestContext;

  beforeEach(async () => {
    t = setupBackground();
    await t.bg.start();
  });

  async function run(command: Command) {
    return expectOk(await t.command(command));
  }

  async function queued() {
    return t.queue.list('queued');
  }

  /** A page with TabFlow's content script: answers report requests with its video. */
  function videoPages(report: VideoReport) {
    t.api.videoPage = (tabId) =>
      void t.bg.handleMessage({ type: 'videoProgress', ...report }, { kind: 'content', tabId });
  }

  describe('adding', () => {
    it('adds the tab and leaves it open', async () => {
      const tab = t.api.addTab({ url: WATCH, title: '(2) Как устроены вкладки - YouTube' });

      const result = await run({ type: 'queueTab', chromeTabId: tab.id });

      expect(result.video).toEqual({
        itemId: expect.any(String),
        title: 'Как устроены вкладки',
        priority: 1,
        created: true,
      });
      const item = single(await queued());
      expect(item).toMatchObject({ url: WATCH, site: 'youtube.com', videoId: ID, positionSec: 0 });
      expect(t.api.allTabs().map((open) => open.id)).toEqual([tab.id]);
      expect(t.api.videoReportRequests).toEqual([tab.id]);
    });

    it('takes the active tab by default and puts a tab of a group in the queue as it is', async () => {
      const { groupId } = t.api.addGroup('Учёба', 'green', [{ url: WATCH, active: true }]);
      await t.settle();

      await run({ type: 'queueTab' });

      expect(single(await queued()).url).toBe(WATCH);
      const group = single(await t.groups.listAll());
      expect(group.chromeGroupId).toBe(groupId);
      expect(await t.tabs.listByGroup(group.id)).toHaveLength(1);
    });

    it('reads the duration from the page right away when the site is allowed', async () => {
      videoPages({ positionSec: 95, durationSec: 1122, channel: 'Chromium' });
      const tab = t.api.addTab({ url: WATCH, title: 'Вкладки' });

      await run({ type: 'queueTab', chromeTabId: tab.id });

      expect(single(await queued())).toMatchObject({
        durationSec: 1122,
        positionSec: 95,
        channel: 'Chromium',
      });
    });

    it('does not add a video twice, even by another address', async () => {
      const first = t.api.addTab({ url: `${WATCH}&t=40s` });
      const second = t.api.addTab({ url: `https://youtu.be/${ID}` });
      await run({ type: 'queueTab', chromeTabId: first.id });

      const again = await run({ type: 'queueTab', chromeTabId: second.id });

      expect(again.video).toMatchObject({ priority: 1, created: false });
      expect(await queued()).toHaveLength(1);
    });

    it('adds pinned tabs, but not browser pages', async () => {
      const pinned = t.api.addTab({ url: LECTURE, pinned: true });
      const settings = t.api.addTab({ url: 'chrome://settings/' });

      await run({ type: 'queueTab', chromeTabId: pinned.id });
      const refused = await t.command({ type: 'queueTab', chromeTabId: settings.id });

      expect(refused).toMatchObject({ ok: false, code: 'page-not-queueable' });
      expect((await queued()).map((item) => item.site)).toEqual(['lektorium.tv']);
    });

    it('adds a link without opening it; the title comes when the page is opened', async () => {
      const result = await run({ type: 'queueLink', url: LECTURE });

      expect(result.video).toMatchObject({ title: LECTURE, priority: 1, created: true });
      expect(t.api.allTabs()).toEqual([]);

      const tab = t.api.addTab({ url: LECTURE });
      await t.report(tab.id, { positionSec: 0, durationSec: 3000, title: 'Лекция 42' });
      expect(single(await queued())).toMatchObject({ title: 'Лекция 42', durationSec: 3000 });
    });

    it('shows the videos for today on the badge', async () => {
      for (const name of ['a', 'b', 'c', 'd']) {
        await run({ type: 'queueLink', url: `https://${name}.example/v` });
      }
      expect(t.ui.badge.text).toBe('3');
      expect(t.ui.badge.title.split('\n')[1]).toBe('На сегодня: 3 видео');

      t.settings.mode = 'queue';
      await t.bg.refreshUi();
      expect(t.ui.badge.text).toBe('4');
    });
  });

  describe('the queue', () => {
    async function addLinks(...names: string[]) {
      for (const name of names) await run({ type: 'queueLink', url: `https://${name}.example/v` });
      return queued();
    }

    it('opens a video in a new tab, or shows the tab that plays it', async () => {
      const [item] = await addLinks('a');
      if (!item) throw new Error('No item');
      const other = t.api.addTab({ url: 'https://news.example/' });

      await run({ type: 'openVideo', itemId: item.id });
      const opened = single(t.api.allTabs().filter((tab) => tab.url === item.url));
      expect(opened.active).toBe(true);

      await t.api.activateTab(other.id);
      await run({ type: 'openVideo', itemId: item.id });
      const again = single(t.api.allTabs().filter((tab) => tab.url === item.url));
      expect(again).toMatchObject({ id: opened.id, active: true });
    });

    it('changes the priority', async () => {
      const [a, b, c] = await addLinks('a', 'b', 'c');
      if (!a || !b || !c) throw new Error('No items');

      const result = await run({ type: 'moveVideo', itemId: c.id, index: 0 });

      expect(result.video?.priority).toBe(1);
      expect((await queued()).map((item) => item.id)).toEqual([c.id, a.id, b.id]);
    });

    it('moves a watched video out of the queue; undo puts it back to its place', async () => {
      const [a, b, c] = await addLinks('a', 'b', 'c');
      if (!a || !b || !c) throw new Error('No items');

      const watched = await run({ type: 'setWatched', itemId: b.id, watched: true });
      expect(watched.video).toMatchObject({ priority: 0, wasPriority: 2 });
      expect((await queued()).map((item) => item.id)).toEqual([a.id, c.id]);

      await run({ type: 'setWatched', itemId: b.id, watched: false });
      await run({ type: 'moveVideo', itemId: b.id, index: 1 });
      expect((await queued()).map((item) => item.id)).toEqual([a.id, b.id, c.id]);
    });

    it('removes a video and brings it back', async () => {
      const [a, b] = await addLinks('a', 'b');
      if (!a || !b) throw new Error('No items');

      await run({ type: 'removeVideo', itemId: a.id });
      expect((await queued()).map((item) => item.id)).toEqual([b.id]);
      expect((await t.trash.list()).queue.map((item) => item.id)).toEqual([a.id]);

      const restored = await run({ type: 'restoreVideo', itemId: a.id });
      expect(restored.video?.priority).toBe(1);
      expect(await t.command({ type: 'restoreVideo', itemId: a.id })).toMatchObject({
        ok: false,
        code: 'video-not-found',
      });
    });
  });

  describe('reports of video pages', () => {
    async function queuedTab(url = WATCH) {
      const tab = t.api.addTab({ url });
      await run({ type: 'queueTab', chromeTabId: tab.id });
      return tab;
    }

    async function item() {
      return single(await t.queue.list('queued'));
    }

    it('are accepted from content scripts only, and they may only report', async () => {
      const tab = await queuedTab();

      const fromPage = await t.command({
        type: 'videoProgress',
        positionSec: 10,
        durationSec: 100,
      });
      const otherCommand = await t.bg.handleMessage(
        { type: 'collapseAll' },
        { kind: 'content', tabId: tab.id },
      );

      expect(fromPage).toMatchObject({ ok: false, code: 'invalid-command' });
      expect(otherCommand).toMatchObject({ ok: false, code: 'invalid-command' });
      expect((await item()).durationSec).toBeUndefined();
    });

    it('keep the position of a queued video and ignore other videos', async () => {
      const tab = await queuedTab();
      const other = t.api.addTab({ url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' });

      expectOk(await t.report(tab.id, { positionSec: 300.4, durationSec: 1122 }));
      expectOk(await t.report(other.id, { positionSec: 50, durationSec: 600 }));

      expect(await item()).toMatchObject({ positionSec: 300, durationSec: 1122 });
      expect(await t.queue.list('queued')).toHaveLength(1);
    });

    it('continue a video opened again from the saved place', async () => {
      const tab = await queuedTab();
      await t.report(tab.id, { positionSec: 300, durationSec: 1122 });

      const reopened = expectOk(
        await t.report(tab.id, { positionSec: 0, durationSec: 1122, loaded: true }),
      );

      expect(reopened.seekToSec).toBe(300);
      expect((await item()).positionSec).toBe(300);
      // Watched further: the new position is kept.
      expectOk(await t.report(tab.id, { positionSec: 2, durationSec: 1122 }));
      expect((await item()).positionSec).toBe(2);
    });

    it('mark the video watched at its end', async () => {
      const tab = await queuedTab();
      await t.report(tab.id, { positionSec: 1100, durationSec: 1122 });
      expect(await t.queue.list('queued')).toEqual([]);
      expect(single(await t.queue.list('watched')).url).toBe(WATCH);

      const lecture = await queuedTab(LECTURE);
      await t.report(lecture.id, { positionSec: 10, durationSec: 3000, ended: true });
      expect(await t.queue.list('queued')).toEqual([]);
    });

    it('keep the players of a page without its own video until the duration is known', async () => {
      const tab = await queuedTab(LECTURE);

      await t.report(tab.id, { positionSec: 0, playerOrigins: ['https://player.vimeo.com'] });
      expect(await item()).toMatchObject({
        playerOrigins: ['https://player.vimeo.com'],
        positionSec: 0,
      });

      await t.report(tab.id, { positionSec: 30, durationSec: 3000 });
      const known = await item();
      expect(known.playerOrigins).toBeUndefined();
      expect(known).toMatchObject({ positionSec: 30, durationSec: 3000 });
    });
  });
});
