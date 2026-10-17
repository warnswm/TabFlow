import {
  Archive,
  ArchiveRestore,
  ChevronRight,
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
import { moveGroupToSpace, runCommand } from '../commands';
import { BUTTON_ICON, MENU_CONTENT, MENU_ITEM, MENU_SEPARATOR } from '../ui';

interface GroupMenuProps {
  group: TabGroup;
  spaces: readonly Space[];
  onOpenLinks: () => void;
  onEdit: () => void;
  onRestore: () => void;
}

export function GroupMenu({ group, spaces, onOpenLinks, onEdit, onRestore }: GroupMenuProps) {
  const name = group.title;
  const otherSpaces = spaces.filter((space) => space.id !== group.spaceId);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger aria-label="Действия с группой" className={BUTTON_ICON}>
        <Ellipsis aria-hidden className="size-4" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className={MENU_CONTENT}>
          {group.state === 'active' && (
            <>
              <DropdownMenu.Item className={MENU_ITEM} onSelect={onRestore}>
                <Eye aria-hidden /> Показать на панели
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={MENU_ITEM}
                onSelect={() => runCommand({ type: 'sleepGroup', groupId: group.id }, { name })}
              >
                <Moon aria-hidden /> Усыпить
              </DropdownMenu.Item>
            </>
          )}
          {group.state === 'asleep' && (
            <DropdownMenu.Item className={MENU_ITEM} onSelect={onRestore}>
              <Sun aria-hidden /> Разбудить
            </DropdownMenu.Item>
          )}
          {group.state === 'stowed' ? (
            <DropdownMenu.Item className={MENU_ITEM} onSelect={onRestore}>
              <ArchiveRestore aria-hidden /> Вернуть на панель
            </DropdownMenu.Item>
          ) : (
            <DropdownMenu.Item
              className={MENU_ITEM}
              onSelect={() => runCommand({ type: 'stowGroup', groupId: group.id }, { name })}
            >
              <Archive aria-hidden /> Убрать в TabFlow
            </DropdownMenu.Item>
          )}

          <DropdownMenu.Separator className={MENU_SEPARATOR} />
          <DropdownMenu.Item className={MENU_ITEM} onSelect={onOpenLinks}>
            <List aria-hidden /> Ссылки
          </DropdownMenu.Item>
          <DropdownMenu.Item className={MENU_ITEM} onSelect={onEdit}>
            <Pencil aria-hidden /> Название и цвет
          </DropdownMenu.Item>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={MENU_ITEM} disabled={otherSpaces.length === 0}>
              <FolderInput aria-hidden /> Перенести в
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
            <Trash aria-hidden /> Удалить
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
