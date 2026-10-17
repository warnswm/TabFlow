/**
 * «Рядом»: where the panes of 2–4 links go on the main page. The layout depends on the number of
 * links only, panes follow the order of the links:
 * - 2 — two columns: left, right;
 * - 3 — the first on the left at full height, the other two stacked on the right;
 * - 4 — a 2×2 grid: top left, top right, bottom left, bottom right.
 */

/** A rectangle: pixels for the small scheme, percent of the screen for the panes. */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const MIN_TILES = 2;
export const MAX_TILES = 4;

export function isTileCount(count: number): boolean {
  return Number.isInteger(count) && count >= MIN_TILES && count <= MAX_TILES;
}

/** Splits `size` into two whole parts; the second gets the odd pixel. */
function halves(start: number, size: number): [[number, number], [number, number]] {
  const first = Math.floor(size / 2);
  return [
    [start, first],
    [start + first, size - first],
  ];
}

/** The rectangles of `count` panes (2–4) inside `area`, in pane order; together they fill it. */
export function tileRects(count: number, area: Rect): Rect[] {
  if (!isTileCount(count)) {
    throw new RangeError(`tileRects: ${count} panes, expected ${MIN_TILES}–${MAX_TILES}`);
  }
  const [[left, leftWidth], [right, rightWidth]] = halves(area.left, area.width);
  const [[top, topHeight], [bottom, bottomHeight]] = halves(area.top, area.height);
  const rect = (x: number, width: number, y: number, height: number): Rect => ({
    left: x,
    top: y,
    width,
    height,
  });

  if (count === 2) {
    return [
      rect(left, leftWidth, area.top, area.height),
      rect(right, rightWidth, area.top, area.height),
    ];
  }
  if (count === 3) {
    return [
      rect(left, leftWidth, area.top, area.height),
      rect(right, rightWidth, top, topHeight),
      rect(right, rightWidth, bottom, bottomHeight),
    ];
  }
  return [
    rect(left, leftWidth, top, topHeight),
    rect(right, rightWidth, top, topHeight),
    rect(left, leftWidth, bottom, bottomHeight),
    rect(right, rightWidth, bottom, bottomHeight),
  ];
}

const WHOLE: Rect = { left: 0, top: 0, width: 100, height: 100 };

/**
 * Panes of the viewer in percent of its area. Panes can be closed one by one: the last one left
 * takes the whole area.
 */
export function paneRects(count: number): Rect[] {
  if (count <= 0) return [];
  if (count === 1) return [{ ...WHOLE }];
  return tileRects(Math.min(count, MAX_TILES), WHOLE);
}
