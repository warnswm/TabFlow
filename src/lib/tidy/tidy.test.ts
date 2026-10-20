import { describe, expect, it } from 'vitest';
import { type BrowserTab, NO_GROUP } from '../browser-api';
import type { SavedTab, TabGroup } from '../db/models';
import { AI_MAX_TABS, aiPrompt, readAiAnswer } from './ai-grouping';
import { autoSleepTargets, onSites, parseSiteList } from './auto-sleep';
import { duplicateCounts, findDuplicates } from './duplicates';
import {
  colorOf,
  parseTopicRules,
  planGrouping,
  sitePlacer,
  topicPlacer,
  type GroupingTab,
} from './grouping';

const NOW = Date.UTC(2026, 9, 20, 12);
const MIN = 60_000;

function tab(id: number, patch: Partial<BrowserTab> = {}): BrowserTab {
  return {
    id,
    windowId: 1,
    index: id,
    url: `https://site${id}.example/`,
    committed: true,
    loaded: true,
    hasIcon: true,
    placeholder: false,
    title: `Tab ${id}`,
    pinned: false,
    active: false,
    highlighted: false,
    discarded: false,
    groupId: NO_GROUP,
    lastAccessed: NOW - 60 * MIN,
    audible: false,
    autoDiscardable: true,
    ...patch,
  };
}

function group(id: string, patch: Partial<TabGroup> = {}): TabGroup {
  return {
    id,
    spaceId: 'inbox',
    title: id,
    color: 'blue',
    state: 'active',
    order: 1,
    createdAt: NOW - 600 * MIN,
    updatedAt: NOW - 600 * MIN,
    stateChangedAt: NOW - 600 * MIN,
    ...patch,
  };
}

function link(id: string, groupId: string, url: string, patch: Partial<SavedTab> = {}): SavedTab {
  return {
    id,
    groupId,
    url,
    title: id,
    order: 1,
    pinned: false,
    createdAt: NOW - 100 * MIN,
    updatedAt: NOW - 100 * MIN,
    ...patch,
  };
}

describe('autosleep rules', () => {
  const settings = { minutes: 30 as const, sites: [] };

  it('puts to sleep a group unused for the threshold, not a fresher one', () => {
    const groups = [group('old', { chromeGroupId: 10 }), group('fresh', { chromeGroupId: 20 })];
    const tabs = [
      tab(1, { groupId: 10 }),
      tab(2, { groupId: 10, lastAccessed: NOW - 31 * MIN }),
      tab(3, { groupId: 20, lastAccessed: NOW - 29 * MIN }),
      tab(4, { active: true }),
    ];
    expect(autoSleepTargets(groups, tabs, NOW, settings)).toEqual([
      { groupId: 'old', tabIds: [1, 2] },
    ]);
  });

  it('is off at 0 minutes', () => {
    const tabs = [tab(1, { groupId: 10 })];
    const groups = [group('a', { chromeGroupId: 10 })];
    expect(autoSleepTargets(groups, tabs, NOW, { minutes: 0, sites: [] })).toEqual([]);
  });

  it('leaves alone a group on screen, kept awake, asleep or stowed', () => {
    const groups = [
      group('shown', { chromeGroupId: 10 }),
      group('kept', { chromeGroupId: 20, keepAwake: true }),
      group('asleep', { chromeGroupId: 30, state: 'asleep' }),
      group('stowed', { state: 'stowed' }),
    ];
    const tabs = [
      tab(1, { groupId: 10, active: true }),
      tab(2, { groupId: 10 }),
      tab(3, { groupId: 20 }),
      tab(4, { groupId: 30 }),
    ];
    expect(autoSleepTargets(groups, tabs, NOW, settings)).toEqual([]);
  });

  it('counts a group just woken up or made as used', () => {
    const groups = [
      group('woken', { chromeGroupId: 10, stateChangedAt: NOW - 5 * MIN }),
      group('new', { chromeGroupId: 20, createdAt: NOW - 5 * MIN }),
    ];
    const tabs = [tab(1, { groupId: 10 }), tab(2, { groupId: 20 })];
    expect(autoSleepTargets(groups, tabs, NOW, settings)).toEqual([]);
  });

  it('keeps tabs with sound, of listed sites, not unloadable or still opening awake', () => {
    const groups = [group('mixed', { chromeGroupId: 10 })];
    const tabs = [
      tab(1, { groupId: 10 }),
      tab(2, { groupId: 10, audible: true }),
      tab(3, { groupId: 10, url: 'https://music.yandex.ru/album/1' }),
      tab(4, { groupId: 10, autoDiscardable: false }),
      tab(5, { groupId: 10, committed: false }),
      tab(6, { groupId: 10, discarded: true }),
      tab(7, { groupId: 10, url: 'chrome://settings' }),
    ];
    expect(autoSleepTargets(groups, tabs, NOW, { minutes: 30, sites: ['yandex.ru'] })).toEqual([
      { groupId: 'mixed', tabIds: [1] },
    ]);
  });

  it('reads the list of sites as typed', () => {
    expect(
      parseSiteList(
        'https://www.Music.Yandex.ru/album/1\nweb.telegram.org, *.slack.com;  \n  not a site  ',
      ),
    ).toEqual(['music.yandex.ru', 'web.telegram.org', 'slack.com', 'not', 'a', 'site']);
    expect(parseSiteList('youtube.com youtube.com')).toEqual(['youtube.com']);
    expect(onSites('https://www.youtube.com/watch?v=1', ['youtube.com'])).toBe(true);
    expect(onSites('https://notyoutube.com/', ['youtube.com'])).toBe(false);
  });
});

describe('duplicates', () => {
  it('keeps the tab on screen and closes the other copies of a page', () => {
    const tabs = [
      tab(1, { url: 'https://a.example/doc?utm_source=x' }),
      tab(2, { url: 'https://a.example/doc', active: true }),
      tab(3, { url: 'http://www.a.example/doc#part', windowId: 2 }),
      tab(4, { url: 'https://b.example/' }),
    ];
    const found = findDuplicates(tabs, [], []);
    expect(found.tabs).toHaveLength(1);
    const [set] = found.tabs;
    expect(set?.keep).toMatchObject({ kind: 'tab', chromeTabId: 2 });
    expect(set?.extras.map((item) => item.kind === 'tab' && item.chromeTabId)).toEqual([1, 3]);
    expect(duplicateCounts(found)).toEqual({ tabs: 2, links: 0 });
  });

  it('never closes pinned or shown tabs; keeps a TabFlow link before a loose tab', () => {
    const groups = [group('g', { chromeGroupId: 10 })];
    const links = [link('l1', 'g', 'https://a.example/', { chromeTabId: 2 })];
    const tabs = [
      tab(1, { url: 'https://a.example/', lastAccessed: NOW }),
      tab(2, { url: 'https://a.example/', groupId: 10 }),
      tab(3, { url: 'https://a.example/', pinned: true }),
      tab(4, { url: 'https://a.example/', active: true, windowId: 2 }),
    ];
    const [set] = findDuplicates(tabs, groups, links).tabs;
    // The tab on screen stays; the pinned one too; the link is a duplicate of it.
    expect(set?.keep).toMatchObject({ chromeTabId: 4 });
    expect(set?.extras.map((item) => item.kind === 'tab' && item.chromeTabId)).toEqual([2, 1]);
    expect(set?.extras[0]).toMatchObject({ link: { linkId: 'l1', groupTitle: 'g' } });
  });

  it('keeps the copy further into a YouTube video', () => {
    const tabs = [
      tab(1, { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', lastAccessed: NOW }),
      tab(2, { url: 'https://youtu.be/dQw4w9WgXcQ?t=600' }),
    ];
    const [set] = findDuplicates(tabs, [], []).tabs;
    expect(set?.key).toBe('tab:youtube:dQw4w9WgXcQ');
    expect(set?.keep).toMatchObject({ chromeTabId: 2 });
  });

  it('finds the same link in several groups; keeps the open one, else the oldest', () => {
    const groups = [
      group('open', { chromeGroupId: 10 }),
      group('a', { state: 'stowed' }),
      group('b', { state: 'stowed' }),
    ];
    const links = [
      link('x-open', 'open', 'https://x.example/', { chromeTabId: 1 }),
      link('x-a', 'a', 'https://x.example/#top'),
      link('y-old', 'a', 'https://y.example/', { createdAt: NOW - 500 * MIN }),
      link('y-new', 'b', 'https://y.example/?utm_medium=mail'),
      link('z', 'b', 'https://z.example/'),
      link('gone', 'deleted', 'https://z.example/'),
    ];
    const found = findDuplicates(
      [tab(1, { url: 'https://x.example/', groupId: 10 })],
      groups,
      links,
    );
    expect(found.tabs).toEqual([]);
    expect(
      found.links.map((set) => [
        set.keep.kind === 'link' && set.keep.linkId,
        set.extras.map((item) => item.kind === 'link' && item.linkId),
      ]),
    ).toEqual([
      ['x-open', ['x-a']],
      ['y-old', ['y-new']],
    ]);
  });
});

describe('grouping', () => {
  const tabs: GroupingTab[] = [
    { id: 1, url: 'https://github.com/a/b', title: 'a/b' },
    { id: 2, url: 'https://stackoverflow.com/q/1', title: 'How to' },
    { id: 3, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Song' },
    { id: 4, url: 'https://rutube.ru/video/1', title: 'Видео' },
    { id: 5, url: 'https://unknown.example/1', title: 'Рецепт борща' },
    { id: 6, url: 'https://blog.example.com/1', title: 'Post' },
    { id: 7, url: 'https://news.example.com/2', title: 'Other post' },
    { id: 8, url: 'https://lonely.example/', title: 'Nothing' },
  ];

  it('sorts tabs by topic: the dictionary, then the site; single tabs stay', () => {
    const plan = planGrouping(tabs, [], topicPlacer([], 'ru'));
    expect(plan.map((g) => [g.title, g.color, g.tabIds])).toEqual([
      ['example.com', colorOf('example.com'), [6, 7]],
      ['Видео', 'red', [3, 4]],
      ['Разработка', 'blue', [1, 2]],
    ]);
  });

  it('names topics in the language of the interface', () => {
    const plan = planGrouping(tabs, [], topicPlacer([], 'en'));
    expect(plan.map((g) => g.title)).toContain('Development');
  });

  it('puts own topics first and joins a group of the same title', () => {
    const rules = parseTopicRules('Работа: github.com, рецепт\n:bad\nПусто:  \nЕщё: rutube');
    expect(rules).toEqual([
      { name: 'Работа', terms: ['github.com', 'рецепт'] },
      { name: 'Ещё', terms: ['rutube'] },
    ]);
    const plan = planGrouping(
      tabs,
      [{ id: 50, title: 'работа ', color: 'yellow' }],
      topicPlacer(rules, 'ru'),
    );
    expect(plan.find((g) => g.joinChromeGroupId === 50)).toEqual({
      title: 'работа ',
      color: 'yellow',
      tabIds: [1, 5],
      joinChromeGroupId: 50,
    });
    // Own topics come before the dictionary: rutube is «Ещё» (alone — stays), YouTube is alone.
    expect(plan.flatMap((g) => g.tabIds)).not.toContain(4);
    expect(plan.map((g) => g.title)).not.toContain('Видео');
  });

  it('sorts tabs by site', () => {
    const plan = planGrouping(
      [...tabs, { id: 9, url: 'https://gist.github.com/1', title: 'Gist' }],
      [],
      sitePlacer('ru'),
    );
    expect(plan.map((g) => [g.title, g.tabIds])).toEqual([
      ['example.com', [6, 7]],
      ['github.com', [1, 9]],
    ]);
  });

  it('reads the answer of Gemini Nano; nonsense is dropped', () => {
    const prompt = aiPrompt(tabs, 'ru');
    expect(prompt).toContain('in Russian');
    expect(prompt).toContain('1. a/b — github.com');
    const placements = readAiAnswer(
      JSON.stringify({
        groups: [
          { name: ' Видео ', tabs: [3, 4, 4] },
          { name: 'Код', tabs: [1, 2, 99] },
          { name: 'Один', tabs: [8] },
          { name: '', tabs: [5, 6] },
          { name: 'Повтор', tabs: [3, 4] },
        ],
      }),
      tabs,
    );
    expect([...placements].map(([id, place]) => [id, place.title, place.color])).toEqual([
      [3, 'Видео', 'red'],
      [4, 'Видео', 'red'],
      [1, 'Код', colorOf('Код')],
      [2, 'Код', colorOf('Код')],
    ]);
    expect(readAiAnswer('not json', tabs).size).toBe(0);
    expect(readAiAnswer('{"groups": 5}', tabs).size).toBe(0);
  });

  it('sends at most a limited number of tabs to the model', () => {
    const many = Array.from({ length: AI_MAX_TABS + 5 }, (_, i) => ({
      id: i,
      url: `https://s${i}.example/`,
      title: `T${i}`,
    }));
    expect(
      aiPrompt(many, 'en')
        .split('\n')
        .filter((line) => /^\d+\./.test(line)),
    ).toHaveLength(AI_MAX_TABS);
  });
});
