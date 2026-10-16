import { Check, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { type FormEvent, useState } from 'react';
import { displayHost, type GroupView } from '@/lib/app/overview';
import { faviconUrl } from '@/lib/browser-api';
import { count, TABS } from '@/lib/command-messages';
import { GROUP_COLORS, type GroupColor, type TabGroup } from '@/lib/db';
import { runCommand } from '../commands';
import {
  BUTTON_ICON,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  DIALOG_CONTENT,
  DIALOG_OVERLAY,
  GROUP_COLOR_NAME,
  GROUP_DOT,
  INPUT,
  UNTITLED,
} from '../ui';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The links of a group: open one (or show its tab), delete one to the trash. */
export function GroupLinksDialog({ view, open, onOpenChange }: DialogProps & { view?: GroupView }) {
  if (!view) return null;
  const { group, tabs } = view;
  const title = group.title || UNTITLED;

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
            <span className="font-mono text-xs text-fg-muted">{count(tabs.length, TABS)}</span>
            <Dialog.Close aria-label="Закрыть" className={`ml-auto ${BUTTON_ICON}`}>
              <X aria-hidden className="size-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Ссылки группы: открыть или удалить в корзину.
          </Dialog.Description>

          {tabs.length === 0 ? (
            <p className="text-sm text-fg-muted">В группе нет ссылок.</p>
          ) : (
            <ul className="-mx-2 flex min-h-0 flex-col overflow-y-auto">
              {tabs.map((tab) => (
                <li
                  key={tab.id}
                  className="group/link flex items-center gap-1 rounded-md hover:bg-surface-raised"
                >
                  <button
                    type="button"
                    onClick={() => runCommand({ type: 'openTab', tabId: tab.id }, { quiet: true })}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1.5 text-left"
                  >
                    <img src={faviconUrl(tab.url, 16)} alt="" className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{tab.title || tab.url}</span>
                    <span className="max-w-40 shrink-0 truncate text-xs text-fg-subtle">
                      {displayHost(tab.url)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Удалить ссылку «${tab.title || tab.url}»`}
                    onClick={() =>
                      runCommand({ type: 'deleteTab', tabId: tab.id }, { name: group.title })
                    }
                    className={`${BUTTON_ICON} mr-1 opacity-0 group-hover/link:opacity-100 focus-visible:opacity-100`}
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
          <Dialog.Title className="text-md font-semibold">Название и цвет</Dialog.Title>
          <Dialog.Description className="sr-only">
            Название и цвет группы. Открытая группа изменится и на панели вкладок.
          </Dialog.Description>
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
        Название
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={UNTITLED}
          maxLength={120}
          autoFocus
          className={INPUT}
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm text-fg-muted">Цвет</legend>
        <div className="flex flex-wrap gap-2">
          {GROUP_COLORS.map((option) => (
            <label key={option} title={GROUP_COLOR_NAME[option]} className="relative">
              <input
                type="radio"
                name="group-color"
                value={option}
                checked={color === option}
                onChange={() => setColor(option)}
                className="peer sr-only"
              />
              <span className="sr-only">{GROUP_COLOR_NAME[option]}</span>
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
          Отмена
        </Dialog.Close>
        <button type="submit" className={BUTTON_PRIMARY}>
          Сохранить
        </button>
      </div>
    </form>
  );
}
