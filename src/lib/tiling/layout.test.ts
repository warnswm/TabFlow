import { describe, expect, it } from 'vitest';
import {
  isPaneArrangement,
  isTileCount,
  moveRect,
  paneRects,
  type Rect,
  resizeRect,
  tileRects,
} from './layout';

const FULL_HD: Rect = { left: 0, top: 0, width: 1920, height: 1040 };

const area = (rects: readonly Rect[]) => rects.reduce((sum, r) => sum + r.width * r.height, 0);

/** No two rectangles share a pixel. */
function overlaps(rects: readonly Rect[]): boolean {
  return rects.some((a, i) =>
    rects.some(
      (b, j) =>
        i < j &&
        a.left < b.left + b.width &&
        b.left < a.left + a.width &&
        a.top < b.top + b.height &&
        b.top < a.top + a.height,
    ),
  );
}

describe('tileRects', () => {
  it('puts two windows into two columns', () => {
    expect(tileRects(2, FULL_HD)).toEqual([
      { left: 0, top: 0, width: 960, height: 1040 },
      { left: 960, top: 0, width: 960, height: 1040 },
    ]);
  });

  it('puts the first of three on the left at full height and stacks the others on the right', () => {
    expect(tileRects(3, FULL_HD)).toEqual([
      { left: 0, top: 0, width: 960, height: 1040 },
      { left: 960, top: 0, width: 960, height: 520 },
      { left: 960, top: 520, width: 960, height: 520 },
    ]);
  });

  it('puts four windows into a 2×2 grid, row by row', () => {
    expect(tileRects(4, FULL_HD)).toEqual([
      { left: 0, top: 0, width: 960, height: 520 },
      { left: 960, top: 0, width: 960, height: 520 },
      { left: 0, top: 520, width: 960, height: 520 },
      { left: 960, top: 520, width: 960, height: 520 },
    ]);
  });

  it('keeps the offset of the work area (taskbar on top, second display on the left)', () => {
    const work: Rect = { left: -1280, top: 40, width: 1280, height: 984 };
    expect(tileRects(4, work)).toEqual([
      { left: -1280, top: 40, width: 640, height: 492 },
      { left: -640, top: 40, width: 640, height: 492 },
      { left: -1280, top: 532, width: 640, height: 492 },
      { left: -640, top: 532, width: 640, height: 492 },
    ]);
  });

  it('fills an odd-sized area exactly, without gaps or overlaps', () => {
    const odd: Rect = { left: 7, top: 3, width: 1365, height: 727 };
    for (const count of [2, 3, 4]) {
      const rects = tileRects(count, odd);
      expect(rects).toHaveLength(count);
      expect(overlaps(rects)).toBe(false);
      expect(area(rects)).toBe(odd.width * odd.height);
      for (const r of rects) {
        expect(Number.isInteger(r.left + r.top + r.width + r.height)).toBe(true);
        expect(r.left).toBeGreaterThanOrEqual(odd.left);
        expect(r.left + r.width).toBeLessThanOrEqual(odd.left + odd.width);
        expect(r.top + r.height).toBeLessThanOrEqual(odd.top + odd.height);
      }
    }
  });

  it('refuses fewer than two or more than four windows', () => {
    expect(() => tileRects(1, FULL_HD)).toThrow(RangeError);
    expect(() => tileRects(5, FULL_HD)).toThrow(RangeError);
    expect(isTileCount(2)).toBe(true);
    expect(isTileCount(4)).toBe(true);
    expect(isTileCount(2.5)).toBe(false);
  });
});

describe('paneRects', () => {
  it('gives the panes of the viewer in percent', () => {
    expect(paneRects(3)).toEqual([
      { left: 0, top: 0, width: 50, height: 100 },
      { left: 50, top: 0, width: 50, height: 50 },
      { left: 50, top: 50, width: 50, height: 50 },
    ]);
  });

  it('lets the last pane left take the whole area', () => {
    expect(paneRects(1)).toEqual([{ left: 0, top: 0, width: 100, height: 100 }]);
    expect(paneRects(0)).toEqual([]);
  });
});

describe('free panes', () => {
  const pane: Rect = { left: 10, top: 20, width: 40, height: 30 };
  const min = { width: 10, height: 10 };

  it('moves a pane, keeping it whole inside the area', () => {
    expect(moveRect(pane, 5, -5)).toEqual({ left: 15, top: 15, width: 40, height: 30 });
    expect(moveRect(pane, 100, 100)).toEqual({ left: 60, top: 70, width: 40, height: 30 });
    expect(moveRect(pane, -100, -100)).toEqual({ left: 0, top: 0, width: 40, height: 30 });
  });

  it('resizes by an edge or a corner; the opposite edges stay', () => {
    expect(resizeRect(pane, 'e', 10, 99, min)).toEqual({
      left: 10,
      top: 20,
      width: 50,
      height: 30,
    });
    expect(resizeRect(pane, 'nw', -5, -5, min)).toEqual({
      left: 5,
      top: 15,
      width: 45,
      height: 35,
    });
    expect(resizeRect(pane, 'se', 100, 100, min)).toEqual({
      left: 10,
      top: 20,
      width: 90,
      height: 80,
    });
  });

  it('keeps the minimal size and the area', () => {
    expect(resizeRect(pane, 'w', 50, 0, min)).toEqual({ left: 40, top: 20, width: 10, height: 30 });
    expect(resizeRect(pane, 's', 0, -50, min)).toEqual({
      left: 10,
      top: 20,
      width: 40,
      height: 10,
    });
    expect(resizeRect(pane, 'n', 0, -50, min)).toEqual({ left: 10, top: 0, width: 40, height: 50 });
  });

  it('accepts a saved arrangement only when it fits the panes', () => {
    const grid = paneRects(2);
    expect(isPaneArrangement(grid, 2)).toBe(true);
    expect(isPaneArrangement(grid, 3)).toBe(false);
    expect(isPaneArrangement(undefined, 2)).toBe(false);
    expect(isPaneArrangement([pane, { ...pane, left: 80 }], 2)).toBe(false);
  });
});
