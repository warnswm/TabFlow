import {
  Archive,
  ArchiveRestore,
  Check,
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
import { repositories, type Space, type TabGroup } from '@/lib/db';
import { localized } from '@/lib/i18n';
import { words } from '@/lib/i18n/words';
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
    keepAwake: 'Не засыпать автоматически',
    keptAwake: (title: string) =>
      `Группа ${title} не будет засыпать сама. Усыпить её можно вручную.`,
    mayAutoSleep: (title: string) => `Группа ${title} снова может уснуть сама.`,
    notSaved: 'Настройка не сохранена — группа осталась как была.',
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
    keepAwake: 'Keep awake',
    keptAwake: (title: string) =>
      `Group ${title} will not fall asleep by itself. It can still be put to sleep by hand.`,
    mayAutoSleep: (title: string) => `Group ${title} may fall asleep by itself again.`,
    notSaved: 'Not saved — the group stays as it was.',
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
          <DropdownMenu.CheckboxItem
            className={MENU_ITEM}
            checked={group.keepAwake === true}
            onCheckedChange={(keep) => void setKeepAwake(group, keep)}
          >
            {/* The check stands where the other items have their icon. */}
            <span className="flex size-4 items-center justify-center">
              <DropdownMenu.ItemIndicator>
                <Check aria-hidden />
              </DropdownMenu.ItemIndicator>
            </span>
            {t.keepAwake}
          </DropdownMenu.CheckboxItem>
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

/** «Не засыпать автоматически»: a database change only — autosleep reads it on its next run. */
async function setKeepAwake(group: TabGroup, keep: boolean): Promise<void> {
  const t = text();
  const { showToast } = useUi.getState();
  const title = words().quote(group.title || words().untitled);
  try {
    await repositories.groups.update(group.id, { keepAwake: keep || undefined });
    showToast(keep ? t.keptAwake(title) : t.mayAutoSleep(title));
  } catch {
    showToast(t.notSaved);
  }
}
