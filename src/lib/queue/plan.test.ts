import { describe, expect, it } from 'vitest';
import type { QueueItem } from '../db/models';
import {
  cardsInRow,
  durationLabel,
  FREE_TIME_SLOTS,
  formatDuration,
  formatMinutes,
  pickForTime,
  pickHint,
  priorityList,
  progressShare,
  queueTotal,
  remainingSec,
  sortQueue,
  todayPlan,
  totalText,
} from './plan';

function video(n: number, minutes?: number, watchedMinutes = 0): QueueItem {
  return {
    id: `v${n}`,
    url: `https://example.com/${n}`,
    title: `Видео ${n}`,
    site: 'example.com',
    durationSec: minutes === undefined ? undefined : minutes * 60,
    positionSec: watchedMinutes * 60,
    status: 'queued',
    order: n,
    createdAt: 0,
    updatedAt: 0,
  };
}

const slot = (minutes: number) => {
  const found = FREE_TIME_SLOTS.find((item) => item.minutes === minutes);
  if (!found) throw new Error(`No slot ${minutes}`);
  return found;
};

describe('queue plan', () => {
  it('counts the time left of every video', () => {
    expect(remainingSec(video(1, 20, 5))).toBe(15 * 60);
    expect(remainingSec(video(1))).toBeUndefined();
    expect(progressShare(video(1, 20, 5))).toBe(0.25);
    expect(progressShare(video(1))).toBe(0);
    expect(queueTotal([video(1, 10), video(2), video(3, 30, 10)])).toEqual({
      count: 3,
      totalSec: 30 * 60,
      unknown: 1,
    });
  });

  it('plans the first three videos for today', () => {
    const queued = [video(1, 15), video(2, 24), video(3, 4), video(4, 40)];
    expect(todayPlan(queued)).toEqual({ count: 3, totalSec: 43 * 60, unknown: 0 });
    expect(totalText(todayPlan(queued))).toBe('3 видео · 43 мин');
    expect(totalText(todayPlan([video(1)]))).toBe('1 видео');
    expect(todayPlan([])).toEqual({ count: 0, totalSec: 0, unknown: 0 });
  });

  it('picks by priority what fits into the free time', () => {
    const queued = [video(1, 15), video(2, 24), video(3, 4), video(4)];
    expect(pickForTime(queued, 20)).toEqual({ priorities: [1, 3], totalSec: 19 * 60 });
    expect(pickForTime(queued, 40)).toEqual({ priorities: [1, 2], totalSec: 39 * 60 });
    expect(pickForTime(queued, 10)).toEqual({ priorities: [3], totalSec: 4 * 60 });
    // Half watched: only the rest counts.
    expect(pickForTime([video(1, 30, 22)], 10).priorities).toEqual([1]);
  });

  it('takes a long video for «1 ч+» when nothing fits into an hour', () => {
    const lecture = [video(1), video(2, 95), video(3, 80)];
    expect(pickForTime(lecture, 60)).toEqual({ priorities: [2], totalSec: 95 * 60 });
    expect(pickForTime(lecture, 40).priorities).toEqual([]);
  });

  it('says what fits, or why nothing does', () => {
    const queued = [video(1, 15), video(2, 24), video(3, 4)];
    expect(pickHint(queued, slot(20))).toBe('За 20 мин: #1 и #3 · 19 мин.');
    expect(pickHint([video(1, 25), video(2, 30)], slot(10))).toBe(
      'В 10 мин не помещается ни одно видео.',
    );
    expect(pickHint([video(1)], slot(10))).toBe(
      'Длительность пока неизвестна — она появится, когда видео откроется.',
    );
    expect(pickHint([], slot(10))).toBe('Очередь пуста.');
    expect(pickHint([video(1, 95)], slot(60))).toBe('За час: #1 · 1 ч 35 мин.');
  });

  it('lists priorities in Russian', () => {
    expect(priorityList([])).toBe('');
    expect(priorityList([2])).toBe('#2');
    expect(priorityList([1, 3])).toBe('#1 и #3');
    expect(priorityList([1, 2, 4])).toBe('#1, #2 и #4');
  });

  it('lists the shortest videos first on request, unknown ones last', () => {
    const queued = [video(1, 30), video(2), video(3, 40, 35), video(4, 10)];
    expect(sortQueue(queued, 'short').map((item) => item.id)).toEqual(['v3', 'v4', 'v1', 'v2']);
    expect(sortQueue(queued, 'priority')).toEqual(queued);
  });

  it('shows the watched time next to the duration once watching has started', () => {
    expect(durationLabel(video(1, 37))).toBe('37:00');
    expect(durationLabel({ durationSec: 2225, positionSec: 1752 })).toBe('29:12 / 37:05');
    expect(durationLabel({ durationSec: 2225, positionSec: 10 })).toBe('37:05');
    expect(durationLabel(video(1))).toBe('—');
    expect(durationLabel({ durationSec: 5774, positionSec: 3000 })).toBe('50:00 / 1:36:14');
    expect(durationLabel({ durationSec: 5774, positionSec: 3000 }, 13)).toBe('1:36:14');
  });

  it('fits as many cards into a row as the width allows', () => {
    expect(cardsInRow(1900, 240, 12)).toBe(7);
    expect(cardsInRow(1000, 240, 12)).toBe(4);
    expect(cardsInRow(990, 240, 12)).toBe(3);
    expect(cardsInRow(240, 240, 12)).toBe(1);
    expect(cardsInRow(100, 240, 12)).toBe(1);
  });

  it('formats durations like players and minutes like the mockup', () => {
    expect(formatDuration(295)).toBe('4:55');
    expect(formatDuration(1122)).toBe('18:42');
    expect(formatDuration(3723)).toBe('1:02:03');
    expect(formatMinutes(0)).toBe('0 мин');
    expect(formatMinutes(20)).toBe('1 мин');
    expect(formatMinutes(47 * 60 + 10)).toBe('47 мин');
    expect(formatMinutes(220 * 60)).toBe('3 ч 40 мин');
    expect(formatMinutes(120 * 60)).toBe('2 ч');
  });
});
