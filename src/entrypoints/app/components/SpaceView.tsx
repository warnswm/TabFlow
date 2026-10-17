import { useDndMonitor } from '@dnd-kit/core';
import { rectSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import { Ellipsis, Minimize2, Pencil, Search, Trash } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useMemo, useState } from 'react';
import { emptyFilterText, filterGroups, STATE_FILTERS, stateCounts } from '@/lib/app/filters';
import type { GroupView, Overview, SpaceView as SpaceData } from '@/lib/app/overview';
import { applyOrder, moveId } from '@/lib/app/reorder';
import { matchesByGroup, type SearchIndex } from '@/lib/app/search';
import { count, GROUPS, TABS } from '@/lib/command-messages';
import { type Id, repositories } from '@/lib/db';
import { runCommand } from '../commands';
import { dragData } from '../dnd';
import { useNow } from '../hooks';
import { useUi } from '../store';
import { BUTTON_ICON, BUTTON_PRIMARY, MENU_CONTENT, MENU_ITEM } from '../ui';
import { EditGroupDialog, GroupLinksDialog } from './GroupDialogs';
import { GroupTile } from './GroupTile';
import { DeleteSpaceDialog, SpaceNameDialog } from './SpaceDialogs';

/**
 * Tiles stretch with the window: at most 4 per row (a column is never narrower than a quarter
 * of the row minus the 16 px gaps), fewer when a tile would get narrower than 260 px.
 */
const TILE_GRID =
  'grid grid-cols-[repeat(auto-fill,minmax(max(260px,calc((100%_-_3*16px)/4)),1fr))] gap-x-4 gap-y-5';

type OpenDialog =
  { kind: 'links' | 'edit'; groupId: Id } | { kind: 'renameSpace' | 'deleteSpace' } | undefined;

const CHIP =
  'flex h-7 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors duration-(--duration-fast)';
const CHIP_ON = 'border-accent-soft bg-accent-soft text-accent';
const CHIP_OFF = 'border-border bg-transparent text-fg-muted hover:text-fg';

const NO_TERMS: readonly string[] = [];

interface SpaceViewProps {
  view: SpaceData;
  overview: Overview;
  index: SearchIndex;
}

export function SpaceView({ view, overview, index }: SpaceViewProps) {
  const spaces = overview.spaces.map((item) => item.space);
  const now = useNow();
  const [dialog, setDialog] = useState<OpenDialog>();
  const close = (open: boolean) => !open && setDialog(undefined);
  // Looked up on every render, so an open dialog follows live changes of the group.
  const dialogGroup =
    dialog && 'groupId' in dialog
      ? view.groups.find(({ group }) => group.id === dialog.groupId)
      : undefined;
  const { space, groups, tabCount } = view;

  const search = useUi((state) => state.search);
  const stateFilter = useUi((state) => state.stateFilter);
  const setStateFilter = useUi((state) => state.setStateFilter);
  const hits = useMemo(() => index.search(search, space.id), [index, search, space.id]);
  const matches = useMemo(() => hits && matchesByGroup(hits), [hits]);
  const counts = stateCounts(groups, matches);

  // Right after a drop the new order is shown until the database change arrives.
  const [dropped, setDropped] = useState<{ base: readonly GroupView[]; ids: string[] }>();
  const ordered =
    dropped?.base === groups ? applyOrder(groups, dropped.ids, (item) => item.group.id) : groups;
  const shown = filterGroups(ordered, stateFilter, matches);
  // Positions only make sense in the full list: no dragging while it is filtered.
  const sortable = search.trim() === '' && stateFilter === 'all';

  useDndMonitor({
    onDragEnd({ active, over }) {
      const moved = dragData(active);
      const target = dragData(over);
      if (moved?.type !== 'group' || target?.type !== 'group' || active.id === over?.id) return;
      if (moved.group.spaceId !== space.id) return;
      const ids = moveId(
        ordered.map((item) => item.group.id),
        moved.group.id,
        target.group.id,
      );
      setDropped({ base: groups, ids });
      repositories.groups.place(moved.group.id, space.id, ids.indexOf(moved.group.id)).catch(() => {
        setDropped(undefined);
        useUi.getState().showToast('Порядок не сохранён — группы остались на своих местах.');
      });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="mr-1 text-xl font-bold tracking-[-0.02em]">{space.name}</h1>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger aria-label="Действия с пространством" className={BUTTON_ICON}>
            <Ellipsis aria-hidden className="size-4" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="start" sideOffset={4} className={MENU_CONTENT}>
              <DropdownMenu.Item
                className={MENU_ITEM}
                onSelect={() => setDialog({ kind: 'renameSpace' })}
              >
                <Pencil aria-hidden /> Переименовать
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={`${MENU_ITEM} text-danger data-highlighted:text-danger`}
                disabled={space.isDefault}
                onSelect={() => setDialog({ kind: 'deleteSpace' })}
              >
                <Trash aria-hidden />
                {space.isDefault ? '«Входящие» не удаляются' : 'Удалить'}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <SearchField />

        <button
          type="button"
          onClick={() => runCommand({ type: 'collapseAll' })}
          className={BUTTON_PRIMARY}
        >
          <Minimize2 aria-hidden className="size-4" />
          Свернуть всё
        </button>
      </header>

      {groups.length > 0 && (
        <div role="group" aria-label="Фильтр по состоянию" className="flex flex-wrap gap-2">
          {STATE_FILTERS.map(({ value, label }) => {
            const pressed = stateFilter === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={pressed}
                onClick={() => setStateFilter(value)}
                className={`${CHIP} ${pressed ? CHIP_ON : CHIP_OFF}`}
              >
                {label}
                <span className="font-mono text-[11px] opacity-80">{counts[value]}</span>
              </button>
            );
          })}
        </div>
      )}

      <section aria-labelledby="groups-heading" className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2.5">
          <h2 id="groups-heading" className="text-md font-semibold">
            Группы
          </h2>
          <span className="text-sm text-fg-muted">
            {count(groups.length, GROUPS)} · {count(tabCount, TABS)}
          </span>
        </div>

        {groups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-fg-muted">
            {space.isDefault
              ? 'Здесь появятся группы. Нажмите «Свернуть всё» или создайте группу вкладок в Chrome.'
              : 'Групп пока нет. Сюда можно перетащить плитку из другого пространства — на его название слева.'}
          </p>
        ) : shown.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-fg-muted">
            {emptyFilterText(stateFilter, search)}
          </p>
        ) : (
          <SortableContext
            items={shown.map((item) => item.group.id)}
            strategy={rectSortingStrategy}
          >
            <div className={TILE_GRID}>
              {shown.map((groupView) => (
                <GroupTile
                  key={groupView.group.id}
                  view={groupView}
                  spaces={spaces}
                  now={now}
                  match={matches?.get(groupView.group.id)}
                  terms={hits?.terms ?? NO_TERMS}
                  sortable={sortable}
                  onOpenLinks={() => setDialog({ kind: 'links', groupId: groupView.group.id })}
                  onEdit={() => setDialog({ kind: 'edit', groupId: groupView.group.id })}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </section>

      <GroupLinksDialog
        view={dialogGroup}
        spaces={overview.spaces}
        terms={hits?.terms ?? NO_TERMS}
        open={dialog?.kind === 'links' && dialogGroup !== undefined}
        onOpenChange={close}
      />
      <EditGroupDialog
        group={dialogGroup?.group}
        open={dialog?.kind === 'edit' && dialogGroup !== undefined}
        onOpenChange={close}
      />
      <SpaceNameDialog space={space} open={dialog?.kind === 'renameSpace'} onOpenChange={close} />
      <DeleteSpaceDialog view={view} open={dialog?.kind === 'deleteSpace'} onOpenChange={close} />
    </div>
  );
}

/** Filters the tiles of the space on the spot; Ctrl+K opens the palette that searches everywhere. */
function SearchField() {
  const search = useUi((state) => state.search);
  const setSearch = useUi((state) => state.setSearch);
  const openPalette = useUi((state) => state.setPaletteOpen);

  return (
    <div className="flex h-9 min-w-0 flex-[1_1_260px] items-center gap-2.5 rounded-md border border-border-control bg-bg px-3 focus-within:outline-2 focus-within:outline-focus">
      <Search aria-hidden className="size-4 shrink-0 text-fg-muted" />
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Поиск по группам и вкладкам"
        aria-label="Поиск по группам и вкладкам этого пространства"
        className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-subtle"
      />
      <button
        type="button"
        onClick={() => openPalette(true)}
        title="Поиск по всем пространствам и команды"
        aria-label="Открыть командную палитру, Ctrl K"
        className="shrink-0 rounded-sm border border-border px-1.5 font-mono text-[11px] text-fg-muted transition-colors duration-(--duration-fast) hover:text-fg"
      >
        Ctrl K
      </button>
    </div>
  );
}
