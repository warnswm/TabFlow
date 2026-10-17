import { describe, expect, it } from 'vitest';
import type { SavedTab, Space, TabGroup } from '../db/models';
import { emptyFilterText, filterGroups, stateCounts } from './filters';
import { buildOverview } from './overview';
import { buildPalette, labelMatches } from './palette';
import { applyOrder, moveId } from './reorder';
import { buildSearchIndex, highlight, matchesByGroup, normalizeText } from './search';

const T0 = Date.UTC(2026, 9, 17);

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

const tab = (id: string, groupId: string, url: string, title: string): SavedTab => ({
  id,
  groupId,
  url,
  title,
  order: 1,
  pinned: false,
  createdAt: T0,
  updatedAt: T0,
});

function sample() {
  return buildOverview(
    [
      space('inbox', 1, { isDefault: true, name: 'Входящие' }),
      space('work', 2, { name: 'Работа' }),
    ],
    [
      group('react', 'work', { title: 'Исследование React', order: 1 }),
      group('ext', 'work', { title: 'Chrome Extensions API', order: 2, state: 'asleep' }),
      group('evening', 'inbox', { title: 'Статьи на вечер', state: 'stowed' }),
    ],
    [
      tab('r1', 'react', 'https://react.dev/learn/hooks', 'useEffect – React'),
      tab('r2', 'react', 'https://github.com/facebook/react', 'facebook/react'),
      tab('e1', 'ext', 'https://developer.chrome.com/docs/extensions', 'Расширения Chrome'),
      tab('v1', 'evening', 'https://habr.com/ru/articles/1/', 'React 19 — что нового'),
      tab('v2', 'evening', 'https://example.com/elka', 'Ёлка и праздники'),
    ],
  );
}

describe('search', () => {
  it('finds groups by title and links by title, host and path, in all spaces', () => {
    const index = buildSearchIndex(sample());
    const hits = index.search('react');
    expect(hits?.groups.map((hit) => hit.groupId)).toEqual(['react']);
    expect(hits?.tabs.map((hit) => hit.tabId).sort()).toEqual(['r1', 'r2', 'v1']);

    expect(index.search('habr')?.tabs.map((hit) => hit.tabId)).toEqual(['v1']);
    expect(index.search('hooks')?.tabs.map((hit) => hit.tabId)).toEqual(['r1']);
  });

  it('matches word prefixes, small typos, any case and «ё» as «е»', () => {
    const index = buildSearchIndex(sample());
    expect(index.search('иссл')?.groups.map((hit) => hit.groupId)).toEqual(['react']);
    expect(index.search('extensoins')?.groups.map((hit) => hit.groupId)).toEqual(['ext']);
    expect(index.search('ЕЛКА')?.tabs.map((hit) => hit.tabId)).toEqual(['v2']);
    expect(normalizeText('Ёлка')).toBe('елка');
  });

  it('requires every word of the query and can be limited to one space', () => {
    const index = buildSearchIndex(sample());
    expect(index.search('react hooks')?.tabs.map((hit) => hit.tabId)).toEqual(['r1']);
    expect(index.search('react', 'inbox')?.tabs.map((hit) => hit.tabId)).toEqual(['v1']);
    expect(index.search('   ')).toBeUndefined();
  });

  it('collects matches per group: by title and by links', () => {
    const index = buildSearchIndex(sample());
    const hits = index.search('react', 'work');
    if (!hits) throw new Error('no hits');
    const matches = matchesByGroup(hits);
    expect(matches.get('react')).toEqual({ title: true, tabIds: new Set(['r1', 'r2']) });
    expect(matches.has('ext')).toBe(false);
  });
});

describe('highlight', () => {
  it('marks whole-word occurrences of matched words, ignoring case and «ё»', () => {
    expect(highlight('Исследование React', ['react'])).toEqual([
      { text: 'Исследование ', hit: false },
      { text: 'React', hit: true },
    ]);
    expect(highlight('Ёлка', ['елка'])).toEqual([{ text: 'Ёлка', hit: true }]);
    // «com» inside «become» is not a match of the word «com».
    expect(highlight('become.com', ['com'])).toEqual([
      { text: 'become.', hit: false },
      { text: 'com', hit: true },
    ]);
    expect(highlight('Без совпадений', [])).toEqual([{ text: 'Без совпадений', hit: false }]);
  });
});

describe('filters', () => {
  const views = () => sample().spaces[1]?.groups ?? [];

  it('filters by state and by the search, keeping the order', () => {
    expect(filterGroups(views(), 'asleep').map((v) => v.group.id)).toEqual(['ext']);
    const hits = buildSearchIndex(sample()).search('react', 'work');
    const matches = hits && matchesByGroup(hits);
    expect(filterGroups(views(), 'all', matches).map((v) => v.group.id)).toEqual(['react']);
    expect(filterGroups(views(), 'asleep', matches)).toEqual([]);
  });

  it('counts groups by state among the search results', () => {
    expect(stateCounts(views())).toEqual({ all: 2, active: 1, asleep: 1, stowed: 0 });
    const hits = buildSearchIndex(sample()).search('chrome', 'work');
    expect(stateCounts(views(), hits && matchesByGroup(hits))).toEqual({
      all: 1,
      active: 0,
      asleep: 1,
      stowed: 0,
    });
  });

  it('explains an empty result', () => {
    expect(emptyFilterText('all', ' qq ')).toBe('Ничего не найдено по запросу «qq».');
    expect(emptyFilterText('stowed', '')).toBe('Убранных групп нет.');
  });
});

describe('palette', () => {
  it('shows only actions for an empty query, without the current space', () => {
    const overview = sample();
    const palette = buildPalette(overview, buildSearchIndex(overview), '', 'work');
    expect(palette.groups).toEqual([]);
    expect(palette.actions.map((item) => item.label)).toEqual([
      'Свернуть всё',
      'Перейти в «Входящие»',
      'Корзина',
      'Новое пространство',
    ]);
  });

  it('finds groups and links everywhere and offers actions for the best group', () => {
    const overview = sample();
    const palette = buildPalette(overview, buildSearchIndex(overview), 'react', 'inbox');
    expect(palette.groups.map((item) => [item.group.id, item.space.name, item.tabCount])).toEqual([
      ['react', 'Работа', 2],
    ]);
    expect(palette.tabs.map((item) => item.tab.id).sort()).toEqual(['r1', 'r2', 'v1']);
    expect(palette.actions.map((item) => item.label)).toEqual([
      'Усыпить группу «Исследование React»',
      'Убрать группу «Исследование React» в TabFlow',
    ]);
    expect(palette.terms).toContain('react');
  });

  it('offers to bring back a stowed group and filters fixed actions by word prefixes', () => {
    const overview = sample();
    const index = buildSearchIndex(overview);
    expect(buildPalette(overview, index, 'вечер').actions.map((item) => item.label)).toEqual([
      'Вернуть группу «Статьи на вечер» на панель',
    ]);
    expect(buildPalette(overview, index, 'пер раб').actions.map((item) => item.label)).toEqual([
      'Перейти в «Работа»',
    ]);
    expect(labelMatches('Свернуть всё', 'свер')).toBe(true);
    expect(labelMatches('Свернуть всё', 'корз')).toBe(false);
  });
});

describe('reorder after a drop', () => {
  it('moves an id to the place of another one', () => {
    expect(moveId(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
    expect(moveId(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
    expect(moveId(['a', 'b'], 'a', 'x')).toEqual(['a', 'b']);
  });

  it('orders items by ids, tolerating items added or removed meanwhile', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'new' }];
    expect(applyOrder(items, ['c', 'gone', 'a', 'b'], (item) => item.id)).toEqual([
      { id: 'c' },
      { id: 'a' },
      { id: 'b' },
      { id: 'new' },
    ]);
  });
});
