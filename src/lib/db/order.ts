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

/**
 * Order of the groups of a space: «В избранном» first, then by `order`. The keys keep it too
 * (`groups.place` never moves a group out of its block), the comparator only covers records that
 * came in out of place (import, trash) until the next move rewrites them.
 */
export function byFavoriteThenOrder<T extends { order: number; favorite?: boolean }>(
  a: T,
  b: T,
): number {
  return Number(b.favorite === true) - Number(a.favorite === true) || a.order - b.order;
}

/** `index` kept inside the block of `favorite` items of a list sorted by `byFavoriteThenOrder`. */
export function indexInBlock(
  others: readonly { favorite?: boolean }[],
  favorite: boolean,
  index: number,
): number {
  const favorites = others.filter((item) => item.favorite === true).length;
  return favorite
    ? Math.max(0, Math.min(index, favorites))
    : Math.max(favorites, Math.min(index, others.length));
}

/** Key for an item appended after the last one. */
export function orderAfterLast(items: readonly { order: number }[]): number {
  const last = items.reduce<number | undefined>(
    (max, item) => (max === undefined || item.order > max ? item.order : max),
    undefined,
  );
  return orderBetween(last, undefined);
}
