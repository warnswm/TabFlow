import { describe, expect, it } from 'vitest';
import type { GroupState, TabGroup } from './db/models';
import type { QueueItem } from './db/models';
import { badge, badgeCount, currentTarget, isSleepable, summarize } from './summary';

function group(state: GroupState, chromeGroupId?: number): TabGroup {
  return {
    id: `g${chromeGroupId ?? state}`,
    spaceId: 's',
    title: 'Группа',
    color: 'blue',
    state,
    order: 1,
    chromeGroupId,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('summary', () => {
  it('counts groups on the strip, asleep, stowed and the ones to put to sleep', () => {
    const groups = [
      group('active', 1),
      group('active', 2),
      group('active', 3),
      group('asleep', 4),
      group('stowed'),
      group('stowed'),
    ];
    expect(summarize(groups, new Set([2]))).toEqual({
      onStrip: 4,
      asleep: 1,
      stowed: 2,
      sleepable: 2,
    });
  });

  it('leaves awake the groups shown in a window, asleep and stowed ones', () => {
    const shown = new Set([1]);
    expect(isSleepable(group('active', 1), shown)).toBe(false);
    expect(isSleepable(group('active', 2), shown)).toBe(true);
    expect(isSleepable(group('asleep', 3), shown)).toBe(false);
    expect(isSleepable(group('stowed'), shown)).toBe(false);
  });
});

function video(n: number, durationSec?: number, positionSec = 0): QueueItem {
  return {
    id: `v${n}`,
    url: `https://example.com/${n}`,
    title: `Видео ${n}`,
    site: 'example.com',
    durationSec,
    positionSec,
    status: 'queued',
    order: n,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('badge', () => {
  const queued = [video(1, 600), video(2, 1200, 300), video(3), video(4, 1800), video(5, 60)];

  it('counts videos for today, all queued videos or stowed groups', () => {
    expect(badge('today', queued, 2).text).toBe('3');
    expect(badge('queue', queued, 2).text).toBe('5');
    expect(badge('stowed', queued, 2).text).toBe('2');
    expect(badge('stowed', queued, 0).text).toBe('');
    expect(badge('today', [], 4).text).toBe('');
  });

  it('keeps the numbers short', () => {
    expect(badgeCount(0)).toBe('');
    expect(badgeCount(99)).toBe('99');
    expect(badgeCount(100)).toBe('99+');
  });

  it('tells the day and the stowed groups in the tooltip, whatever the number counts', () => {
    // Today: 10 min + 15 min left; the third video has no duration yet.
    expect(badge('stowed', queued, 3).title.split('\n')).toEqual([
      'TabFlow',
      'На сегодня: 3 видео · 25 мин',
      'В очереди: 5 видео · 56 мин',
      'Убрано в TabFlow: 3 группы',
    ]);
    expect(badge('today', [], 0).title.split('\n')).toEqual(['TabFlow', 'Очередь пуста']);
    expect(badge('today', queued.slice(0, 2), 5).title.split('\n')).toEqual([
      'TabFlow',
      'На сегодня: 2 видео · 25 мин',
      'Убрано в TabFlow: 5 групп',
    ]);
  });
});

describe('current target', () => {
  const work = group('active', 7);

  it('offers the group of the tab, the tab alone, or nothing', () => {
    const tab = (url: string, groupId = -1, pinned = false) => ({ url, groupId, pinned });
    expect(currentTarget(tab('https://a.example/', 7), [work])).toEqual({
      kind: 'group',
      group: work,
    });
    expect(currentTarget(tab('https://a.example/'), [work])).toEqual({ kind: 'tab' });
    expect(currentTarget(tab('https://a.example/', -1, true), [work])).toEqual({
      kind: 'none',
      reason: 'pinned',
    });
    expect(currentTarget(tab('chrome://settings'), [work])).toEqual({
      kind: 'none',
      reason: 'browser-page',
    });
    expect(currentTarget(undefined, [work])).toEqual({ kind: 'none', reason: 'browser-page' });
  });
});
