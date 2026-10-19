import { AlertDialog, Dialog } from 'radix-ui';
import { type FormEvent, useState } from 'react';
import type { SpaceView } from '@/lib/app/overview';
import { localized } from '@/lib/i18n';
import { pluralEn, pluralRu, words } from '@/lib/i18n/words';
import { repositories, type Space } from '@/lib/db';
import { runCommand } from '../commands';
import { navigate } from '../hooks';
import {
  BUTTON_DANGER,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  DIALOG_CONTENT,
  DIALOG_OVERLAY,
  INPUT,
} from '../ui';

const text = localized({
  ru: {
    rename: 'Переименовать пространство',
    create: 'Новое пространство',
    about: 'Пространство собирает группы по теме: «Работа», «Учёба», «Личное».',
    name: 'Название',
    example: 'Работа',
    cancel: 'Отмена',
    save: 'Сохранить',
    createButton: 'Создать',
    deleteTitle: (name: string) => `Удалить пространство ${name}?`,
    empty: 'Пространство пустое.',
    withGroups: (n: number) =>
      `Вместе с ним в корзину ${pluralRu(n, ['уйдёт', 'уйдут', 'уйдут'])} ${words().groups(n)}.`,
    openClosing: (n: number) =>
      ` ${n} ${pluralRu(n, ['открытая группа закроется', 'открытые группы закроются', 'открытых групп закроются'])} — ссылки сохранятся.`,
    trashNote: 'Вернуть можно из корзины в течение 30 дней.',
    delete: 'Удалить',
  },
  en: {
    rename: 'Rename space',
    create: 'New space',
    about: 'A space gathers groups by topic: “Work”, “Study”, “Personal”.',
    name: 'Name',
    example: 'Work',
    cancel: 'Cancel',
    save: 'Save',
    createButton: 'Create',
    deleteTitle: (name: string) => `Delete space ${name}?`,
    empty: 'The space is empty.',
    withGroups: (n: number) => `${words().groups(n)} will go to Trash with it.`,
    openClosing: (n: number) =>
      ` ${n} open ${pluralEn(n, ['group closes', 'groups close'])} — links are kept.`,
    trashNote: 'It can be restored from Trash within 30 days.',
    delete: 'Delete',
  },
});

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Creates a space (`space` missing) or renames one. Spaces do not touch Chrome: written directly. */
export function SpaceNameDialog({ space, open, onOpenChange }: DialogProps & { space?: Space }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={DIALOG_OVERLAY} />
        <Dialog.Content className={DIALOG_CONTENT}>
          <Dialog.Title className="text-md font-semibold">
            {space ? text().rename : text().create}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-fg-muted">{text().about}</Dialog.Description>
          <SpaceNameForm
            key={space?.id ?? 'new'}
            space={space}
            onDone={() => onOpenChange(false)}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SpaceNameForm({ space, onDone }: { space?: Space; onDone: () => void }) {
  const [name, setName] = useState(space?.name ?? '');
  const trimmed = name.trim();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!trimmed) return;
    onDone();
    if (space) {
      await repositories.spaces.rename(space.id, trimmed);
    } else {
      const created = await repositories.spaces.create(trimmed);
      navigate({ view: 'space', spaceId: created.id });
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm text-fg-muted">
        {text().name}
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={text().example}
          maxLength={60}
          autoFocus
          required
          className={INPUT}
        />
      </label>
      <div className="flex justify-end gap-2">
        <Dialog.Close type="button" className={BUTTON_SECONDARY}>
          {text().cancel}
        </Dialog.Close>
        <button type="submit" disabled={!trimmed} className={BUTTON_PRIMARY}>
          {space ? text().save : text().createButton}
        </button>
      </div>
    </form>
  );
}

/** Asks before a space goes to the trash: it takes all its groups along and closes open ones. */
export function DeleteSpaceDialog({
  view,
  open,
  onOpenChange,
}: DialogProps & { view?: SpaceView }) {
  if (!view) return null;
  const { space, groups } = view;
  const open_ = groups.filter(({ group }) => group.state !== 'stowed').length;

  async function confirm() {
    const response = await runCommand(
      { type: 'deleteSpace', spaceId: space.id },
      { name: space.name },
    );
    if (response?.ok) navigate({ view: 'space' });
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={DIALOG_OVERLAY} />
        <AlertDialog.Content className={DIALOG_CONTENT}>
          <AlertDialog.Title className="text-md font-semibold">
            {text().deleteTitle(words().quote(space.name))}
          </AlertDialog.Title>
          <AlertDialog.Description className="flex flex-col gap-2 text-sm text-fg-muted">
            <span>
              {groups.length === 0 ? text().empty : text().withGroups(groups.length)}
              {open_ > 0 && text().openClosing(open_)}
            </span>
            <span>{text().trashNote}</span>
          </AlertDialog.Description>
          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel className={BUTTON_SECONDARY}>{text().cancel}</AlertDialog.Cancel>
            <AlertDialog.Action className={BUTTON_DANGER} onClick={() => void confirm()}>
              {text().delete}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
