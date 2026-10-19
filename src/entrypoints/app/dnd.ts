/**
 * Drag & drop on the main page (dnd-kit): tiles inside a space, a tile onto a space in the
 * sidebar, spaces in the sidebar, links in «Ссылки». Space starts and drops with the keyboard
 * (Enter keeps following links), Escape cancels; the screen reader hears it in Russian.
 */
import {
  type Active,
  type Announcements,
  closestCenter,
  type CollisionDetection,
  KeyboardSensor,
  type Modifier,
  type Over,
  PointerSensor,
  pointerWithin,
  type ScreenReaderInstructions,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { getEventCoordinates } from '@dnd-kit/utilities';
import type { SavedTab, Space, TabGroup } from '@/lib/db';
import { localized } from '@/lib/i18n';
import { words } from '@/lib/i18n/words';
import { untitled } from './ui';

export type DragData =
  | { type: 'group'; group: TabGroup }
  /** A space in the sidebar: sorted (not «Входящие») and a target for tiles. */
  | { type: 'space'; space: Space }
  | { type: 'link'; tab: SavedTab }
  /**
   * Areas of the sidebar, only to know where the pointer is (never a drop target): the list of
   * spaces and the whole sidebar.
   */
  | { type: 'zone'; zone: 'spaces' | 'sidebar' };

/** Droppable ids of the sidebar areas. */
export const ZONE_ID = { spaces: 'zone:spaces', sidebar: 'zone:sidebar' } as const;

export function dragData(
  item: Pick<Active | Over, 'data'> | null | undefined,
): DragData | undefined {
  return item?.data.current as DragData | undefined;
}

/** A click (under 6 px of movement) stays a click: opening links, menus, the space. */
export function useDragSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );
}

/**
 * A dragged tile goes to the space under the pointer; in the gaps of the space list — to the
 * nearest space; elsewhere in the sidebar — nowhere (the tile keeps its place, so the grid does
 * not jump); over the grid — among the tiles. A dragged space goes only among spaces.
 * Sidebar rules need a pointer: the keyboard moves a tile among tiles (to a space — «Перенести в»).
 */
export const collisionDetection: CollisionDetection = (args) => {
  const type = dragData(args.active)?.type;
  const only = (kind: DragData['type']) =>
    args.droppableContainers.filter((container) => dragData(container)?.type === kind);
  const pointerIn = (id: string) =>
    pointerWithin({
      ...args,
      droppableContainers: args.droppableContainers.filter((container) => container.id === id),
    }).length > 0;

  if (type === 'group') {
    const spaces = pointerWithin({ ...args, droppableContainers: only('space') });
    if (spaces.length > 0) return spaces.slice(0, 1);
    if (pointerIn(ZONE_ID.spaces)) {
      return closestCenter({ ...args, droppableContainers: only('space') }).slice(0, 1);
    }
    if (pointerIn(ZONE_ID.sidebar)) return [];
    // The tile under the pointer; between tiles — the nearest one.
    const tiles = pointerWithin({ ...args, droppableContainers: only('group') });
    if (tiles.length > 0) return tiles.slice(0, 1);
    return closestCenter({ ...args, droppableContainers: only('group') });
  }
  if (type === 'space') return closestCenter({ ...args, droppableContainers: only('space') });
  return closestCenter(args);
};

/**
 * The drag overlay is a small chip, not a copy of the tile: centred under the pointer, so the
 * spaces in the sidebar stay visible. With the keyboard it simply follows the tile.
 */
export const chipUnderPointer: Modifier = ({
  activatorEvent,
  activeNodeRect,
  overlayNodeRect,
  transform,
}) => {
  const point = activatorEvent && getEventCoordinates(activatorEvent);
  if (!point || !activeNodeRect || !overlayNodeRect) return transform;
  return {
    ...transform,
    x: transform.x + point.x - activeNodeRect.left - overlayNodeRect.width / 2,
    y: transform.y + point.y - activeNodeRect.top - overlayNodeRect.height / 2,
  };
};

const text = localized({
  ru: {
    group: 'группа',
    space: 'пространство',
    link: 'ссылка',
    sidebar: 'боковая панель',
    item: 'элемент',
    picked: (what: string) => `${what} — взято для перемещения.`,
    over: (what: string, target: string) => `${what} — над: ${target}.`,
    outside: (what: string) => `${what} — вне списка.`,
    dropped: (what: string, target: string) => `${what} — перемещено: ${target}.`,
    stayed: (what: string) => `${what} — на месте.`,
    cancelled: (what: string) => `Перемещение отменено. ${what} — на месте.`,
    instructions:
      'Пробел — взять. Стрелки — переместить. Пробел или Enter — поставить, Escape — отменить.',
  },
  en: {
    group: 'group',
    space: 'space',
    link: 'link',
    sidebar: 'sidebar',
    item: 'item',
    picked: (what: string) => `${what} picked up.`,
    over: (what: string, target: string) => `${what} — over: ${target}.`,
    outside: (what: string) => `${what} — outside the list.`,
    dropped: (what: string, target: string) => `${what} moved: ${target}.`,
    stayed: (what: string) => `${what} stays in place.`,
    cancelled: (what: string) => `Move cancelled. ${what} stays in place.`,
    instructions: 'Space — pick up. Arrows — move. Space or Enter — drop, Escape — cancel.',
  },
});

function describe(data: DragData | undefined): string {
  const t = text();
  const quote = words().quote;
  switch (data?.type) {
    case 'group':
      return `${t.group} ${quote(data.group.title || untitled())}`;
    case 'space':
      return `${t.space} ${quote(data.space.name)}`;
    case 'link':
      return `${t.link} ${quote(data.tab.title || data.tab.url)}`;
    case 'zone':
      return t.sidebar;
    default:
      return t.item;
  }
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const announcements: Announcements = {
  onDragStart: ({ active }) => text().picked(capital(describe(dragData(active)))),
  onDragOver: ({ active, over }) =>
    over
      ? text().over(capital(describe(dragData(active))), describe(dragData(over)))
      : text().outside(capital(describe(dragData(active)))),
  onDragEnd: ({ active, over }) =>
    over
      ? text().dropped(capital(describe(dragData(active))), describe(dragData(over)))
      : text().stayed(capital(describe(dragData(active)))),
  onDragCancel: ({ active }) => text().cancelled(capital(describe(dragData(active)))),
};

export const screenReaderInstructions: ScreenReaderInstructions = {
  get draggable() {
    return text().instructions;
  },
};
