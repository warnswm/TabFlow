/**
 * Order shown right after a drop, until the database change arrives: without it the dropped
 * item would jump back for a moment.
 */

/** The ids of `items` with `movedId` put at the place of `overId` (`arrayMove` semantics). */
export function moveId(ids: readonly string[], movedId: string, overId: string): string[] {
  const from = ids.indexOf(movedId);
  const to = ids.indexOf(overId);
  if (from === -1 || to === -1 || from === to) return [...ids];
  const next = ids.filter((id) => id !== movedId);
  next.splice(to, 0, movedId);
  return next;
}

/**
 * `items` in the order of `ids`. Items missing from `ids` keep their place at the end, ids of
 * items that are gone are skipped — the list may change while a drop is being saved.
 */
export function applyOrder<T>(
  items: readonly T[],
  ids: readonly string[],
  idOf: (item: T) => string,
): T[] {
  const byId = new Map(items.map((item) => [idOf(item), item]));
  const ordered = ids.map((id) => byId.get(id)).filter((item) => item !== undefined);
  const placed = new Set(ids);
  return [...ordered, ...items.filter((item) => !placed.has(idOf(item)))];
}
