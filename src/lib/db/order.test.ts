import { describe, expect, it } from 'vitest';
import { ORDER_STEP, orderAfterLast, orderBetween, placeAt } from './order';

describe('orderBetween', () => {
  it('starts an empty list at ORDER_STEP', () => {
    expect(orderBetween()).toBe(ORDER_STEP);
  });

  it('places before the first and after the last item', () => {
    expect(orderBetween(undefined, 1024)).toBe(0);
    expect(orderBetween(1024, undefined)).toBe(2048);
  });

  it('places between two neighbours', () => {
    expect(orderBetween(1024, 2048)).toBe(1536);
  });

  it('rejects neighbours in the wrong order', () => {
    expect(() => orderBetween(2048, 1024)).toThrow(RangeError);
  });
});

describe('orderAfterLast', () => {
  it('appends after the largest key regardless of array order', () => {
    expect(orderAfterLast([{ order: 3000 }, { order: 1000 }])).toBe(3000 + ORDER_STEP);
    expect(orderAfterLast([])).toBe(ORDER_STEP);
  });
});

describe('placeAt', () => {
  const list = [
    { id: 'a', order: 1024 },
    { id: 'b', order: 2048 },
    { id: 'c', order: 3072 },
  ];

  it('moves an item of the same list between its new neighbours', () => {
    expect(placeAt(list, 'a', 2)).toEqual({ order: 3072 + ORDER_STEP });
    expect(placeAt(list, 'c', 0)).toEqual({ order: 0 });
    expect(placeAt(list, 'a', 1)).toEqual({ order: 2560 });
  });

  it('inserts an item from another list and clamps the index', () => {
    expect(placeAt(list, 'x', 1)).toEqual({ order: 1536 });
    expect(placeAt(list, 'x', 99)).toEqual({ order: 3072 + ORDER_STEP });
    expect(placeAt([], 'x', 0)).toEqual({ order: ORDER_STEP });
  });

  it('asks to rewrite the whole list when the neighbours are too close', () => {
    const tight = [
      { id: 'a', order: 1 },
      { id: 'b', order: 1 + 1e-9 },
    ];
    expect(placeAt(tight, 'x', 1)).toEqual({ reorder: ['a', 'x', 'b'] });
  });
});
