import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Check,
  ChevronRight,
  Ellipsis,
  FolderInput,
  GripVertical,
  StickyNote,
  Trash,
  X,
} from 'lucide-react';
import { Dialog, DropdownMenu } from 'radix-ui';
import { type FormEvent, useRef, useState } from 'react';
import { displayHost, type GroupView, type SpaceView } from '@/lib/app/overview';
import { applyOrder, moveId } from '@/lib/app/reorder';
import { faviconUrl } from '@/lib/browser-api';
import { localized } from '@/lib/i18n';
import { words } from '@/lib/i18n/words';
import {
  GROUP_COLORS,
  type GroupColor,
  repositories,
  type SavedTab,
  type TabGroup,
} from '@/lib/db';
import { runCommand } from '../commands';
import { useUi } from '../store';
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
    edit: 'Название, цвет, заметка',
    editAbout:
      'Название, цвет и заметка группы. Открытая группа изменит название и цвет и на панели вкладок.',
    name: 'Название',
    color: 'Цвет',
    note: 'Заметка',
    notePlaceholder: 'Зачем отложено: «Сравнить отели до пятницы»',
    noteHint: 'Видна на плитке, её находит поиск.',
    noteNotSaved: 'Заметка не сохранена — осталась прежняя.',
    addLinkNote: 'Добавить заметку',
    editLinkNote: 'Изменить заметку',
    deleteLocked: 'Группа защищена от удаления',
    linkNoteLabel: (name: string) => `Заметка к ссылке ${name}`,
    linkNotePlaceholder: 'Зачем отложено',
    linkNoteHint: 'Enter — сохранить, Esc — отмена',
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
    edit: 'Title, color, note',
    editAbout:
      'Title, color and note of the group. An open group changes its title and color on the tab strip too.',
    name: 'Title',
    color: 'Color',
    note: 'Note',
    notePlaceholder: 'Why it was put aside: “Compare hotels by Friday”',
    noteHint: 'Shown on the tile, found by the search.',
    noteNotSaved: 'The note was not saved — the old one stays.',
    addLinkNote: 'Add a note',
    editLinkNote: 'Edit the note',
    deleteLocked: 'The group is protected from deletion',
    linkNoteLabel: (name: string) => `Note for link ${name}`,
    linkNotePlaceholder: 'Why it was put aside',
    linkNoteHint: 'Enter — save, Esc — cancel',
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
  const [editingNote, setEditingNote] = useState(false);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex flex-col rounded-md hover:bg-surface-raised ${isDragging ? 'relative z-10 bg-surface-raised shadow-drag' : ''}`}
    >
      <div className="flex items-center gap-1">
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
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate">
              <Highlighted text={name} terms={terms} />
            </span>
            {tab.note && !editingNote && (
              <span title={tab.note} className="truncate text-xs text-fg-subtle">
                <Highlighted text={tab.note} terms={terms} />
              </span>
            )}
          </span>
          <span className="max-w-40 shrink-0 truncate text-xs text-fg-subtle">
            {displayHost(tab.url)}
          </span>
        </button>
        <LinkMenu tab={tab} group={group} spaces={spaces} onEditNote={() => setEditingNote(true)} />
      </div>
      {editingNote && <LinkNoteEditor tab={tab} onDone={() => setEditingNote(false)} />}
    </li>
  );
}

/** The note of a link, edited in place: Enter saves, Esc cancels. Only the database. */
function LinkNoteEditor({ tab, onDone }: { tab: SavedTab; onDone: () => void }) {
  const [note, setNote] = useState(tab.note ?? '');
  const name = tab.title || tab.url;

  function save() {
    onDone();
    const trimmed = note.trim();
    if (trimmed === (tab.note ?? '')) return;
    repositories.tabs
      .update(tab.id, { note: trimmed || undefined })
      .catch(() => useUi.getState().showToast(text().noteNotSaved));
  }

  return (
    <div className="flex flex-col gap-1 pr-2 pb-2 pl-[60px]">
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            save();
          } else if (event.key === 'Escape') {
            // Closes the editor, not the dialog.
            event.preventDefault();
            event.stopPropagation();
            onDone();
          }
        }}
        onBlur={save}
        aria-label={text().linkNoteLabel(words().quote(name))}
        placeholder={text().linkNotePlaceholder}
        maxLength={500}
        autoFocus
        className={`${INPUT} h-8 text-sm`}
      />
      <span className="text-xs text-fg-subtle">{text().linkNoteHint}</span>
    </div>
  );
}

function LinkMenu({
  tab,
  group,
  spaces,
  onEditNote,
}: {
  tab: SavedTab;
  group: TabGroup;
  spaces: readonly SpaceView[];
  onEditNote: () => void;
}) {
  const name = tab.title || tab.url;
  const targets = spaces
    .map(({ space, groups }) => ({
      space,
      groups: groups.filter((item) => item.group.id !== group.id),
    }))
    .filter((item) => item.groups.length > 0);
  // «Заметка…» moves the focus to its field: the menu must not take it back to its button.
  const toNote = useRef(false);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={text().linkActions(words().quote(name))}
        className={`${BUTTON_ICON} mr-1`}
      >
        <Ellipsis aria-hidden className="size-4" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className={MENU_CONTENT}
          onCloseAutoFocus={(event) => {
            if (!toNote.current) return;
            toNote.current = false;
            event.preventDefault();
          }}
        >
          <DropdownMenu.Item
            className={MENU_ITEM}
            onSelect={() => {
              toNote.current = true;
              onEditNote();
            }}
          >
            <StickyNote aria-hidden /> {tab.note ? text().editLinkNote : text().addLinkNote}
          </DropdownMenu.Item>
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
            disabled={group.locked}
            onSelect={() =>
              void runCommand({ type: 'deleteTab', tabId: tab.id }, { name: group.title })
            }
          >
            <Trash aria-hidden /> {group.locked ? text().deleteLocked : text().delete}
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
  const [note, setNote] = useState(group.note ?? '');

  function submit(event: FormEvent) {
    event.preventDefault();
    onDone();
    if (title !== group.title || color !== group.color) {
      void runCommand(
        { type: 'editGroup', groupId: group.id, title, color },
        { name: title, quiet: true },
      );
    }
    // The note is TabFlow's own: only the database.
    const trimmed = note.trim();
    if (trimmed !== (group.note ?? '')) {
      repositories.groups
        .update(group.id, { note: trimmed || undefined })
        .catch(() => useUi.getState().showToast(text().noteNotSaved));
    }
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

      <label className="flex flex-col gap-1.5 text-sm text-fg-muted">
        {text().note}
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={text().notePlaceholder}
          maxLength={1000}
          rows={3}
          className={`${INPUT} h-auto py-2`}
        />
        <span className="text-xs text-fg-subtle">{text().noteHint}</span>
      </label>

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
