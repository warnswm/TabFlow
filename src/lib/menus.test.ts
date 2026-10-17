import { describe, expect, it } from 'vitest';
import type { Space, TabGroup } from './db/models';
import { isCommand } from './messages';
import { buildMenu, MENU_GROUP_LIMIT, MENU_IDS, menuCommand } from './menus';

const space = (id: string, name: string): Space => ({
  id,
  name,
  order: 1,
  isDefault: false,
  createdAt: 0,
  updatedAt: 0,
});

const group = (id: string, title: string, spaceId: string, updatedAt: number): TabGroup => ({
  id,
  spaceId,
  title,
  color: 'blue',
  state: 'stowed',
  order: 1,
  createdAt: 0,
  updatedAt,
});

describe('context menu', () => {
  const spaces = [space('w', 'Работа'), space('l', 'Учёба')];

  it('has the page, link and icon items, the queue ones greyed out', () => {
    const menu = buildMenu([], spaces);
    expect(menu.map((item) => [item.id, item.contexts.join(',')])).toEqual([
      ['stow', 'page'],
      ['sleep', 'page'],
      ['queue-page', 'page'],
      ['save-link', 'link'],
      ['queue-link', 'link'],
      ['collapse-all', 'action'],
      ['open-app', 'action'],
    ]);
    expect(menu.filter((item) => item.enabled === false).map((item) => item.id)).toEqual([
      'queue-page',
      'queue-link',
    ]);
  });

  it('lists the most recently changed groups under «В группу ▸» with their space', () => {
    const menu = buildMenu(
      [
        group('a', 'React', 'l', 10),
        group('b', 'Chrome Extensions API', 'w', 30),
        group('c', '', 'w', 20),
        group('d', 'В удалённом пространстве', 'gone', 40),
      ],
      spaces,
    );
    const submenu = menu.filter((item) => item.parentId === MENU_IDS.toGroup);
    expect(submenu.map((item) => item.title)).toEqual([
      'Chrome Extensions API · Работа',
      'Без названия · Работа',
      'React · Учёба',
    ]);
    expect(submenu.every((item) => item.contexts.join() === 'page,link')).toBe(true);
    expect(menu.some((item) => item.separator)).toBe(true);
  });

  it('keeps the submenu short and the titles readable', () => {
    const many = Array.from({ length: 15 }, (_, i) => group(`g${i}`, 'x'.repeat(80), 'w', i));
    const submenu = buildMenu(many, spaces).filter((item) => item.parentId !== undefined);
    expect(submenu).toHaveLength(MENU_GROUP_LIMIT);
    expect(submenu[0]?.title).toMatch(/^x{47}… · Работа$/);
  });

  it('turns clicks into commands', () => {
    expect(menuCommand({ itemId: 'stow', tabId: 5 })).toEqual({
      type: 'stowCurrent',
      chromeTabId: 5,
    });
    expect(menuCommand({ itemId: 'sleep', tabId: -1 })).toEqual({ type: 'sleepCurrent' });
    expect(menuCommand({ itemId: 'save-link', tabId: 5, linkUrl: 'https://a.example/' })).toEqual({
      type: 'saveLink',
      url: 'https://a.example/',
    });
    expect(menuCommand({ itemId: 'group:g1', tabId: 5 })).toEqual({
      type: 'saveToGroup',
      chromeTabId: 5,
      groupId: 'g1',
    });
    expect(menuCommand({ itemId: 'group:g1', tabId: 5, linkUrl: 'https://a.example/' })).toEqual({
      type: 'saveLink',
      url: 'https://a.example/',
      groupId: 'g1',
    });
    expect(menuCommand({ itemId: 'collapse-all' })).toEqual({ type: 'collapseAll' });
    expect(menuCommand({ itemId: 'open-app' })).toEqual({ type: 'openApp' });
    expect(menuCommand({ itemId: 'queue-page', tabId: 5 })).toBeUndefined();
    expect(menuCommand({ itemId: 'group:g1' })).toBeUndefined();
  });

  it('makes commands the background accepts', () => {
    const clicks = [
      { itemId: 'stow', tabId: 5 },
      { itemId: 'sleep' },
      { itemId: 'save-link', linkUrl: 'https://a.example/' },
      { itemId: 'group:g1', tabId: 5 },
      { itemId: 'group:g1', linkUrl: 'https://a.example/' },
      { itemId: 'collapse-all' },
      { itemId: 'open-app' },
    ];
    for (const click of clicks) expect(isCommand(menuCommand(click))).toBe(true);
  });
});
