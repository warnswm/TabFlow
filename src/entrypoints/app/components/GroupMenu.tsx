import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  Columns2,
  Ellipsis,
  Eye,
  FolderInput,
  List,
  Moon,
  Pencil,
  Sun,
  Trash,
} from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import type { Space, TabGroup } from '@/lib/db';
import { localized } from '@/lib/i18n';
import { moveGroupToSpace, runCommand } from '../commands';
import { useUi } from '../store';
import { BUTTON_ICON, MENU_CONTENT, MENU_ITEM, MENU_SEPARATOR } from '../ui';

interface GroupMenuProps {
  group: TabGroup;
  spaces: readonly Space[];
  onOpenLinks: () => void;
  onEdit: () => void;
  onRestore: () => void;
}

const text = localized({
  ru: {
    actions: 'Действия с группой',
    show: 'Показать на панели',
    sleep: 'Усыпить',
    wake: 'Разбудить',
    restore: 'Вернуть на панель',
    stow: 'Убрать в TabFlow',
    links: 'Ссылки',
    sideBySide: 'Рядом…',
    edit: 'Название и цвет',
    moveTo: 'Перенести в',
    delete: 'Удалить',
  },
  en: {
    actions: 'Group actions',
    show: 'Show on the tab strip',
    sleep: 'Put to sleep',
    wake: 'Wake',
    restore: 'Restore to the tab strip',
    stow: 'Stow in TabFlow',
    links: 'Links',
    sideBySide: 'Side by side…',
    edit: 'Title and color',
    moveTo: 'Move to',
    delete: 'Delete',
  },
});

export function GroupMenu({ group, spaces, onOpenLinks, onEdit, onRestore }: GroupMenuProps) {
  const t = text();
  const name = group.title;
  const otherSpaces = spaces.filter((space) => space.id !== group.spaceId);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger aria-label={t.actions} className={BUTTON_ICON}>
        <Ellipsis aria-hidden className="size-4" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className={MENU_CONTENT}>
          {group.state === 'active' && (
            <>
              <DropdownMenu.Item className={MENU_ITEM} onSelect={onRestore}>
                <Eye aria-hidden /> {t.show}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={MENU_ITEM}
                onSelect={() => runCommand({ type: 'sleepGroup', groupId: group.id }, { name })}
              >
                <Moon aria-hidden /> {t.sleep}
              </DropdownMenu.Item>
            </>
          )}
          {group.state === 'asleep' && (
            <DropdownMenu.Item className={MENU_ITEM} onSelect={onRestore}>
              <Sun aria-hidden /> {t.wake}
            </DropdownMenu.Item>
          )}
          {group.state === 'stowed' ? (
            <DropdownMenu.Item className={MENU_ITEM} onSelect={onRestore}>
              <ArchiveRestore aria-hidden /> {t.restore}
            </DropdownMenu.Item>
          ) : (
            <DropdownMenu.Item
              className={MENU_ITEM}
              onSelect={() => runCommand({ type: 'stowGroup', groupId: group.id }, { name })}
            >
              <Archive aria-hidden /> {t.stow}
            </DropdownMenu.Item>
          )}

          <DropdownMenu.Separator className={MENU_SEPARATOR} />
          <DropdownMenu.Item className={MENU_ITEM} onSelect={onOpenLinks}>
            <List aria-hidden /> {t.links}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={MENU_ITEM}
            onSelect={() => useUi.getState().openTileDialog(group.id)}
          >
            <Columns2 aria-hidden /> {t.sideBySide}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={MENU_ITEM} onSelect={onEdit}>
            <Pencil aria-hidden /> {t.edit}
          </DropdownMenu.Item>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={MENU_ITEM} disabled={otherSpaces.length === 0}>
              <FolderInput aria-hidden /> {t.moveTo}
              <ChevronRight aria-hidden className="ml-auto" />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent sideOffset={6} className={MENU_CONTENT}>
                {otherSpaces.map((space) => (
                  <DropdownMenu.Item
                    key={space.id}
                    className={MENU_ITEM}
                    onSelect={() => void moveGroupToSpace(group, space)}
                  >
                    <span className="truncate">{space.name}</span>
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>

          <DropdownMenu.Separator className={MENU_SEPARATOR} />
          <DropdownMenu.Item
            className={`${MENU_ITEM} text-danger data-highlighted:text-danger`}
            onSelect={() => runCommand({ type: 'deleteGroup', groupId: group.id }, { name })}
          >
            <Trash aria-hidden /> {t.delete}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
