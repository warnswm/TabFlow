import { describe, expect, it } from 'vitest';
import { setupTestDb } from '../test-utils';

const link = (n: number) => ({
  tabId: `tab-${n}`,
  url: `https://example.com/${n}`,
  title: `Page ${n}`,
});

describe('LayoutRepository', () => {
  it('keeps layouts in the order they were saved, the newest last', async () => {
    const t = setupTestDb();
    const first = await t.layouts.create('  Учёба  ', [link(1), link(2)]);
    const second = await t.layouts.create('Работа', [link(3), link(4), link(5)]);
    expect(first.name).toBe('Учёба');
    expect((await t.layouts.list()).map((layout) => layout.id)).toEqual([first.id, second.id]);
  });

  it('holds two to nine links', async () => {
    const t = setupTestDb();
    const links = (n: number) => Array.from({ length: n }, (_, i) => link(i + 1));
    await expect(t.layouts.create('Одна', links(1))).rejects.toThrow(RangeError);
    await expect(t.layouts.create('Десять', links(10))).rejects.toThrow(RangeError);
    expect((await t.layouts.create('Девять', links(9))).links).toHaveLength(9);
  });

  it('renames a layout', async () => {
    const t = setupTestDb();
    const layout = await t.layouts.create('Учёба', [link(1), link(2)]);
    t.now.value += 1000;
    await t.layouts.rename(layout.id, 'Лекция');
    expect(await t.layouts.get(layout.id)).toMatchObject({
      name: 'Лекция',
      updatedAt: layout.updatedAt + 1000,
    });
  });

  it('deletes a layout for good and puts it back on undo', async () => {
    const t = setupTestDb();
    const layout = await t.layouts.create('Учёба', [link(1), link(2)]);
    const removed = await t.layouts.remove(layout.id);
    expect(await t.layouts.list()).toEqual([]);
    await t.layouts.restore(removed);
    expect(await t.layouts.list()).toEqual([layout]);
    await expect(t.layouts.rename('missing', 'X')).rejects.toThrow('not found');
  });
});

describe('LayoutRepository: where the panes are', () => {
  const rects = [
    { left: 0, top: 0, width: 70, height: 100 },
    { left: 60, top: 10, width: 40, height: 50 },
  ];

  it('keeps the panes moved and resized at will, and goes back to the grid', async () => {
    const t = setupTestDb();
    const layout = await t.layouts.create('Учёба', [link(1), link(2)], rects);
    expect(layout.rects).toEqual(rects);

    const moved = [rects[1] ?? rects[0], rects[0]].filter((r) => r !== undefined);
    await t.layouts.setRects(layout.id, moved);
    expect((await t.layouts.get(layout.id))?.rects).toEqual(moved);

    await t.layouts.setRects(layout.id, undefined);
    expect((await t.layouts.get(layout.id))?.rects).toBeUndefined();
  });

  it('drops rectangles that do not fit the links', async () => {
    const t = setupTestDb();
    const layout = await t.layouts.create('Учёба', [link(1), link(2), link(3)], rects);
    expect(layout.rects).toBeUndefined();
    await t.layouts.setRects(layout.id, rects);
    expect((await t.layouts.get(layout.id))?.rects).toBeUndefined();
  });
});

describe('LayoutRepository: «Добавить»', () => {
  it('appends links up to nine, without repeats; moved panes keep their places', async () => {
    const t = setupTestDb();
    const moved = [
      { left: 0, top: 0, width: 70, height: 100 },
      { left: 60, top: 10, width: 40, height: 50 },
    ];
    const layout = await t.layouts.create('Учёба', [link(1), link(2)], moved);

    const added = await t.layouts.addLinks(layout.id, [link(2), link(3)]);

    expect(added.links.map((l) => l.url)).toEqual([link(1).url, link(2).url, link(3).url]);
    expect(added.rects?.slice(0, 2)).toEqual(moved);
    expect(added.rects).toHaveLength(3);
    expect(await t.layouts.get(layout.id)).toEqual(added);

    const many = Array.from({ length: 10 }, (_, i) => link(i + 10));
    expect((await t.layouts.addLinks(layout.id, many)).links).toHaveLength(9);
  });

  it('keeps the grid for a layout whose panes were not moved', async () => {
    const t = setupTestDb();
    const layout = await t.layouts.create('Учёба', [link(1), link(2)]);
    expect((await t.layouts.addLinks(layout.id, [link(3)])).rects).toBeUndefined();
  });
});
