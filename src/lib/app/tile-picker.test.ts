import { describe, expect, it } from 'vitest';
import type { SavedTab, Space, TabGroup } from '../db/models';
import { buildOverview } from './overview';
import { buildSearchIndex } from './search';
import {
  defaultLayoutName,
  layoutPanes,
  openPages,
  type PageTab,
  pageKey,
  pickedItems,
  pickerGroups,
  togglePick,
  toLayoutLinks,
} from './tile-picker';

const T0 = new Date(2026, 9, 17, 15, 30).getTime();

const space: Space = {
  id: 's',
  name: 'Входящие',
  order: 1,
  isDefault: true,
  createdAt: T0,
  updatedAt: T0,
};

const group = (id: string, title: string, order: number): TabGroup => ({
  id,
  spaceId: 's',
  title,
  color: 'blue',
  state: 'stowed',
  order,
  createdAt: T0,
  updatedAt: T0,
});

const tab = (id: string, groupId: string, title: string, order: number): SavedTab => ({
  id,
  groupId,
  url: `https://${id}.example/`,
  title,
  order,
  pinned: false,
  createdAt: T0,
  updatedAt: T0,
});

function setup() {
  const overview = buildOverview(
    [space],
    [group('g1', 'Учёба', 1), group('g2', 'Работа', 2), group('g3', 'Пустая', 3)],
    [
      tab('a', 'g1', 'Лекция по React', 1),
      tab('b', 'g1', 'Конспект', 2),
      tab('c', 'g2', 'Почта', 1),
    ],
  );
  return { overview, index: buildSearchIndex(overview) };
}

describe('pickerGroups', () => {
  it('lists every group with links in the order of the tiles, without empty ones', () => {
    const { overview, index } = setup();
    const groups = pickerGroups(overview, index, '');
    expect(groups.map(({ group: g, tabs }) => [g.title, tabs.map((t) => t.id)])).toEqual([
      ['Учёба', ['a', 'b']],
      ['Работа', ['c']],
    ]);
  });

  it('keeps only matching links; a matching group keeps all of them', () => {
    const { overview, index } = setup();
    expect(pickerGroups(overview, index, 'реакт').map(({ tabs }) => tabs.map((t) => t.id))).toEqual(
      [],
    );
    expect(pickerGroups(overview, index, 'react').map(({ tabs }) => tabs.map((t) => t.id))).toEqual(
      [['a']],
    );
    expect(pickerGroups(overview, index, 'учёба').map(({ tabs }) => tabs.map((t) => t.id))).toEqual(
      [['a', 'b']],
    );
  });
});

describe('togglePick', () => {
  it('adds at the end, drops on a second click, takes at most four', () => {
    expect(togglePick([], 'a')).toEqual(['a']);
    expect(togglePick(['a', 'b'], 'a')).toEqual(['b']);
    expect(togglePick(['a', 'b', 'c', 'd'], 'e')).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('defaultLayoutName', () => {
  it('names a layout after its first two links and counts the rest', () => {
    const links = [
      { title: 'Лекция по React: хуки и эффекты', url: 'https://a.example/' },
      { title: 'Конспект', url: 'https://b.example/' },
      { title: '', url: 'https://c.example/' },
    ];
    expect(defaultLayoutName(links.slice(0, 2))).toBe('Лекция по React: хуки и… + Конспект');
    expect(defaultLayoutName(links)).toBe('Лекция по React: хуки и… + Конспект + 1');
    expect(defaultLayoutName([])).toBe('');
  });
});

const page = (id: number, url: string, title: string, extra: Partial<PageTab> = {}): PageTab => ({
  id,
  url,
  title,
  groupId: -1,
  placeholder: false,
  ...extra,
});

describe('openPages', () => {
  const tabs = [
    page(1, 'https://mdn.example/docs', 'MDN: Array'),
    page(2, 'https://grouped.example/', 'В группе', { groupId: 7 }),
    page(3, 'chrome-extension://tabflow/app.html', 'TabFlow'),
    page(4, 'https://mdn.example/docs', 'MDN: Array (копия)'),
    page(5, 'https://lazy.example/', 'Заглушка', { placeholder: true }),
    page(6, 'http://ёлка.example/', 'Ёлка'),
  ];

  it('lists open sites outside native groups, one tab per address', () => {
    expect(openPages(tabs, '').map((tab) => tab.id)).toEqual([1, 6]);
  });

  it('matches every word of the query in the title or the address', () => {
    expect(openPages(tabs, 'mdn array').map((tab) => tab.id)).toEqual([1]);
    expect(openPages(tabs, 'елка').map((tab) => tab.id)).toEqual([6]);
    expect(openPages(tabs, 'mdn елка')).toEqual([]);
  });
});

describe('pickedItems', () => {
  it('keeps the picked order: links, and open tabs by their address', () => {
    const { overview } = setup();
    const pages = [page(9, 'https://open.example/', 'Открытая')];
    const items = pickedItems(overview, pages, [
      'c',
      pageKey('https://open.example/'),
      'gone',
      pageKey('https://closed.example/path'),
    ]);
    expect(
      items.map(({ link, url, title, chromeTabId }) => [link?.id, url, title, chromeTabId]),
    ).toEqual([
      ['c', 'https://c.example/', 'Почта', undefined],
      [undefined, 'https://open.example/', 'Открытая', 9],
      [undefined, 'https://closed.example/path', 'closed.example', undefined],
    ]);
    expect(toLayoutLinks(items)).toEqual([
      { tabId: 'c', url: 'https://c.example/', title: 'Почта' },
      { url: 'https://open.example/', title: 'Открытая' },
      { url: 'https://closed.example/path', title: 'closed.example' },
    ]);
  });
});

describe('layoutPanes', () => {
  it('shows live links and the saved address of a link that is gone or was an open tab', () => {
    const { overview } = setup();
    const panes = layoutPanes(overview, [
      { tabId: 'a', url: 'https://old.example/', title: 'Старое' },
      { tabId: 'gone', url: 'https://gone.example/', title: 'Удалена' },
      { url: 'https://open.example/', title: 'Открытая' },
    ]);
    expect(panes.map(({ link, url, title }) => [link?.id, url, title])).toEqual([
      ['a', 'https://a.example/', 'Лекция по React'],
      [undefined, 'https://gone.example/', 'Удалена'],
      [undefined, 'https://open.example/', 'Открытая'],
    ]);
  });
});
