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

/** Key for an item appended after the last one. */
export function orderAfterLast(items: readonly { order: number }[]): number {
  const last = items.reduce<number | undefined>(
    (max, item) => (max === undefined || item.order > max ? item.order : max),
    undefined,
  );
  return orderBetween(last, undefined);
}
