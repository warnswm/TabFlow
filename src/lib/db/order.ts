/**
 * Sort keys for drag & drop: an item moved between two neighbours gets the midpoint,
 * so only the moved record is written.
 */
export const ORDER_STEP = 1024;

/** Key for an item placed between `before` and `after` (either may be absent: start or end of the list). */
export function orderBetween(before?: number, after?: number): number {
  if (before === undefined && after === undefined) return ORDER_STEP;
  if (before === undefined) return (after as number) - ORDER_STEP;
  if (after === undefined) return before + ORDER_STEP;
  if (before >= after) throw new RangeError(`orderBetween: ${before} must be less than ${after}`);
  return before + (after - before) / 2;
}

/** Neighbours closer than this leave no room for a new key: the whole list gets new keys. */
const MIN_GAP = 1e-6;

/**
 * Where an item dropped at `index` of a sorted list goes: a key between its new neighbours, or —
 * when there is no room left between them — the ids of the whole list in the new order,
 * to be rewritten with even keys. `items` may contain the item itself (moving inside one list).
 */
export type Placement = { order: number } | { reorder: string[] };

export function placeAt(
  items: readonly { id: string; order: number }[],
  movedId: string,
  index: number,
): Placement {
  const others = items.filter((item) => item.id !== movedId);
  const at = Math.max(0, Math.min(index, others.length));
  const before = others[at - 1]?.order;
  const after = others[at]?.order;
  if (before === undefined || after === undefined || after - before >= MIN_GAP) {
    return { order: orderBetween(before, after) };
  }
  const ids = others.map((item) => item.id);
  ids.splice(at, 0, movedId);
  return { reorder: ids };
}

/** Key for an item appended after the last one. */
export function orderAfterLast(items: readonly { order: number }[]): number {
  const last = items.reduce<number | undefined>(
    (max, item) => (max === undefined || item.order > max ? item.order : max),
    undefined,
  );
  return orderBetween(last, undefined);
}
