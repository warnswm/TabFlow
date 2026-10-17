import { describe, expect, it } from 'vitest';
import type { GroupState, TabGroup } from './db/models';
import { badgeText, badgeTitle, currentTarget, isSleepable, summarize } from './summary';

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

  it('shows the number of stowed groups on the badge', () => {
    expect(badgeText(0)).toBe('');
    expect(badgeText(7)).toBe('7');
    expect(badgeText(99)).toBe('99');
    expect(badgeText(100)).toBe('99+');
    expect(badgeTitle(0)).toBe('TabFlow');
    expect(badgeTitle(3)).toBe('TabFlow · убрано 3 группы');
    expect(badgeTitle(5)).toBe('TabFlow · убрано 5 групп');
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
