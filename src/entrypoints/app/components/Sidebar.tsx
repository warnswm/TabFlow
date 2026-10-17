import { useDndContext, useDndMonitor, useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CornerDownLeft, Folder, Inbox, Plus, Settings, Trash } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { type CSSProperties, type HTMLAttributes, useState } from 'react';
import type { Overview, SpaceView } from '@/lib/app/overview';
import { applyOrder, moveId } from '@/lib/app/reorder';
import type { Route } from '@/lib/app/route';
import { routeHash } from '@/lib/app/route';
import { count, GROUPS, plural, TABS } from '@/lib/command-messages';
import { type Id, repositories } from '@/lib/db';
import type { RestoreMode } from '@/lib/messages';
import { BADGE_MODE_LABEL, type BadgeMode } from '@/lib/summary';
import { moveGroupToSpace } from '../commands';
import { type DragData, dragData, ZONE_ID } from '../dnd';
import { useUi } from '../store';
import { MENU_CONTENT, MENU_ITEM, MENU_SEPARATOR } from '../ui';
import { SpaceNameDialog } from './SpaceDialogs';

const NAV_ITEM =
  'flex h-9 items-center gap-2.5 rounded-md px-2 text-fg transition-colors duration-(--duration-fast) hover:bg-surface-raised [&_svg]:size-4 [&_svg]:shrink-0';
const NAV_ITEM_CURRENT =
  'flex h-9 items-center gap-2.5 rounded-md bg-accent-soft px-2 font-semibold text-accent [&_svg]:size-4 [&_svg]:shrink-0';

const RESTORE_MODE_LABEL: Record<RestoreMode, string> = {
  placeholder: 'Заглушки TabFlow — сайты не грузятся',
  background: 'Сайты, выгрузка в фоне',
};

const SIDEBAR_ZONE: DragData = { type: 'zone', zone: 'sidebar' };
const SPACES_ZONE: DragData = { type: 'zone', zone: 'spaces' };

interface SidebarProps {
  overview: Overview;
  route: Route;
  /** The space shown now (the route may have none: «Входящие»). */
  currentSpaceId?: Id;
}

export function Sidebar({ overview, route, currentSpaceId }: SidebarProps) {
  const creating = useUi((state) => state.newSpaceOpen);
  const setCreating = useUi((state) => state.setNewSpaceOpen);
  const { groupsByState, tabsOutOfMemory, tabCount } = overview;
  const share = tabCount === 0 ? 0 : Math.round((tabsOutOfMemory / tabCount) * 100);

  const inbox = overview.spaces.find(({ space }) => space.isDefault);
  const others = overview.spaces.filter(({ space }) => !space.isDefault);
  // Right after a drop the new order is shown until the database change arrives.
  const [dropped, setDropped] = useState<{ base: readonly SpaceView[]; ids: string[] }>();
  const ordered =
    dropped?.base === overview.spaces
      ? applyOrder(others, dropped.ids, (item) => item.space.id)
      : others;

  useDndMonitor({
    onDragEnd({ active, over }) {
      const moved = dragData(active);
      const target = dragData(over);
      if (target?.type !== 'space') return;
      if (moved?.type === 'group') {
        if (moved.group.spaceId !== target.space.id)
          void moveGroupToSpace(moved.group, target.space);
        return;
      }
      if (moved?.type !== 'space' || moved.space.id === target.space.id) return;
      const ids = ordered.map((item) => item.space.id);
      // Dropped on «Входящие»: first after it.
      const next = target.space.isDefault
        ? [moved.space.id, ...ids.filter((id) => id !== moved.space.id)]
        : moveId(ids, moved.space.id, target.space.id);
      setDropped({ base: overview.spaces, ids: next });
      repositories.spaces.place(moved.space.id, next.indexOf(moved.space.id)).catch(() => {
        setDropped(undefined);
        useUi.getState().showToast('Порядок не сохранён — пространства остались на своих местах.');
      });
    },
  });

  const draggingGroup = dragData(useDndContext().active)?.type === 'group';
  // Where the pointer is while a tile is dragged (see `collisionDetection`).
  const { setNodeRef: setSidebarZone } = useDroppable({ id: ZONE_ID.sidebar, data: SIDEBAR_ZONE });
  const { setNodeRef: setSpacesZone } = useDroppable({ id: ZONE_ID.spaces, data: SPACES_ZONE });

  const link = (view: SpaceView) => ({
    view,
    current: route.view === 'space' && view.space.id === currentSpaceId,
  });

  return (
    <nav
      ref={setSidebarZone}
      aria-label="Разделы"
      className="flex w-60 shrink-0 flex-col gap-6 border-r border-border bg-bg-sunken px-3 py-5"
    >
      <div className="flex items-center gap-2.5 px-2">
        <span className="flex size-[30px] items-center justify-center rounded-md bg-accent text-on-accent">
          <svg
            aria-hidden
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="4" width="7" height="7" rx="1.5" />
            <rect x="14" y="4" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <path d="M14 17.5h7" />
          </svg>
        </span>
        <span className="text-[17px] font-bold tracking-[-0.01em]">TabFlow</span>
      </div>

      <div className="flex flex-col gap-0.5">
        <h2 className="px-2 pb-1.5 text-[11px] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
          Пространства
        </h2>
        <div ref={setSpacesZone} className="flex flex-col gap-0.5">
          {inbox && <InboxLink {...link(inbox)} />}
          <SortableContext
            items={ordered.map((item) => item.space.id)}
            strategy={verticalListSortingStrategy}
          >
            {ordered.map((view) => (
              <SortableSpaceLink key={view.space.id} {...link(view)} />
            ))}
          </SortableContext>
        </div>
        {draggingGroup ? (
          // Below the list, so the spaces under the pointer do not shift while dragging.
          <p className="min-h-9 px-2 py-2 text-xs text-fg-muted">
            Отпустить на пространстве — группа перейдёт туда.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className={`${NAV_ITEM} text-fg-muted`}
          >
            <Plus aria-hidden />
            Новое пространство
          </button>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <a
          href={routeHash({ view: 'trash' })}
          aria-current={route.view === 'trash' ? 'page' : undefined}
          className={route.view === 'trash' ? NAV_ITEM_CURRENT : NAV_ITEM}
        >
          <Trash aria-hidden className={route.view === 'trash' ? '' : 'text-fg-muted'} />
          Корзина
        </a>
      </div>

      <div className="mt-auto flex flex-col gap-3">
        <section
          aria-label="Не в памяти"
          className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-3.5"
        >
          <span className="text-xs text-fg-muted">Не в памяти</span>
          <span className="font-mono text-[22px] leading-7">
            {tabsOutOfMemory}
            <span className="ml-1.5 font-sans text-sm text-fg-muted">
              {plural(tabsOutOfMemory, TABS)}
            </span>
          </span>
          <div
            role="meter"
            aria-label="Доля вкладок не в памяти"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={share}
            className="h-1 overflow-hidden rounded-full bg-border"
          >
            <div className="h-1 bg-accent" style={{ width: `${share}%` }} />
          </div>
          <span className="text-xs text-fg-subtle">
            {count(groupsByState.asleep, GROUPS)}{' '}
            {plural(groupsByState.asleep, ['спит', 'спят', 'спят'])} · {groupsByState.stowed}{' '}
            {plural(groupsByState.stowed, ['убрана', 'убраны', 'убраны'])}
          </span>
        </section>
        <SettingsMenu />
      </div>

      <SpaceNameDialog open={creating} onOpenChange={setCreating} />
    </nav>
  );
}

/**
 * A space while a tile is dragged: `candidate` — can take the group (dashed outline),
 * `over` — the group goes here when dropped, `home` — the group is already here.
 */
type DropState = 'none' | 'candidate' | 'over' | 'home';

const DROP_STYLE: Record<DropState, string> = {
  none: '',
  candidate: 'outline-1 -outline-offset-1 outline-dashed outline-border-control',
  over: 'ring-2 ring-focus ring-inset',
  home: 'opacity-50',
};

function dropState(moved: DragData | undefined, isOver: boolean, spaceId: Id): DropState {
  if (moved?.type !== 'group') return 'none';
  if (moved.group.spaceId === spaceId) return 'home';
  return isOver ? 'over' : 'candidate';
}

interface SpaceLinkProps {
  view: SpaceView;
  current: boolean;
}

/** «Входящие»: always first, not sorted, but a tile can be dropped on it. */
function InboxLink({ view, current }: SpaceLinkProps) {
  const data: DragData = { type: 'space', space: view.space };
  const { setNodeRef, isOver, active } = useDroppable({ id: view.space.id, data });
  return (
    <SpaceLinkBody
      ref={setNodeRef}
      view={view}
      current={current}
      drop={dropState(dragData(active), isOver, view.space.id)}
    />
  );
}

/** Other spaces: sorted by dragging (Space with the keyboard), and targets for tiles. */
function SortableSpaceLink({ view, current }: SpaceLinkProps) {
  const data: DragData = { type: 'space', space: view.space };
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver, active } =
    useSortable({ id: view.space.id, data, attributes: { roleDescription: 'пространство' } });
  return (
    <SpaceLinkBody
      ref={setNodeRef}
      view={view}
      current={current}
      drop={dropState(dragData(active), isOver, view.space.id)}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      dragging={isDragging}
      // A link keeps its own role and focus; only the drag description is added.
      dragProps={{ ...listeners, 'aria-describedby': attributes['aria-describedby'] }}
    />
  );
}

interface SpaceLinkBodyProps extends SpaceLinkProps {
  ref: (element: HTMLElement | null) => void;
  drop: DropState;
  style?: CSSProperties;
  dragging?: boolean;
  dragProps?: HTMLAttributes<HTMLAnchorElement>;
}

function SpaceLinkBody({
  ref,
  view,
  current,
  drop,
  style,
  dragging,
  dragProps,
}: SpaceLinkBodyProps) {
  const { space, tabCount } = view;
  return (
    <a
      ref={ref}
      href={routeHash({ view: 'space', spaceId: space.id })}
      aria-current={current ? 'page' : undefined}
      draggable={false}
      style={style}
      {...dragProps}
      className={`${current || drop === 'over' ? NAV_ITEM_CURRENT : NAV_ITEM} ${DROP_STYLE[drop]} ${dragging ? 'opacity-40' : ''}`}
    >
      {space.isDefault ? (
        <Inbox aria-hidden className={current ? '' : 'text-fg-muted'} />
      ) : (
        <Folder aria-hidden className={current ? '' : 'text-fg-muted'} />
      )}
      <span className="min-w-0 truncate">{space.name}</span>
      {drop === 'over' ? (
        <span className="ml-auto flex items-center gap-1 text-xs">
          <CornerDownLeft aria-hidden />
          сюда
        </span>
      ) : (
        <span
          className={`ml-auto font-mono text-xs ${current ? '' : 'text-fg-muted'}`}
          aria-label={count(tabCount, TABS)}
        >
          {tabCount}
        </span>
      )}
    </a>
  );
}

/** What follows the pointer while a space is dragged. */
export function SpaceGhost({ view }: { view: SpaceView }) {
  return (
    <div className={`${NAV_ITEM} cursor-grabbing bg-surface-raised shadow-drag`}>
      <Folder aria-hidden className="text-fg-muted" />
      <span className="min-w-0 truncate">{view.space.name}</span>
      <span className="ml-auto font-mono text-xs text-fg-muted">{view.tabCount}</span>
    </div>
  );
}

/** Until the settings page (stage 7): how stowed groups come back, what the badge counts. */
function SettingsMenu() {
  const restoreMode = useUi((state) => state.restoreMode);
  const setRestoreMode = useUi((state) => state.setRestoreMode);
  const badgeMode = useUi((state) => state.badgeMode);
  const setBadgeMode = useUi((state) => state.setBadgeMode);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={`${NAV_ITEM} text-fg-muted`}>
        <Settings aria-hidden />
        Настройки
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side="top" align="start" sideOffset={4} className={MENU_CONTENT}>
          <DropdownMenu.Label className="px-2 py-1.5 text-xs text-fg-subtle">
            Как возвращать группу
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={restoreMode}
            onValueChange={(value) => setRestoreMode(value as RestoreMode)}
          >
            {(Object.keys(RESTORE_MODE_LABEL) as RestoreMode[]).map((mode) => (
              <DropdownMenu.RadioItem
                key={mode}
                value={mode}
                className={`${MENU_ITEM} pl-7 relative`}
              >
                <DropdownMenu.ItemIndicator className="absolute left-2 flex">
                  <span aria-hidden className="size-2 rounded-full bg-current" />
                </DropdownMenu.ItemIndicator>
                {RESTORE_MODE_LABEL[mode]}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className={MENU_SEPARATOR} />
          <DropdownMenu.Label className="px-2 py-1.5 text-xs text-fg-subtle">
            Число на значке TabFlow
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={badgeMode}
            onValueChange={(value) => setBadgeMode(value as BadgeMode)}
          >
            {(Object.keys(BADGE_MODE_LABEL) as BadgeMode[]).map((mode) => (
              <DropdownMenu.RadioItem
                key={mode}
                value={mode}
                className={`${MENU_ITEM} pl-7 relative`}
              >
                <DropdownMenu.ItemIndicator className="absolute left-2 flex">
                  <span aria-hidden className="size-2 rounded-full bg-current" />
                </DropdownMenu.ItemIndicator>
                {BADGE_MODE_LABEL[mode]}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
