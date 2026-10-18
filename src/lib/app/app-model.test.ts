import { describe, expect, it } from 'vitest';
import type { SavedTab, Space, TabGroup } from '../db/models';
import { TRASH_RETENTION_MS } from '../db/repositories/trash';
import type { CommandResult } from '../messages';
import { buildOverview, displayHost } from './overview';
import { parseRoute, type Route, routeHash } from './route';
import { daysLeft, DAY_MS, shortDate, timeAgo } from './time-format';
import { buildTrashView, groupTrashedTabs } from './trash-view';
import { undoCommands } from './undo';
import { youtubeThumbnailUrl, youtubeVideoId } from './youtube';

const T0 = new Date(2026, 9, 17, 15, 30).getTime(); // 17 Oct 2026, 15:30 local time

const space = (id: string, order: number, extra: Partial<Space> = {}): Space => ({
  id,
  name: id,
  order,
  isDefault: false,
  createdAt: T0,
  updatedAt: T0,
  ...extra,
});

const group = (id: string, spaceId: string, extra: Partial<TabGroup> = {}): TabGroup => ({
  id,
  spaceId,
  title: id,
  color: 'blue',
  state: 'active',
  order: 1,
  createdAt: T0,
  updatedAt: T0,
  ...extra,
});

const tab = (id: string, groupId: string, extra: Partial<SavedTab> = {}): SavedTab => ({
  id,
  groupId,
  url: `https://example.com/${id}`,
  title: id,
  order: 1,
  pinned: false,
  createdAt: T0,
  updatedAt: T0,
  ...extra,
});

describe('overview', () => {
  it('puts «Входящие» first and groups and links in their order', () => {
    const overview = buildOverview(
      [space('work', 1), space('inbox', 2, { isDefault: true })],
      [
        group('b', 'work', { order: 2, state: 'stowed' }),
        group('a', 'work', { order: 1, state: 'asleep' }),
        group('c', 'inbox'),
      ],
      [tab('a2', 'a', { order: 2 }), tab('a1', 'a', { order: 1 }), tab('b1', 'b'), tab('c1', 'c')],
    );

    expect(overview.spaces.map((view) => view.space.id)).toEqual(['inbox', 'work']);
    const work = overview.spaces[1];
    expect(work?.groups.map((view) => view.group.id)).toEqual(['a', 'b']);
    expect(work?.groups[0]?.tabs.map((t) => t.id)).toEqual(['a1', 'a2']);
    expect(work?.tabCount).toBe(3);
    expect(overview.groupsByState).toEqual({ active: 1, asleep: 1, stowed: 1 });
    expect(overview.tabsOutOfMemory).toBe(3);
    expect(overview.tabCount).toBe(4);
  });

  it('shows a group of a missing space in «Входящие»', () => {
    const overview = buildOverview(
      [space('inbox', 1, { isDefault: true })],
      [group('lost', 'gone')],
      [],
    );
    expect(overview.spaces[0]?.groups.map((view) => view.group.id)).toEqual(['lost']);
  });

  it('shows hosts without www', () => {
    expect(displayHost('https://www.youtube.com/watch?v=1')).toBe('youtube.com');
    expect(displayHost('file:///C:/notes.txt')).toBe('файл');
  });
});

describe('trashed links by group', () => {
  it('groups lone links and restores them in the group order', () => {
    const trash = {
      spaces: [],
      groups: [],
      tabs: [
        tab('b3', 'study', { order: 3, deletedAt: T0 }),
        tab('s1', 'shop', { order: 1, deletedAt: T0 - 1 }),
        tab('b1', 'study', { order: 1, deletedAt: T0 - 2 }),
        tab('b2', 'study', { order: 2, deletedAt: T0 - 3 }),
      ],
      queue: [],
    };
    const view = buildTrashView(trash, [
      group('study', 'inbox', { title: 'Учёба' }),
      group('shop', 'inbox', { title: 'Покупки' }),
    ]);

    const groups = groupTrashedTabs(view.tabs);

    expect(groups.map((g) => [g.groupTitle, g.tabs.length, g.restoreOrder])).toEqual([
      ['Учёба', 3, ['b1', 'b2', 'b3']],
      ['Покупки', 1, ['s1']],
    ]);
  });
});

describe('trash view', () => {
  it('shows things deleted together once, and lone links with their group', () => {
    const deletedAt = T0 - DAY_MS;
    const trash = {
      spaces: [space('work', 1, { deletedAt })],
      groups: [
        group('with-space', 'work', { deletedAt }),
        group('alone', 'inbox', { deletedAt: T0 - 2 * DAY_MS }),
      ],
      tabs: [
        tab('t1', 'with-space', { deletedAt }),
        tab('t2', 'with-space', { deletedAt }),
        tab('t3', 'alone', { deletedAt: T0 - 2 * DAY_MS }),
        tab('closed', 'live', { deletedAt: T0 }),
      ],
      queue: [],
    };

    const view = buildTrashView(trash, [group('live', 'inbox', { title: 'Покупки' })]);

    expect(view.spaces).toEqual([
      expect.objectContaining({
        groups: 1,
        tabs: 2,
        deletedAt,
        expiresAt: deletedAt + TRASH_RETENTION_MS,
      }),
    ]);
    expect(view.groups.map((g) => [g.record.id, g.tabs])).toEqual([['alone', 1]]);
    expect(view.tabs.map((t) => [t.record.id, t.groupTitle])).toEqual([['closed', 'Покупки']]);
    expect(view.isEmpty).toBe(false);
  });

  it('is empty without deleted records', () => {
    expect(buildTrashView({ spaces: [], groups: [], tabs: [], queue: [] }, []).isEmpty).toBe(true);
  });
});

describe('undo', () => {
  const result = (partial: Partial<CommandResult> = {}): CommandResult => ({
    groups: 1,
    tabs: 3,
    failed: 0,
    closedGroupIds: [],
    ...partial,
  });

  it('reopens stowed and collapsed groups', () => {
    expect(
      undoCommands(
        { type: 'collapseAll' },
        result({ closedGroupIds: ['g1', 'g2'] }),
        'placeholder',
      ),
    ).toEqual([
      { type: 'restoreGroup', groupId: 'g1', mode: 'placeholder' },
      { type: 'restoreGroup', groupId: 'g2', mode: 'placeholder' },
    ]);
    expect(undoCommands({ type: 'collapseAll' }, result({ groups: 0 }), 'placeholder')).toBe(
      undefined,
    );
  });

  it('brings deleted things back and reopens what the delete closed', () => {
    expect(
      undoCommands(
        { type: 'deleteGroup', groupId: 'g1' },
        result({ closedGroupIds: ['g1'] }),
        'background',
      ),
    ).toEqual([
      {
        type: 'restoreDeleted',
        kind: 'group',
        id: 'g1',
        reopenGroupIds: ['g1'],
        mode: 'background',
      },
    ]);
    expect(
      undoCommands({ type: 'deleteSpace', spaceId: 's1' }, result(), 'placeholder')?.[0],
    ).toMatchObject({ kind: 'space', id: 's1', reopenGroupIds: [] });
    expect(
      undoCommands({ type: 'deleteTab', tabId: 't1' }, result({ groups: 0 }), 'placeholder')?.[0],
    ).toMatchObject({ kind: 'tab', id: 't1' });
  });

  it('takes back what the queue commands did', () => {
    const video = (created: boolean, wasPriority?: number) =>
      result({ video: { itemId: 'v1', title: 'Видео', priority: 0, created, wasPriority } });
    expect(undoCommands({ type: 'queueTab' }, video(true), 'placeholder')).toEqual([
      { type: 'removeVideo', itemId: 'v1' },
    ]);
    expect(undoCommands({ type: 'queueTab' }, video(false), 'placeholder')).toBeUndefined();
    expect(
      undoCommands({ type: 'removeVideo', itemId: 'v1' }, video(false), 'placeholder'),
    ).toEqual([{ type: 'restoreVideo', itemId: 'v1' }]);
    expect(
      undoCommands(
        { type: 'setWatched', itemId: 'v1', watched: true },
        video(false, 3),
        'placeholder',
      ),
    ).toEqual([
      { type: 'setWatched', itemId: 'v1', watched: false },
      { type: 'moveVideo', itemId: 'v1', index: 2 },
    ]);
    expect(
      undoCommands(
        { type: 'setWatched', itemId: 'v1', watched: false },
        video(false),
        'placeholder',
      ),
    ).toBeUndefined();
  });

  it('has nothing to undo for sleep, restore and edits', () => {
    expect(undoCommands({ type: 'sleepGroup', groupId: 'g1' }, result(), 'placeholder')).toBe(
      undefined,
    );
    expect(undoCommands({ type: 'restoreGroup', groupId: 'g1' }, result(), 'placeholder')).toBe(
      undefined,
    );
  });
});

describe('route', () => {
  it('reads and writes the hash', () => {
    expect(parseRoute('')).toEqual({ view: 'space' });
    expect(parseRoute('#/trash')).toEqual({ view: 'trash' });
    expect(parseRoute('#/settings')).toEqual({ view: 'settings' });
    expect(routeHash({ view: 'settings' })).toBe('#/settings');
    expect(parseRoute('#/space/a%2Fb')).toEqual({ view: 'space', spaceId: 'a/b' });
    expect(routeHash({ view: 'space', spaceId: 'a/b' })).toBe('#/space/a%2Fb');
    expect(routeHash({ view: 'space' })).toBe('#/');
    expect(parseRoute(routeHash({ view: 'trash' }))).toEqual({ view: 'trash' });
  });

  it('keeps the links of «Рядом» and a saved layout in the hash', () => {
    const side: Route = { view: 'side', items: ['a', 'b/c'] };
    expect(routeHash(side)).toBe('#/side/a,b%2Fc');
    expect(parseRoute(routeHash(side))).toEqual(side);
    // An open tab is kept by its address: commas and slashes are encoded.
    const page: Route = { view: 'side', items: ['a', 'u:https://x.example/a,b?c=1#d'] };
    expect(parseRoute(routeHash(page))).toEqual(page);
    expect(parseRoute('#/side/a,a,b,c,d,e,f,g,h,i,j')).toEqual({
      view: 'side',
      items: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
    });
    expect(parseRoute('#/side/')).toEqual({ view: 'space' });
    expect(parseRoute(routeHash({ view: 'layout', layoutId: 'x' }))).toEqual({
      view: 'layout',
      layoutId: 'x',
    });
  });
});

describe('time format', () => {
  it('says how long ago in calendar terms', () => {
    expect(timeAgo(T0 - 20_000, T0)).toBe('только что');
    expect(timeAgo(T0 - 5 * 60_000, T0)).toBe('5 мин назад');
    expect(timeAgo(T0 - 2 * 3_600_000, T0)).toBe('2 ч назад');
    expect(timeAgo(new Date(2026, 9, 16, 23, 0).getTime(), T0)).toBe('вчера');
    expect(timeAgo(T0 - 3 * DAY_MS, T0)).toBe('3 дня назад');
    expect(timeAgo(T0 - 5 * DAY_MS, T0)).toBe('5 дней назад');
    expect(timeAgo(new Date(2026, 9, 2).getTime(), T0)).toBe('2 окт');
    expect(shortDate(new Date(2025, 11, 31).getTime(), T0)).toBe('31 дек 2025');
  });

  it('counts the days left in the trash', () => {
    expect(daysLeft(T0 + 27 * DAY_MS - 1000, T0)).toBe(27);
    expect(daysLeft(T0 - 1, T0)).toBe(0);
  });
});

describe('youtube', () => {
  it('finds the video id in the usual links', () => {
    const id = 'dQw4w9WgXcQ';
    expect(youtubeVideoId(`https://www.youtube.com/watch?v=${id}&t=30`)).toBe(id);
    expect(youtubeVideoId(`https://m.youtube.com/watch?v=${id}`)).toBe(id);
    expect(youtubeVideoId(`https://youtu.be/${id}?si=x`)).toBe(id);
    expect(youtubeVideoId(`https://www.youtube.com/shorts/${id}`)).toBe(id);
    expect(youtubeThumbnailUrl(id)).toBe(`https://i.ytimg.com/vi/${id}/mqdefault.jpg`);
  });

  it('ignores other links', () => {
    expect(youtubeVideoId('https://www.youtube.com/feed/subscriptions')).toBeUndefined();
    expect(youtubeVideoId('https://www.youtube.com/watch?v=short')).toBeUndefined();
    expect(youtubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeUndefined();
    expect(youtubeVideoId('not a url')).toBeUndefined();
  });
});
