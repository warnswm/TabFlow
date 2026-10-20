import { describe, expect, it } from 'vitest';
import type { QueueItem, SavedTab, Space, TabGroup } from '../db/models';
import { buildOverview } from './overview';
import { reviewCounts, reviewItems } from './review';
import { linksText, markdownText } from './share';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 20, 12);

const inbox: Space = {
  id: 'inbox',
  name: 'Входящие',
  order: 1,
  isDefault: true,
  createdAt: 0,
  updatedAt: 0,
};

const group = (id: string, extra: Partial<TabGroup> = {}): TabGroup => ({
  id,
  spaceId: 'inbox',
  title: id,
  color: 'blue',
  state: 'stowed',
  order: 1,
  createdAt: 0,
  updatedAt: 0,
  ...extra,
});

const tab = (id: string, groupId: string, extra: Partial<SavedTab> = {}): SavedTab => ({
  id,
  groupId,
  url: `https://example.com/${id}`,
  title: id,
  order: 1,
  pinned: false,
  createdAt: 0,
  updatedAt: 0,
  ...extra,
});

const video = (id: string, order: number, extra: Partial<QueueItem> = {}): QueueItem => ({
  id,
  url: `https://www.youtube.com/watch?v=${id}`,
  title: id,
  site: 'youtube.com',
  positionSec: 0,
  status: 'queued',
  order,
  createdAt: NOW - 20 * DAY,
  updatedAt: 0,
  ...extra,
});

describe('«Давно не открывали»', () => {
  const overview = buildOverview(
    [inbox],
    [
      group('old', { stateChangedAt: NOW - 30 * DAY }),
      group('fresh', { stateChangedAt: NOW - 3 * DAY }),
      group('kept', { stateChangedAt: NOW - 30 * DAY, reviewedAt: NOW - 2 * DAY }),
      group('open', { state: 'active', stateChangedAt: NOW - 30 * DAY }),
      group('empty', { stateChangedAt: NOW - 30 * DAY }),
      group('older', { stateChangedAt: NOW - 40 * DAY }),
    ],
    ['old', 'fresh', 'kept', 'open', 'older'].map((id) => tab(`${id}-1`, id)),
  );
  const queue = [
    video('v1', 1, { createdAt: NOW - 2 * DAY }),
    video('v2', 2, { createdAt: NOW - 35 * DAY }),
    video('v3', 3, { status: 'watched' }),
    video('v4', 4, { reviewedAt: NOW - DAY }),
    video('v5', 5),
  ];

  it('shows stowed groups and queued videos older than the threshold, the oldest first', () => {
    const items = reviewItems(overview, queue, NOW, 14);

    expect(items.map((item) => (item.kind === 'group' ? item.group.id : item.video.id))).toEqual([
      'older',
      'v2',
      'old',
      'v5',
    ]);
    expect(items[1]).toMatchObject({ kind: 'video', priority: 2 });
    expect(items[3]).toMatchObject({ kind: 'video', priority: 4 });
    expect(reviewCounts(items)).toEqual({ groups: 2, videos: 2 });
  });

  it('counts «Оставить» as a fresh start and is off at 0 days', () => {
    // «Оставить» two days ago: back after 14 days from then.
    const later = reviewItems(overview, queue, NOW + 13 * DAY, 14);
    expect(later.some((item) => item.kind === 'group' && item.group.id === 'kept')).toBe(true);
    expect(reviewItems(overview, queue, NOW, 30).map((item) => item.since)).toEqual([
      NOW - 40 * DAY,
      NOW - 35 * DAY,
      NOW - 30 * DAY,
    ]);
    expect(reviewItems(overview, queue, NOW, 0)).toEqual([]);
  });
});

describe('«Поделиться группой»', () => {
  const tabs = [
    tab('a', 'g', { title: 'Docs [beta]', url: 'https://example.com/a (1)', note: 'Глава 2' }),
    tab('b', 'g', { title: '  ', url: 'https://example.com/b' }),
  ];

  it('copies the addresses one per line', () => {
    expect(linksText(tabs)).toBe('https://example.com/a (1)\nhttps://example.com/b');
  });

  it('copies a Markdown list with the title, the note and escaped links', () => {
    expect(markdownText({ title: 'Учёба', note: 'К экзамену\nв мае' }, tabs, 'Без названия')).toBe(
      [
        '## Учёба',
        '',
        'К экзамену в мае',
        '',
        '- [Docs \\[beta\\]](https://example.com/a%20%281%29) — Глава 2',
        '- [https://example.com/b](https://example.com/b)',
      ].join('\n'),
    );
    expect(markdownText({ title: '' }, [], 'Без названия')).toBe('## Без названия\n');
  });
});
