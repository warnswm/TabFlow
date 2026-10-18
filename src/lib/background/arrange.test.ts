import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BackgroundTestContext,
  expectOk,
  setupBackground,
  single,
} from '../testing/background';
import { placeMoves } from './arrange';

describe('tiles follow the tab strip', () => {
  let t: BackgroundTestContext;

  beforeEach(async () => {
    t = setupBackground();
    await t.bg.start();
    t.api.addTab({ url: 'https://example.com/' });
  });

  async function strip() {
    const titles: string[] = [];
    for (const tab of await t.api.queryTabs({})) {
      const title = tab.groupId === -1 ? '·' : (await t.api.getGroup(tab.groupId))?.title;
      if (title !== undefined && titles.at(-1) !== title) titles.push(title);
    }
    return titles;
  }

  async function groupNamed(title: string) {
    return single((await t.groups.listAll()).filter((g) => g.title === title));
  }

  async function tiles(spaceId?: string) {
    const id = spaceId ?? (await t.spaces.ensureDefault()).id;
    return (await t.groups.listBySpace(id)).map((group) => group.title);
  }

  async function openGroups(...titles: string[]) {
    for (const title of titles) {
      t.api.addGroup(title, 'blue', [
        { url: `https://example.com/${title}/a` },
        { url: `https://example.com/${title}/b` },
      ]);
    }
    await t.settle();
  }

  /** The user drags the group on the strip so that its first tab lands at `index`. */
  async function drag(title: string, index: number) {
    const { chromeGroupId } = await groupNamed(title);
    if (chromeGroupId === undefined) throw new Error(`${title} is not on the strip`);
    await t.api.moveGroup(chromeGroupId, index);
    await t.settle();
  }

  it('moves the tile of a group dragged on the strip', async () => {
    await openGroups('A', 'B', 'C');

    await drag('C', 1);

    expect(await strip()).toEqual(['·', 'C', 'A', 'B']);
    expect(await tiles()).toEqual(['C', 'A', 'B']);
  });

  it('moves only the dragged tile', async () => {
    await openGroups('A', 'B', 'C', 'D');
    const place = vi.spyOn(t.groups, 'place');

    await drag('A', 7);

    expect(await tiles()).toEqual(['B', 'C', 'D', 'A']);
    expect(place).toHaveBeenCalledTimes(1);
  });

  it('keeps stowed groups in their places', async () => {
    await openGroups('A', 'B', 'C', 'D');
    const b = await groupNamed('B');
    expectOk(await t.command({ type: 'stowGroup', groupId: b.id }));

    await drag('D', 1);

    expect(await strip()).toEqual(['·', 'D', 'A', 'C']);
    expect(await tiles()).toEqual(['D', 'B', 'A', 'C']);
    expect((await groupNamed('B')).order).toBe(b.order);
  });

  it('reorders tiles within their own space only', async () => {
    await openGroups('A', 'B', 'X', 'Y');
    const work = await t.spaces.create('Работа');
    await t.groups.move((await groupNamed('X')).id, work.id);
    await t.groups.move((await groupNamed('Y')).id, work.id);

    // Y goes in front of the groups of «Входящие».
    await drag('Y', 1);

    expect(await strip()).toEqual(['·', 'Y', 'A', 'B', 'X']);
    expect(await tiles()).toEqual(['A', 'B']);
    expect(await tiles(work.id)).toEqual(['Y', 'X']);
  });

  it('writes nothing when the order of groups did not change', async () => {
    await openGroups('A', 'B');
    const place = vi.spyOn(t.groups, 'place');

    await drag('A', 1);

    expect(await tiles()).toEqual(['A', 'B']);
    expect(place).not.toHaveBeenCalled();
  });

  it('does not move tiles back after TabFlow arranges the strip', async () => {
    await openGroups('A', 'B', 'C');
    const inbox = await t.spaces.ensureDefault();
    await t.groups.place((await groupNamed('C')).id, inbox.id, 0); // a drag in TabFlow
    const place = vi.spyOn(t.groups, 'place');

    const result = expectOk(await t.command({ type: 'arrangeGroups' }));

    expect(result.groups).toBe(3);
    expect(await strip()).toEqual(['·', 'C', 'A', 'B']);
    expect(await tiles()).toEqual(['C', 'A', 'B']);
    expect(place).not.toHaveBeenCalled();
  });

  it('does not move tiles after a restored group takes its place', async () => {
    await openGroups('A', 'B', 'C');
    const a = await groupNamed('A');
    expectOk(await t.command({ type: 'stowGroup', groupId: a.id }));
    const place = vi.spyOn(t.groups, 'place');

    expectOk(await t.command({ type: 'restoreGroup', groupId: a.id }));

    expect(await strip()).toEqual(['·', 'A', 'B', 'C']);
    expect(await tiles()).toEqual(['A', 'B', 'C']);
    expect(place).not.toHaveBeenCalled();
  });
});

describe('placeMoves', () => {
  function apply(list: string[], moves: [string, number][]) {
    const result = [...list];
    for (const [id, index] of moves) {
      result.splice(result.indexOf(id), 1);
      result.splice(index, 0, id);
    }
    return result;
  }

  it('moves one item for a single drag', () => {
    expect(placeMoves(['a', 'b', 'c', 'd'], ['b', 'c', 'd', 'a'], new Set())).toEqual([['a', 3]]);
    expect(placeMoves(['a', 'b', 'c', 'd'], ['d', 'a', 'b', 'c'], new Set())).toEqual([['d', 0]]);
  });

  it('moves nothing when the order is the same', () => {
    expect(placeMoves(['a', 'b'], ['a', 'b'], new Set())).toEqual([]);
  });

  it('reaches every order and never moves fixed items', () => {
    const current = ['a', 's', 'b', 'c', 't', 'd'];
    const fixed = new Set(['s', 't']);
    const open = ['a', 'b', 'c', 'd'];
    for (const order of permutations(open)) {
      const queue = [...order];
      const desired = current.map((id) => (fixed.has(id) ? id : (queue.shift() ?? id)));
      const moves = placeMoves(current, desired, fixed);
      expect(apply(current, moves)).toEqual(desired);
      expect(moves.some(([id]) => fixed.has(id))).toBe(false);
    }
  });
});

function permutations(items: readonly string[]): string[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}
