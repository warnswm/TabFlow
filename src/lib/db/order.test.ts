import { describe, expect, it } from 'vitest';
import { ORDER_STEP, orderAfterLast, orderBetween } from './order';

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
