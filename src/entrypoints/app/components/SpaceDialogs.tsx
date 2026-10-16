import { AlertDialog, Dialog } from 'radix-ui';
import { type FormEvent, useState } from 'react';
import type { SpaceView } from '@/lib/app/overview';
import { count, GROUPS, plural } from '@/lib/command-messages';
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
            {space ? 'Переименовать пространство' : 'Новое пространство'}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-fg-muted">
            Пространство собирает группы по теме: «Работа», «Учёба», «Личное».
          </Dialog.Description>
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
        Название
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Работа"
          maxLength={60}
          autoFocus
          required
          className={INPUT}
        />
      </label>
      <div className="flex justify-end gap-2">
        <Dialog.Close type="button" className={BUTTON_SECONDARY}>
          Отмена
        </Dialog.Close>
        <button type="submit" disabled={!trimmed} className={BUTTON_PRIMARY}>
          {space ? 'Сохранить' : 'Создать'}
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
            Удалить пространство «{space.name}»?
          </AlertDialog.Title>
          <AlertDialog.Description className="flex flex-col gap-2 text-sm text-fg-muted">
            <span>
              {groups.length === 0
                ? 'Пространство пустое.'
                : `Вместе с ним в корзину ${plural(groups.length, ['уйдёт', 'уйдут', 'уйдут'])} ${count(groups.length, GROUPS)}.`}
              {open_ > 0 &&
                ` ${open_} ${plural(open_, ['открытая группа закроется', 'открытые группы закроются', 'открытых групп закроются'])} — ссылки сохранятся.`}
            </span>
            <span>Вернуть можно из корзины в течение 30 дней.</span>
          </AlertDialog.Description>
          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel className={BUTTON_SECONDARY}>Отмена</AlertDialog.Cancel>
            <AlertDialog.Action className={BUTTON_DANGER} onClick={() => void confirm()}>
              Удалить
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
