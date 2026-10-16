import { Ellipsis, Minimize2, Pencil, Trash } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useState } from 'react';
import type { SpaceView as SpaceData } from '@/lib/app/overview';
import { count, GROUPS, TABS } from '@/lib/command-messages';
import type { Id, Space } from '@/lib/db';
import { runCommand } from '../commands';
import { useNow } from '../hooks';
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

export function SpaceView({ view, spaces }: { view: SpaceData; spaces: readonly Space[] }) {
  const now = useNow();
  const [dialog, setDialog] = useState<OpenDialog>();
  const close = (open: boolean) => !open && setDialog(undefined);
  // Looked up on every render, so an open dialog follows live changes of the group.
  const dialogGroup =
    dialog && 'groupId' in dialog
      ? view.groups.find(({ group }) => group.id === dialog.groupId)
      : undefined;
  const { space, groups, tabCount } = view;

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

        <button
          type="button"
          onClick={() => runCommand({ type: 'collapseAll' })}
          className={`ml-auto ${BUTTON_PRIMARY}`}
        >
          <Minimize2 aria-hidden className="size-4" />
          Свернуть всё
        </button>
      </header>

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
              : 'Групп пока нет. Группа переносится сюда через меню «⋯» на её плитке.'}
          </p>
        ) : (
          <div className={TILE_GRID}>
            {groups.map((groupView) => (
              <GroupTile
                key={groupView.group.id}
                view={groupView}
                spaces={spaces}
                now={now}
                onOpenLinks={() => setDialog({ kind: 'links', groupId: groupView.group.id })}
                onEdit={() => setDialog({ kind: 'edit', groupId: groupView.group.id })}
              />
            ))}
          </div>
        )}
      </section>

      <GroupLinksDialog
        view={dialogGroup}
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
