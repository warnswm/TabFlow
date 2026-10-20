import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronRight,
  Columns2,
  Copy,
  Ellipsis,
  Eye,
  FileText,
  FolderInput,
  List,
  Lock,
  Moon,
  Pencil,
  Share2,
  Star,
  Sun,
  Trash,
} from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { linksText, markdownText } from '@/lib/app/share';
import { repositories, type SavedTab, type Space, type TabGroup } from '@/lib/db';
import { localized } from '@/lib/i18n';
import { words } from '@/lib/i18n/words';
import { arrangeTabStrip, moveGroupToSpace, runCommand } from '../commands';
import { useUi } from '../store';
import { BUTTON_ICON, MENU_CONTENT, MENU_ITEM, MENU_SEPARATOR } from '../ui';

interface GroupMenuProps {
  group: TabGroup;
  tabs: readonly SavedTab[];
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
    edit: 'Название, цвет, заметка',
    moveTo: 'Перенести в',
    favorite: 'В избранном',
    favorited: (title: string) =>
      `Группа ${title} в избранном — теперь она первая в пространстве и на панели вкладок.`,
    unfavorited: (title: string) =>
      `Группа ${title} больше не в избранном — она стоит после избранных групп.`,
    lock: 'Защитить от удаления',
    locked: (title: string) =>
      `Группа ${title} защищена: её и её ссылки не удалить, «Свернуть всё» оставляет её на панели.`,
    unlocked: (title: string) => `Защита с группы ${title} снята — её снова можно удалить.`,
    share: 'Поделиться',
    copyLinks: 'Копировать ссылки',
    copyMarkdown: 'Копировать как Markdown',
    copied: (n: number) => `Скопировано: ${words().links(n)}.`,
    notCopied: 'Не скопировано — браузер не дал доступ к буферу обмена. Ссылки остались в группе.',
    keepAwake: 'Не засыпать автоматически',
    keptAwake: (title: string) =>
      `Группа ${title} не будет засыпать сама. Усыпить её можно вручную.`,
    mayAutoSleep: (title: string) => `Группа ${title} снова может уснуть сама.`,
    notSaved: 'Настройка не сохранена — группа осталась как была.',
    delete: 'Удалить',
    deleteLocked: 'Защищена от удаления',
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
    edit: 'Title, color, note',
    moveTo: 'Move to',
    favorite: 'Favorite',
    favorited: (title: string) =>
      `${title} is a favorite — it now stands first in its space and on the tab strip.`,
    unfavorited: (title: string) =>
      `${title} is no longer a favorite — it stands after the favorite groups.`,
    lock: 'Protect from deletion',
    locked: (title: string) =>
      `${title} is protected: it and its links can’t be deleted, “Collapse all” leaves it on the tab strip.`,
    unlocked: (title: string) => `${title} is no longer protected — it can be deleted again.`,
    share: 'Share',
    copyLinks: 'Copy links',
    copyMarkdown: 'Copy as Markdown',
    copied: (n: number) => `Copied: ${words().links(n)}.`,
    notCopied: 'Not copied — the browser denied the clipboard. The links stay in the group.',
    keepAwake: 'Keep awake',
    keptAwake: (title: string) =>
      `Group ${title} will not fall asleep by itself. It can still be put to sleep by hand.`,
    mayAutoSleep: (title: string) => `Group ${title} may fall asleep by itself again.`,
    notSaved: 'Not saved — the group stays as it was.',
    delete: 'Delete',
    deleteLocked: 'Protected from deletion',
  },
});

export function GroupMenu({ group, tabs, spaces, onOpenLinks, onEdit, onRestore }: GroupMenuProps) {
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
          <DropdownMenu.CheckboxItem
            className={MENU_ITEM}
            checked={group.favorite === true}
            onCheckedChange={(favorite) => void setFavorite(group, favorite)}
          >
            <Star aria-hidden className={group.favorite ? 'fill-current' : ''} />
            {t.favorite}
            <DropdownMenu.ItemIndicator className="ml-auto">
              <Check aria-hidden />
            </DropdownMenu.ItemIndicator>
          </DropdownMenu.CheckboxItem>
          <DropdownMenu.CheckboxItem
            className={MENU_ITEM}
            checked={group.locked === true}
            onCheckedChange={(locked) => void setLocked(group, locked)}
          >
            <Lock aria-hidden />
            {t.lock}
            <DropdownMenu.ItemIndicator className="ml-auto">
              <Check aria-hidden />
            </DropdownMenu.ItemIndicator>
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
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={MENU_ITEM} disabled={tabs.length === 0}>
              <Share2 aria-hidden /> {t.share}
              <ChevronRight aria-hidden className="ml-auto" />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent sideOffset={6} className={MENU_CONTENT}>
                <DropdownMenu.Item
                  className={MENU_ITEM}
                  onSelect={() => void copy(linksText(tabs), tabs.length)}
                >
                  <Copy aria-hidden /> {t.copyLinks}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={MENU_ITEM}
                  onSelect={() =>
                    void copy(markdownText(group, tabs, words().untitled), tabs.length)
                  }
                >
                  <FileText aria-hidden /> {t.copyMarkdown}
                </DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>

          <DropdownMenu.Separator className={MENU_SEPARATOR} />
          <DropdownMenu.Item
            className={`${MENU_ITEM} text-danger data-highlighted:text-danger`}
            disabled={group.locked}
            onSelect={() => runCommand({ type: 'deleteGroup', groupId: group.id }, { name })}
          >
            <Trash aria-hidden /> {group.locked ? t.deleteLocked : t.delete}
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

/** «В избранном»: the database, then the tab strip follows the new order of the tiles. */
async function setFavorite(group: TabGroup, favorite: boolean): Promise<void> {
  const t = text();
  const { showToast } = useUi.getState();
  const title = words().quote(group.title || words().untitled);
  try {
    await repositories.groups.setFavorite(group.id, favorite);
    arrangeTabStrip();
    showToast(favorite ? t.favorited(title) : t.unfavorited(title));
  } catch {
    showToast(t.notSaved);
  }
}

/** «Защитить от удаления»: a database change only — the background checks it when deleting. */
async function setLocked(group: TabGroup, locked: boolean): Promise<void> {
  const t = text();
  const { showToast } = useUi.getState();
  const title = words().quote(group.title || words().untitled);
  try {
    await repositories.groups.update(group.id, { locked: locked || undefined });
    showToast(locked ? t.locked(title) : t.unlocked(title));
  } catch {
    showToast(t.notSaved);
  }
}

/** «Поделиться»: the text goes to the clipboard; nothing leaves the browser. */
async function copy(value: string, links: number): Promise<void> {
  const t = text();
  const { showToast } = useUi.getState();
  try {
    await navigator.clipboard.writeText(value);
    showToast(t.copied(links));
  } catch {
    showToast(t.notCopied);
  }
}
