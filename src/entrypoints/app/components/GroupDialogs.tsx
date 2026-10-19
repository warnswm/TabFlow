import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, ChevronRight, Ellipsis, FolderInput, GripVertical, Trash, X } from 'lucide-react';
import { Dialog, DropdownMenu } from 'radix-ui';
import { type FormEvent, useState } from 'react';
import { displayHost, type GroupView, type SpaceView } from '@/lib/app/overview';
import { applyOrder, moveId } from '@/lib/app/reorder';
import { faviconUrl } from '@/lib/browser-api';
import { localized } from '@/lib/i18n';
import { words } from '@/lib/i18n/words';
import { GROUP_COLORS, type GroupColor, type SavedTab, type TabGroup } from '@/lib/db';
import { runCommand } from '../commands';
import { announcements, type DragData, screenReaderInstructions, useDragSensors } from '../dnd';
import {
  BUTTON_ICON,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  DIALOG_CONTENT,
  DIALOG_OVERLAY,
  groupColorName,
  GROUP_DOT,
  INPUT,
  MENU_CONTENT,
  MENU_ITEM,
  MENU_SEPARATOR,
  untitled,
} from '../ui';
import { Highlighted } from './Highlighted';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface LinksProps {
  view?: GroupView;
  /** All spaces with their groups: targets of «Перенести в группу». */
  spaces: readonly SpaceView[];
  /** Matched words of the search, highlighted in the titles. */
  terms: readonly string[];
}

/**
 * The links of a group: open one (or show its tab), drag to a new place, move to another group,
 * delete to the trash.
 */
const text = localized({
  ru: {
    close: 'Закрыть',
    linksAbout:
      'Ссылки группы: открыть, перетащить на другое место, перенести в другую группу или удалить в корзину.',
    noLinks: 'В группе нет ссылок.',
    link: 'ссылка',
    moveLink: (name: string) => `Переместить ссылку ${name}`,
    linkActions: (name: string) => `Действия со ссылкой ${name}`,
    moveToGroup: 'Перенести в группу',
    delete: 'Удалить',
    edit: 'Название и цвет',
    editAbout: 'Название и цвет группы. Открытая группа изменится и на панели вкладок.',
    name: 'Название',
    color: 'Цвет',
    cancel: 'Отмена',
    save: 'Сохранить',
  },
  en: {
    close: 'Close',
    linksAbout:
      'Links of the group: open, drag to another place, move to another group or delete to Trash.',
    noLinks: 'The group has no links.',
    link: 'link',
    moveLink: (name: string) => `Move link ${name}`,
    linkActions: (name: string) => `Actions for link ${name}`,
    moveToGroup: 'Move to group',
    delete: 'Delete',
    edit: 'Title and color',
    editAbout: 'Title and color of the group. An open group changes on the tab strip too.',
    name: 'Title',
    color: 'Color',
    cancel: 'Cancel',
    save: 'Save',
  },
});

export function GroupLinksDialog({
  view,
  spaces,
  terms,
  open,
  onOpenChange,
}: DialogProps & LinksProps) {
  if (!view) return null;
  const { group, tabs } = view;
  const title = group.title || untitled();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={DIALOG_OVERLAY} />
        <Dialog.Content className={`${DIALOG_CONTENT} w-[min(640px,calc(100vw-32px))]`}>
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className={`size-2.5 shrink-0 rounded-full ${GROUP_DOT[group.color]}`}
            />
            <Dialog.Title className="min-w-0 truncate text-md font-semibold">{title}</Dialog.Title>
            <span className="font-mono text-xs text-fg-muted">{words().tabs(tabs.length)}</span>
            <Dialog.Close aria-label={text().close} className={`ml-auto ${BUTTON_ICON}`}>
              <X aria-hidden className="size-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{text().linksAbout}</Dialog.Description>

          {tabs.length === 0 ? (
            <p className="text-sm text-fg-muted">{text().noLinks}</p>
          ) : (
            <LinkList group={group} tabs={tabs} spaces={spaces} terms={terms} />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface LinkListProps {
  group: TabGroup;
  tabs: readonly SavedTab[];
  spaces: readonly SpaceView[];
  terms: readonly string[];
}

/** Links in their order; a new order goes to the background, which moves the open tabs too. */
function LinkList({ group, tabs, spaces, terms }: LinkListProps) {
  const sensors = useDragSensors();
  // Right after a drop the new order is shown until the database change arrives.
  const [dropped, setDropped] = useState<{ base: readonly SavedTab[]; ids: string[] }>();
  const ordered = dropped?.base === tabs ? applyOrder(tabs, dropped.ids, (tab) => tab.id) : tabs;

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const tabId = String(active.id);
    const ids = moveId(
      ordered.map((tab) => tab.id),
      tabId,
      String(over.id),
    );
    setDropped({ base: tabs, ids });
    void runCommand(
      { type: 'moveTab', tabId, groupId: group.id, index: ids.indexOf(tabId) },
      { quiet: true },
    ).then((response) => {
      if (!response?.ok) setDropped(undefined);
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{ announcements, screenReaderInstructions }}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={ordered.map((tab) => tab.id)} strategy={verticalListSortingStrategy}>
        <ul className="-mx-2 flex min-h-0 flex-col overflow-y-auto">
          {ordered.map((tab) => (
            <LinkRow key={tab.id} tab={tab} group={group} spaces={spaces} terms={terms} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function LinkRow({
  tab,
  group,
  spaces,
  terms,
}: {
  tab: SavedTab;
  group: TabGroup;
  spaces: readonly SpaceView[];
  terms: readonly string[];
}) {
  const name = tab.title || tab.url;
  const data: DragData = { type: 'link', tab };
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id, data, attributes: { roleDescription: text().link } });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex items-center gap-1 rounded-md hover:bg-surface-raised ${isDragging ? 'relative z-10 bg-surface-raised shadow-drag' : ''}`}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={text().moveLink(words().quote(name))}
        className={`${BUTTON_ICON} ml-1 cursor-grab text-fg-subtle`}
      >
        <GripVertical aria-hidden className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => runCommand({ type: 'openTab', tabId: tab.id }, { quiet: true })}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1.5 text-left"
      >
        <img src={faviconUrl(tab.url, 16)} alt="" className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          <Highlighted text={name} terms={terms} />
        </span>
        <span className="max-w-40 shrink-0 truncate text-xs text-fg-subtle">
          {displayHost(tab.url)}
        </span>
      </button>
      <LinkMenu tab={tab} group={group} spaces={spaces} />
    </li>
  );
}

function LinkMenu({
  tab,
  group,
  spaces,
}: {
  tab: SavedTab;
  group: TabGroup;
  spaces: readonly SpaceView[];
}) {
  const name = tab.title || tab.url;
  const targets = spaces
    .map(({ space, groups }) => ({
      space,
      groups: groups.filter((item) => item.group.id !== group.id),
    }))
    .filter((item) => item.groups.length > 0);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={text().linkActions(words().quote(name))}
        className={`${BUTTON_ICON} mr-1`}
      >
        <Ellipsis aria-hidden className="size-4" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className={MENU_CONTENT}>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={MENU_ITEM} disabled={targets.length === 0}>
              <FolderInput aria-hidden /> {text().moveToGroup}
              <ChevronRight aria-hidden className="ml-auto" />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                sideOffset={6}
                className={`${MENU_CONTENT} max-h-[60vh] max-w-72 overflow-y-auto`}
              >
                {targets.map(({ space, groups }) => (
                  <DropdownMenu.Group key={space.id}>
                    <DropdownMenu.Label className="px-2 pt-1.5 pb-1 text-xs text-fg-subtle">
                      {space.name}
                    </DropdownMenu.Label>
                    {groups.map(({ group: target, tabs }) => (
                      <DropdownMenu.Item
                        key={target.id}
                        className={MENU_ITEM}
                        onSelect={() =>
                          void runCommand(
                            {
                              type: 'moveTab',
                              tabId: tab.id,
                              groupId: target.id,
                              index: tabs.length,
                            },
                            { name: target.title },
                          )
                        }
                      >
                        <span
                          aria-hidden
                          className={`size-2.5 shrink-0 rounded-full ${GROUP_DOT[target.color]}`}
                        />
                        <span className="truncate">{target.title || untitled()}</span>
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Group>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <DropdownMenu.Separator className={MENU_SEPARATOR} />
          <DropdownMenu.Item
            className={`${MENU_ITEM} text-danger data-highlighted:text-danger`}
            onSelect={() =>
              void runCommand({ type: 'deleteTab', tabId: tab.id }, { name: group.title })
            }
          >
            <Trash aria-hidden /> {text().delete}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Title and color; for a group on the tab strip they change in Chrome as well. */
export function EditGroupDialog({ group, open, onOpenChange }: DialogProps & { group?: TabGroup }) {
  if (!group) return null;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={DIALOG_OVERLAY} />
        <Dialog.Content className={DIALOG_CONTENT}>
          <Dialog.Title className="text-md font-semibold">{text().edit}</Dialog.Title>
          <Dialog.Description className="sr-only">{text().editAbout}</Dialog.Description>
          <EditGroupForm key={group.id} group={group} onDone={() => onOpenChange(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EditGroupForm({ group, onDone }: { group: TabGroup; onDone: () => void }) {
  const [title, setTitle] = useState(group.title);
  const [color, setColor] = useState<GroupColor>(group.color);

  function submit(event: FormEvent) {
    event.preventDefault();
    onDone();
    void runCommand(
      { type: 'editGroup', groupId: group.id, title, color },
      { name: title, quiet: true },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm text-fg-muted">
        {text().name}
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={untitled()}
          maxLength={120}
          autoFocus
          className={INPUT}
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm text-fg-muted">{text().color}</legend>
        <div className="flex flex-wrap gap-2">
          {GROUP_COLORS.map((option) => (
            <label key={option} title={groupColorName(option)} className="relative">
              <input
                type="radio"
                name="group-color"
                value={option}
                checked={color === option}
                onChange={() => setColor(option)}
                className="peer sr-only"
              />
              <span className="sr-only">{groupColorName(option)}</span>
              {/* Selected: a ring and a check mark, not only the color. */}
              <span
                aria-hidden
                className={`flex size-8 items-center justify-center rounded-full ${GROUP_DOT[option]} ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-fg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-focus`}
              >
                {color === option && <Check className="size-4 text-bg" strokeWidth={3} />}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex justify-end gap-2">
        <Dialog.Close type="button" className={BUTTON_SECONDARY}>
          {text().cancel}
        </Dialog.Close>
        <button type="submit" className={BUTTON_PRIMARY}>
          {text().save}
        </button>
      </div>
    </form>
  );
}
