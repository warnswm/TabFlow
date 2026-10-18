import { ArrowUpRight, Download, Upload } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { type ChangeEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import type { Overview } from '@/lib/app/overview';
import { routeHash } from '@/lib/app/route';
import {
  backupContents,
  describeBackup,
  type HotkeyRow,
  hotkeyRows,
  type SiteAccessRow,
  siteAccessRows,
} from '@/lib/app/settings-view';
import { backupText, createBackup } from '@/lib/backup/export';
import {
  type Backup,
  BackupError,
  backupFileName,
  parseBackup,
  summarizeBackup,
} from '@/lib/backup/format';
import {
  extensionVersion,
  getHotkeys,
  grantedSitePatterns,
  openBrowserPage,
  removeSiteAccess,
} from '@/lib/browser-api';
import { count, describeBackupError, GROUPS, plural } from '@/lib/command-messages';
import { repositories } from '@/lib/db';
import { RESTORE_MODES, type RestoreMode } from '@/lib/messages';
import { BADGE_MODE_LABEL, BADGE_MODES, type BadgeMode } from '@/lib/summary';
import { formatShortcut } from '@/lib/hotkeys';
import { runCommand } from '../commands';
import { useNow } from '../hooks';
import { useUi } from '../store';
import {
  BUTTON_DANGER,
  BUTTON_LINK,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  DIALOG_CONTENT,
  DIALOG_OVERLAY,
} from '../ui';

/**
 * Settings page (`#/settings`, also the options page of the extension): how groups come back,
 * what the badge counts, shortcuts, sites with access, the backup file, the trash, the version.
 * Settings live in `storage.local`; the backup is built and read here, imported by the background.
 */

const RESTORE_MODE_TEXT: Record<RestoreMode, { label: string; hint: string }> = {
  placeholder: {
    label: 'Заглушки TabFlow',
    hint: 'Вкладки ждут лёгкой страницей с названием и иконкой; сайт грузится, когда вкладку открывают.',
  },
  background: {
    label: 'Сайты с выгрузкой в фоне',
    hint: 'Сайты открываются сразу и выгружаются из памяти, как только загрузились.',
  },
};

const BADGE_MODE_HINT: Record<BadgeMode, string> = {
  today: 'Первые три видео очереди — «на сегодня».',
  queue: 'Все видео, которые ждут в очереди.',
  stowed: 'Группы, убранные в TabFlow.',
};

const SHORTCUTS_PAGE = 'chrome://extensions/shortcuts';
const SITES: [string, string, string] = ['сайт', 'сайта', 'сайтов'];

export function SettingsView({ overview }: { overview: Overview }) {
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-[-0.02em]">Настройки</h1>
        <p className="text-sm text-fg-muted">
          Всё хранится только в этом браузере. Изменения применяются сразу.
        </p>
      </header>
      <RestoreModeSection />
      <BadgeModeSection />
      <HotkeysSection />
      <SiteAccessSection />
      <DataSection overview={overview} />
      <Section title="Корзина">
        <p className="text-sm text-fg-muted">
          Удалённые пространства, группы, ссылки и видео хранятся в корзине 30 дней, потом исчезают
          насовсем.{' '}
          <a href={routeHash({ view: 'trash' })} className={BUTTON_LINK}>
            Открыть корзину
          </a>
        </p>
      </Section>
      <Section title="О TabFlow">
        <p className="text-sm text-fg-muted">
          TabFlow <span className="font-mono text-fg">{extensionVersion()}</span> · Всё на виду.
          Ничего в памяти.
        </p>
        <p className="text-sm text-fg-muted">
          Данные не покидают этот браузер: TabFlow не отправляет их ни на какие серверы. В сеть
          уходят только запросы обложек YouTube (i.ytimg.com) для плиток и очереди.
        </p>
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-md font-semibold">{title}</h2>
        {description && <p className="text-sm text-fg-muted">{description}</p>}
      </div>
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        {children}
      </div>
    </section>
  );
}

interface Choice<T extends string> {
  value: T;
  label: string;
  hint: string;
}

function ChoiceList<T extends string>({
  name,
  value,
  choices,
  onChange,
}: {
  name: string;
  value: T;
  choices: readonly Choice<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" className="flex flex-col gap-1">
      {choices.map((choice) => (
        <label
          key={choice.value}
          className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-surface-raised"
        >
          <input
            type="radio"
            name={name}
            value={choice.value}
            checked={value === choice.value}
            onChange={() => onChange(choice.value)}
            className="mt-1 size-4 shrink-0 accent-accent"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm text-fg">{choice.label}</span>
            <span className="text-xs text-fg-muted">{choice.hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function RestoreModeSection() {
  const restoreMode = useUi((state) => state.restoreMode);
  const setRestoreMode = useUi((state) => state.setRestoreMode);
  return (
    <Section
      title="Возврат групп"
      description="Как открываются вкладки убранной группы, когда её возвращают на панель."
    >
      <ChoiceList
        name="restore-mode"
        value={restoreMode}
        choices={RESTORE_MODES.map((mode) => ({ value: mode, ...RESTORE_MODE_TEXT[mode] }))}
        onChange={setRestoreMode}
      />
    </Section>
  );
}

function BadgeModeSection() {
  const badgeMode = useUi((state) => state.badgeMode);
  const setBadgeMode = useUi((state) => state.setBadgeMode);
  return (
    <Section
      title="Число на значке"
      description="Что считает число на значке TabFlow. Подсказка значка всегда показывает всё."
    >
      <ChoiceList
        name="badge-mode"
        value={badgeMode}
        choices={BADGE_MODES.map((mode) => ({
          value: mode,
          label: BADGE_MODE_LABEL[mode],
          hint: BADGE_MODE_HINT[mode],
        }))}
        onChange={setBadgeMode}
      />
    </Section>
  );
}

/** Reloads `load` now and whenever the page gets the focus back (after a Chrome page). */
function useOnFocus<T>(load: () => Promise<T>): [T | undefined, () => void] {
  const [value, setValue] = useState<T>();
  const reload = useCallback(() => {
    load()
      .then(setValue)
      .catch(() => undefined);
  }, [load]);
  useEffect(() => {
    reload();
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [reload]);
  return [value, reload];
}

const loadHotkeys = async (): Promise<HotkeyRow[]> => hotkeyRows(await getHotkeys());

function HotkeysSection() {
  const [rows] = useOnFocus(loadHotkeys);
  return (
    <Section
      title="Сочетания клавиш"
      description="Сочетания назначает Chrome — на своей странице. Здесь видно, какие действуют сейчас."
    >
      <ul className="flex flex-col">
        {(rows ?? []).map((row) => (
          <li
            key={row.name}
            className="flex min-h-9 items-center justify-between gap-4 border-b border-border py-1.5 last:border-b-0"
          >
            <span className="text-sm text-fg">{row.description}</span>
            {row.shortcut ? (
              <kbd className="shrink-0 rounded-sm border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-fg">
                {formatShortcut(row.shortcut)}
              </kbd>
            ) : (
              <span className="shrink-0 text-xs text-fg-subtle">не назначено</span>
            )}
          </li>
        ))}
      </ul>
      <div>
        <button
          type="button"
          className={BUTTON_SECONDARY}
          onClick={() => void openBrowserPage(SHORTCUTS_PAGE)}
        >
          Изменить в Chrome
          <ArrowUpRight aria-hidden className="size-4" />
        </button>
      </div>
    </Section>
  );
}

const loadSites = async (): Promise<SiteAccessRow[]> => siteAccessRows(await grantedSitePatterns());

function SiteAccessSection() {
  const [rows, reload] = useOnFocus(loadSites);
  const showToast = useUi((state) => state.showToast);

  async function remove(row: SiteAccessRow) {
    const removed = await removeSiteAccess([row.pattern]);
    reload();
    showToast(
      removed
        ? `Доступ к ${row.label} убран. Видео этого сайта остались в очереди — без длительности и позиции.`
        : `Доступ к ${row.label} не убран — его выдали в Chrome при установке. Убрать: chrome://extensions → TabFlow → «Доступ к сайтам».`,
    );
  }

  return (
    <Section
      title="Доступ к сайтам"
      description="Нужен очереди видео (длительность и позиция) и «Рядом» (сайты в рамках). Chrome спрашивает его для каждого сайта отдельно."
    >
      {rows && rows.length === 0 ? (
        <p className="text-sm text-fg-muted">
          Доступа к сайтам нет. Chrome спросит его, когда видео попадёт в очередь или сайт откроется
          «Рядом».
        </p>
      ) : (
        <>
          <p className="text-xs text-fg-subtle">
            {rows && `${count(rows.length, SITES)} с доступом`}
          </p>
          <ul className="flex flex-col">
            {(rows ?? []).map((row) => (
              <li
                key={row.pattern}
                className="flex min-h-9 items-center justify-between gap-4 border-b border-border py-1.5 last:border-b-0"
              >
                <span className="min-w-0 truncate text-sm text-fg" title={row.pattern}>
                  {row.label}
                </span>
                <button
                  type="button"
                  className={`${BUTTON_LINK} shrink-0 text-sm`}
                  onClick={() => void remove(row)}
                >
                  Убрать доступ
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

async function isTabFlowEmpty(): Promise<boolean> {
  const [groups, queued, watched, layouts] = await Promise.all([
    repositories.groups.listAll(),
    repositories.queue.list('queued'),
    repositories.queue.list('watched'),
    repositories.layouts.list(),
  ]);
  return groups.length + queued.length + watched.length + layouts.length === 0;
}

function DataSection({ overview }: { overview: Overview }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Backup>();
  const [busy, setBusy] = useState(false);

  async function exportFile() {
    const { restoreMode, badgeMode, showToast } = useUi.getState();
    try {
      const now = Date.now();
      const backup = await createBackup(repositories, { restoreMode, badgeMode }, now);
      const name = backupFileName(now);
      const url = URL.createObjectURL(new Blob([backupText(backup)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      showToast(`Копия сохранена в файл ${name}: ${backupContents(summarizeBackup(backup))}.`);
    } catch {
      showToast('Копия не сохранена. Данные TabFlow не изменились.');
    }
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const { showToast } = useUi.getState();
    let backup: Backup;
    try {
      backup = parseBackup(await file.text());
    } catch (error) {
      showToast(describeBackupError(error instanceof BackupError ? error.code : 'not-backup'));
      return;
    }
    if (await isTabFlowEmpty()) {
      await importFile(backup, false);
    } else {
      setPending(backup);
    }
  }

  async function importFile(backup: Backup, replace: boolean) {
    setPending(undefined);
    setBusy(true);
    try {
      const response = await runCommand({ type: 'importBackup', backup, replace });
      if (response?.ok && replace) {
        // «Заменить» takes the settings of the copy too.
        const { setRestoreMode, setBadgeMode } = useUi.getState();
        if (backup.settings.restoreMode) setRestoreMode(backup.settings.restoreMode);
        if (backup.settings.badgeMode) setBadgeMode(backup.settings.badgeMode);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Данные"
      description="Копия в файле JSON: пространства, группы со ссылками, очередь видео, раскладки «Рядом» и настройки. Корзина в копию не входит."
    >
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON_SECONDARY}
          disabled={busy}
          onClick={() => void exportFile()}
        >
          <Download aria-hidden className="size-4" />
          Экспорт в файл
        </button>
        <button
          type="button"
          className={BUTTON_SECONDARY}
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          <Upload aria-hidden className="size-4" />
          Импорт из файла
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label="Файл копии TabFlow"
          onChange={(event) => void chooseFile(event)}
        />
      </div>
      <p className="text-xs text-fg-subtle">
        Импортированные группы приходят убранными: вкладки не открываются, пока группу не вернут.
      </p>
      <ImportDialog
        backup={pending}
        openGroups={overview.groupsByState.active + overview.groupsByState.asleep}
        onCancel={() => setPending(undefined)}
        onImport={(replace) => pending && void importFile(pending, replace)}
      />
    </Section>
  );
}

/** «Добавить» or «Заменить» — asked every time TabFlow already holds data. */
function ImportDialog({
  backup,
  openGroups,
  onCancel,
  onImport,
}: {
  backup?: Backup;
  openGroups: number;
  onCancel: () => void;
  onImport: (replace: boolean) => void;
}) {
  const now = useNow();
  const closing =
    openGroups > 0
      ? ` ${count(openGroups, GROUPS)} на панели ${plural(openGroups, ['закроется', 'закроются', 'закроются'])} — ${plural(openGroups, ['она сохранится', 'они сохранятся', 'они сохранятся'])} в корзине.`
      : '';
  return (
    <Dialog.Root open={backup !== undefined} onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className={DIALOG_OVERLAY} />
        <Dialog.Content className={DIALOG_CONTENT}>
          <Dialog.Title className="text-md font-semibold">Импорт копии</Dialog.Title>
          <Dialog.Description className="text-sm text-fg-muted">
            {backup && describeBackup(summarizeBackup(backup), now)} В TabFlow уже есть данные.
          </Dialog.Description>
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex flex-col gap-0.5">
              <dt className="font-semibold text-fg">Добавить</dt>
              <dd className="text-fg-muted">
                Копия добавится к тому, что есть. Пространства с тем же названием объединятся;
                группы и видео, которые уже есть, не повторятся.
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-semibold text-fg">Заменить</dt>
              <dd className="text-fg-muted">
                Пространства, группы и очередь уйдут в корзину на 30 дней, на их место встанет копия
                с её настройками.{closing} Раскладки «Рядом» останутся.
              </dd>
            </div>
          </dl>
          <p className="text-xs text-fg-subtle">
            После импорта его можно отменить в сообщении внизу.
          </p>
          <div className="flex justify-end gap-2">
            <Dialog.Close type="button" className={BUTTON_SECONDARY}>
              Отмена
            </Dialog.Close>
            <button type="button" className={BUTTON_DANGER} onClick={() => onImport(true)}>
              Заменить
            </button>
            <button
              type="button"
              className={BUTTON_PRIMARY}
              autoFocus
              onClick={() => onImport(false)}
            >
              Добавить
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
