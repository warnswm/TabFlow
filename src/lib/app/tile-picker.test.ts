import { describe, expect, it } from 'vitest';
import type { SavedTab, Space, TabGroup } from '../db/models';
import { buildOverview } from './overview';
import { buildSearchIndex } from './search';
import {
  defaultLayoutName,
  layoutPanes,
  linkPanes,
  pickedLinks,
  pickerGroups,
  togglePick,
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

describe('pickedLinks', () => {
  it('returns the picked links in the picked order, skipping deleted ones', () => {
    const { overview } = setup();
    expect(pickedLinks(overview, ['c', 'gone', 'a']).map((t) => t.id)).toEqual(['c', 'a']);
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

describe('viewer panes', () => {
  it('shows the links of «Рядом» in order, without deleted ones', () => {
    const { overview } = setup();
    expect(linkPanes(overview, ['c', 'gone', 'a']).map((pane) => pane.url)).toEqual([
      'https://c.example/',
      'https://a.example/',
    ]);
  });

  it('shows a saved layout with live links and the saved address of a link that is gone', () => {
    const { overview } = setup();
    const panes = layoutPanes(overview, [
      { tabId: 'a', url: 'https://old.example/', title: 'Старое' },
      { tabId: 'gone', url: 'https://gone.example/', title: 'Удалена' },
    ]);
    expect(panes.map(({ link, url, title }) => [link?.id, url, title])).toEqual([
      ['a', 'https://a.example/', 'Лекция по React'],
      [undefined, 'https://gone.example/', 'Удалена'],
    ]);
  });
});
