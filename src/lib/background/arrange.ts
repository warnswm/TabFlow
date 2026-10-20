/**
 * The tab strip and TabFlow keep one order of groups.
 *
 * TabFlow → strip (`arrangeGroups`): native groups of a window stand in the order of their spaces
 * (as in the sidebar, «Входящие» first) and of their tiles within a space.
 * Strip → TabFlow (`followStrip`): a group the user dragged on the strip moves its tile within
 * its space, so that the open groups of the space stand as on the strip.
 *
 * Chrome's own list of saved groups (the bookmarks bar, closed groups) has no extension API,
 * so only the groups on the tab strip are arranged.
 */
import { type BrowserTab, NO_GROUP } from '../browser-api';
import type { Id, TabGroup } from '../db';
import { byFavoriteThenOrder } from '../db/order';
import type { BackgroundContext } from './context';

/** Where each native group of a window starts and how many tabs it has, in strip order. */
function readStrip(tabs: readonly BrowserTab[]) {
  const firstIndex = new Map<number, number>();
  const size = new Map<number, number>();
  for (const tab of [...tabs].sort((a, b) => a.index - b.index)) {
    if (tab.groupId === NO_GROUP) continue;
    if (!firstIndex.has(tab.groupId)) firstIndex.set(tab.groupId, tab.index);
    size.set(tab.groupId, (size.get(tab.groupId) ?? 0) + 1);
  }
  return { firstIndex, size };
}

/**
 * Puts the native groups of the window in TabFlow order. They stand one after another from the
 * place of the leftmost one; tabs outside groups that stood between them move to the right.
 * Nothing moves when the order is already right. Returns how many groups moved; never throws —
 * the order is cosmetic, the groups stay where they are when Chrome refuses.
 */
export async function arrangeGroups(ctx: BackgroundContext, windowId: number): Promise<number> {
  const { api, repos } = ctx;
  if (!api.supportsGroups) return 0;
  try {
    const { firstIndex, size } = readStrip(await api.queryTabs({ windowId }));

    const spaceRank = new Map(
      (await repos.spaces.list()).map((space, i) => [space.id, space.isDefault ? -1 : i]),
    );
    const rank = (spaceId: string) => spaceRank.get(spaceId) ?? Number.MAX_SAFE_INTEGER;
    const desired = (await repos.groups.listAll())
      .filter((group) => group.chromeGroupId !== undefined && firstIndex.has(group.chromeGroupId))
      .sort((a, b) => rank(a.spaceId) - rank(b.spaceId) || byFavoriteThenOrder(a, b))
      .map((group) => group.chromeGroupId as number);
    const known = new Set(desired);
    const current = [...firstIndex.keys()].filter((id) => known.has(id));
    if (current.join() === desired.join()) return 0;

    // Every group still to place stands at `cursor` or further right, so each move goes left
    // (or nowhere) and `index` is unambiguous.
    let cursor = Math.min(...desired.map((id) => firstIndex.get(id) ?? Infinity));
    let moved = 0;
    for (const [i, chromeGroupId] of desired.entries()) {
      if (current[i] !== chromeGroupId) moved++;
      await api.moveGroup(chromeGroupId, cursor);
      cursor += size.get(chromeGroupId) ?? 0;
    }
    return moved;
  } catch (error) {
    console.warn('[TabFlow] Groups on the tab strip were not arranged.', error);
    return 0;
  }
}

/** Arranges every window that has native groups. */
export async function arrangeAllWindows(ctx: BackgroundContext): Promise<number> {
  const windows = new Set((await ctx.api.queryGroups({})).map((group) => group.windowId));
  let moved = 0;
  for (const windowId of windows) moved += await arrangeGroups(ctx, windowId);
  return moved;
}

/**
 * Tiles follow the strip of the window: within each space its groups on this strip take their
 * strip order in the places they hold among the tiles; stowed groups and groups of other windows
 * keep their places. Nothing is written when the order already matches — after `arrangeGroups`
 * it always does, so TabFlow's own moves do not move tiles back. Favorites stay first: a group
 * dragged across their border moves only within its block, and the strip is arranged again.
 * Returns how many tiles moved.
 */
export async function followStrip(ctx: BackgroundContext, windowId: number): Promise<number> {
  const { api, repos } = ctx;
  if (!api.supportsGroups) return 0;
  const { firstIndex } = readStrip(await api.queryTabs({ windowId }));
  const stripIndex = (group: TabGroup) =>
    group.chromeGroupId === undefined ? undefined : firstIndex.get(group.chromeGroupId);
  const onStrip = (group: TabGroup) => stripIndex(group) !== undefined;

  const spaceIds = new Set((await repos.groups.listAll()).filter(onStrip).map((g) => g.spaceId));
  let moved = 0;
  let misplaced = false;
  for (const spaceId of spaceIds) {
    const tiles = await repos.groups.listBySpace(spaceId);
    // Favorites stay first: a block takes the strip order only among its own places.
    const wanted = (favorite: boolean) =>
      tiles
        .filter((tile) => onStrip(tile) && (tile.favorite === true) === favorite)
        .sort((a, b) => (stripIndex(a) ?? 0) - (stripIndex(b) ?? 0))
        .map((group) => group.id);
    const favorites = wanted(true);
    const others = wanted(false);
    // A group dragged in front of a favorite (or a favorite behind the others) goes back.
    const strip = tiles.filter(onStrip).sort((a, b) => (stripIndex(a) ?? 0) - (stripIndex(b) ?? 0));
    if (strip.map((g) => g.id).join() !== [...favorites, ...others].join()) misplaced = true;
    const desired = tiles.map((tile) => {
      if (!onStrip(tile)) return tile.id;
      return (tile.favorite === true ? favorites : others).shift() ?? tile.id;
    });
    const fixed = new Set(tiles.filter((tile) => !onStrip(tile)).map((tile) => tile.id));
    const moves = placeMoves(
      tiles.map((tile) => tile.id),
      desired,
      fixed,
    );
    for (const [id, index] of moves) await repos.groups.place(id, spaceId, index);
    moved += moves.length;
  }
  if (misplaced) await arrangeGroups(ctx, windowId);
  return moved;
}

/**
 * How to turn the list `current` into `desired` (the same ids) with `groups.place`: the longest
 * run already in the right relative order stays — with every `fixed` id, which must already be
 * in order — and each other id is placed right after its new left neighbour. Returns the moves
 * to apply one after another; `index` counts the list without the moved id.
 */
export function placeMoves(
  current: readonly Id[],
  desired: readonly Id[],
  fixed: ReadonlySet<Id>,
): [Id, number][] {
  // The heaviest increasing run of current positions: a fixed id outweighs all the others.
  const position = desired.map((id) => current.indexOf(id));
  const weight = desired.map((id) => (fixed.has(id) ? desired.length + 1 : 1));
  const best: number[] = [];
  const previous: number[] = [];
  for (const [i, at] of position.entries()) {
    best[i] = weight[i] ?? 1;
    previous[i] = -1;
    for (let j = 0; j < i; j++) {
      const score = (best[j] ?? 0) + (weight[i] ?? 1);
      if ((position[j] ?? 0) < at && score > (best[i] ?? 0)) {
        best[i] = score;
        previous[i] = j;
      }
    }
  }
  const stay = new Set<Id>();
  let last = best.indexOf(Math.max(...best));
  while (last >= 0) {
    const id = desired[last];
    if (id !== undefined) stay.add(id);
    last = previous[last] ?? -1;
  }

  const list = [...current];
  const moves: [Id, number][] = [];
  for (const [i, id] of desired.entries()) {
    if (stay.has(id)) continue;
    list.splice(list.indexOf(id), 1);
    const neighbour = desired[i - 1];
    const index = neighbour === undefined ? 0 : list.indexOf(neighbour) + 1;
    list.splice(index, 0, id);
    moves.push([id, index]);
  }
  return moves;
}
