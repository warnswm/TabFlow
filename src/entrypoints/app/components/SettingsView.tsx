import { ArrowUpRight, Download, Upload } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
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
  browserLanguage,
  extensionVersion,
  getHotkeys,
  grantedSitePatterns,
  openBrowserPage,
  removeSiteAccess,
} from '@/lib/browser-api';
import { describeBackupError } from '@/lib/command-messages';
import { repositories } from '@/lib/db';
import { LANGUAGE_SETTINGS, type LanguageSetting, localized, resolveLanguage } from '@/lib/i18n';
import { pluralEn, pluralRu, words } from '@/lib/i18n/words';
import { RESTORE_MODES, type RestoreMode } from '@/lib/messages';
import { loadLanguageSetting, saveLanguageSetting } from '@/lib/settings';
import { BADGE_MODES, type BadgeMode, badgeModeLabel } from '@/lib/summary';
import { formatShortcut } from '@/lib/hotkeys';
import { runCommand } from '../commands';
import { useNow, useOnFocus } from '../hooks';
import { ChoiceList, Section } from './SettingsParts';
import { AutoSleepSection, GroupingSection } from './TidySettings';
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
 * Settings page (`#/settings`, also the options page of the extension): the language, how groups
 * come back, what the badge counts, shortcuts, sites with access, the backup file, the trash, the
 * version. Settings live in `storage.local`; the backup is built and read here, imported by the
 * background.
 */

type Choices<T extends string> = Record<T, { label: string; hint: string }>;

const text = localized({
  ru: {
    title: 'Настройки',
    intro: 'Всё хранится только в этом браузере. Изменения применяются сразу.',
    language: 'Язык',
    languageAbout: 'Язык интерфейса TabFlow: страницы, меню, значок.',
    languages: {
      auto: { label: 'Как в Chrome', hint: '' },
      ru: { label: 'Русский', hint: '' },
      en: { label: 'English', hint: '' },
    } as Choices<LanguageSetting>,
    nowRussian: 'Сейчас — русский.',
    nowEnglish: 'Сейчас — английский.',
    restore: 'Возврат групп',
    restoreAbout: 'Как открываются вкладки убранной группы, когда её возвращают на панель.',
    restoreModes: {
      placeholder: {
        label: 'Заглушки TabFlow',
        hint: 'Вкладки ждут лёгкой страницей с названием и иконкой; сайт грузится, когда вкладку открывают.',
      },
      background: {
        label: 'Сайты с выгрузкой в фоне',
        hint: 'Сайты открываются сразу и выгружаются из памяти, как только загрузились.',
      },
    } as Choices<RestoreMode>,
    badge: 'Число на значке',
    badgeAbout: 'Что считает число на значке TabFlow. Подсказка значка всегда показывает всё.',
    badgeHints: {
      today: 'Первые три видео очереди — «на сегодня».',
      queue: 'Все видео, которые ждут в очереди.',
      stowed: 'Группы, убранные в TabFlow.',
    } as Record<BadgeMode, string>,
    hotkeys: 'Сочетания клавиш',
    hotkeysAbout:
      'Сочетания назначает Chrome — на своей странице. Здесь видно, какие действуют сейчас.',
    notAssigned: 'не назначено',
    changeInChrome: 'Изменить в Chrome',
    sites: 'Доступ к сайтам',
    sitesAbout:
      'Нужен очереди видео (длительность и позиция) и «Рядом» (сайты в рамках). Chrome спрашивает его для каждого сайта отдельно.',
    noSites:
      'Доступа к сайтам нет. Chrome спросит его, когда видео попадёт в очередь или сайт откроется «Рядом».',
    sitesCount: (n: number) => `${words().sites(n)} с доступом`,
    removeAccess: 'Убрать доступ',
    accessRemoved: (site: string) =>
      `Доступ к ${site} убран. Видео этого сайта остались в очереди — без длительности и позиции.`,
    accessKept: (site: string) =>
      `Доступ к ${site} не убран — его выдали в Chrome при установке. Убрать: chrome://extensions → TabFlow → «Доступ к сайтам».`,
    data: 'Данные',
    dataAbout:
      'Копия в файле JSON: пространства, группы со ссылками, очередь видео, раскладки «Рядом» и настройки. Корзина в копию не входит.',
    exportFile: 'Экспорт в файл',
    importFile: 'Импорт из файла',
    fileLabel: 'Файл копии TabFlow',
    importNote:
      'Импортированные группы приходят убранными: вкладки не открываются, пока группу не вернут.',
    exported: (name: string, contents: string) => `Копия сохранена в файл ${name}: ${contents}.`,
    notExported: 'Копия не сохранена. Данные TabFlow не изменились.',
    trash: 'Корзина',
    trashAbout:
      'Удалённые пространства, группы, ссылки и видео хранятся в корзине 30 дней, потом исчезают насовсем.',
    openTrash: 'Открыть корзину',
    about: 'О TabFlow',
    slogan: 'Всё на виду. Ничего в памяти.',
    privacy:
      'Данные не покидают этот браузер: TabFlow не отправляет их ни на какие серверы. В сеть уходят только запросы обложек YouTube (i.ytimg.com) для плиток и очереди.',
    importTitle: 'Импорт копии',
    hasData: 'В TabFlow уже есть данные.',
    add: 'Добавить',
    addAbout:
      'Копия добавится к тому, что есть. Пространства с тем же названием объединятся; группы и видео, которые уже есть, не повторятся.',
    replace: 'Заменить',
    replaceAbout: (closing: string) =>
      `Пространства, группы и очередь уйдут в корзину на 30 дней, на их место встанет копия с её настройками.${closing} Раскладки «Рядом» останутся.`,
    closing: (n: number) =>
      ` ${words().groups(n)} на панели ${pluralRu(n, ['закроется', 'закроются', 'закроются'])} — ${pluralRu(n, ['она сохранится', 'они сохранятся', 'они сохранятся'])} в корзине.`,
    undoNote: 'После импорта его можно отменить в сообщении внизу.',
    cancel: 'Отмена',
  },
  en: {
    title: 'Settings',
    intro: 'Everything is stored in this browser only. Changes apply at once.',
    language: 'Language',
    languageAbout: 'The language of TabFlow: pages, menus, the icon.',
    languages: {
      auto: { label: 'Same as Chrome', hint: '' },
      ru: { label: 'Русский', hint: '' },
      en: { label: 'English', hint: '' },
    },
    nowRussian: 'Now Russian.',
    nowEnglish: 'Now English.',
    restore: 'Restoring groups',
    restoreAbout: 'How the tabs of a stowed group open when it goes back to the tab strip.',
    restoreModes: {
      placeholder: {
        label: 'TabFlow placeholders',
        hint: 'Tabs wait as a light page with the title and icon; the site loads when the tab is opened.',
      },
      background: {
        label: 'Sites, unloaded in the background',
        hint: 'Sites open at once and are unloaded from memory as soon as they have loaded.',
      },
    },
    badge: 'Number on the icon',
    badgeAbout: 'What the number on the TabFlow icon counts. The icon tooltip always shows all.',
    badgeHints: {
      today: 'The first three videos of the queue — “for today”.',
      queue: 'All videos waiting in the queue.',
      stowed: 'Groups stowed in TabFlow.',
    },
    hotkeys: 'Keyboard shortcuts',
    hotkeysAbout: 'Chrome assigns shortcuts on its own page. Here are the ones that work now.',
    notAssigned: 'not set',
    changeInChrome: 'Change in Chrome',
    sites: 'Site access',
    sitesAbout:
      'Needed by the video queue (duration and position) and “Side by side” (sites in frames). Chrome asks for each site separately.',
    noSites:
      'No site access. Chrome asks for it when a video is queued or a site opens side by side.',
    sitesCount: (n: number) => `${words().sites(n)} with access`,
    removeAccess: 'Remove access',
    accessRemoved: (site: string) =>
      `Access to ${site} removed. Its videos stay in the queue — without duration and position.`,
    accessKept: (site: string) =>
      `Access to ${site} was not removed — it was granted in Chrome at install. To remove: chrome://extensions → TabFlow → “Site access”.`,
    data: 'Data',
    dataAbout:
      'A JSON backup: spaces, groups with links, the video queue, “Side by side” layouts and settings. Trash is not included.',
    exportFile: 'Export to file',
    importFile: 'Import from file',
    fileLabel: 'TabFlow backup file',
    importNote: 'Imported groups come stowed: tabs do not open until the group is restored.',
    exported: (name: string, contents: string) => `Backup saved to ${name}: ${contents}.`,
    notExported: 'The backup was not saved. TabFlow data is unchanged.',
    trash: 'Trash',
    trashAbout:
      'Deleted spaces, groups, links and videos are kept in Trash for 30 days, then removed for good.',
    openTrash: 'Open Trash',
    about: 'About TabFlow',
    slogan: 'Everything in sight. Nothing in memory.',
    privacy:
      'Data never leaves this browser: TabFlow sends it to no server. The only network requests are YouTube thumbnails (i.ytimg.com) for tiles and the queue.',
    importTitle: 'Import backup',
    hasData: 'TabFlow already holds data.',
    add: 'Add',
    addAbout:
      'The backup is added to what is there. Spaces with the same name merge; groups and videos already there are not repeated.',
    replace: 'Replace',
    replaceAbout: (closing: string) =>
      `Spaces, groups and the queue go to Trash for 30 days; the backup with its settings takes their place.${closing} “Side by side” layouts stay.`,
    closing: (n: number) =>
      ` ${words().groups(n)} on the tab strip ${pluralEn(n, ['closes', 'close'])} — kept in Trash.`,
    undoNote: 'The import can be undone in the message at the bottom.',
    cancel: 'Cancel',
  },
});

const SHORTCUTS_PAGE = 'chrome://extensions/shortcuts';

export function SettingsView({ overview }: { overview: Overview }) {
  const t = text();
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-[-0.02em]">{t.title}</h1>
        <p className="text-sm text-fg-muted">{t.intro}</p>
      </header>
      <LanguageSection />
      <RestoreModeSection />
      <BadgeModeSection />
      <AutoSleepSection />
      <GroupingSection />
      <HotkeysSection />
      <SiteAccessSection />
      <DataSection overview={overview} />
      <Section title={t.trash}>
        <p className="text-sm text-fg-muted">
          {t.trashAbout}{' '}
          <a href={routeHash({ view: 'trash' })} className={BUTTON_LINK}>
            {t.openTrash}
          </a>
        </p>
      </Section>
      <Section title={t.about}>
        <p className="text-sm text-fg-muted">
          TabFlow <span className="font-mono text-fg">{extensionVersion()}</span> · {t.slogan}
        </p>
        <p className="text-sm text-fg-muted">{t.privacy}</p>
      </Section>
    </div>
  );
}

/**
 * The language setting. Saving it changes `storage.local`; every page (this one included) and the
 * background follow it, and this page remounts in the new language.
 */
function LanguageSection() {
  const t = text();
  const [setting, setSetting] = useState<LanguageSetting>();
  useEffect(() => {
    void loadLanguageSetting().then(setSetting);
  }, []);
  const chrome = resolveLanguage('auto', browserLanguage()) === 'ru' ? t.nowRussian : t.nowEnglish;

  return (
    <Section title={t.language} description={t.languageAbout}>
      <ChoiceList
        name="language"
        value={setting}
        choices={LANGUAGE_SETTINGS.map((value) => ({
          value,
          label: t.languages[value].label,
          hint: value === 'auto' ? chrome : '',
        }))}
        onChange={(value) => {
          setSetting(value);
          void saveLanguageSetting(value);
        }}
      />
    </Section>
  );
}

function RestoreModeSection() {
  const t = text();
  const restoreMode = useUi((state) => state.restoreMode);
  const setRestoreMode = useUi((state) => state.setRestoreMode);
  return (
    <Section title={t.restore} description={t.restoreAbout}>
      <ChoiceList
        name="restore-mode"
        value={restoreMode}
        choices={RESTORE_MODES.map((mode) => ({ value: mode, ...t.restoreModes[mode] }))}
        onChange={setRestoreMode}
      />
    </Section>
  );
}

function BadgeModeSection() {
  const t = text();
  const badgeMode = useUi((state) => state.badgeMode);
  const setBadgeMode = useUi((state) => state.setBadgeMode);
  return (
    <Section title={t.badge} description={t.badgeAbout}>
      <ChoiceList
        name="badge-mode"
        value={badgeMode}
        choices={BADGE_MODES.map((mode) => ({
          value: mode,
          label: badgeModeLabel(mode),
          hint: t.badgeHints[mode],
        }))}
        onChange={setBadgeMode}
      />
    </Section>
  );
}

const loadHotkeys = async (): Promise<HotkeyRow[]> => hotkeyRows(await getHotkeys());

function HotkeysSection() {
  const t = text();
  const [rows] = useOnFocus(loadHotkeys);
  return (
    <Section title={t.hotkeys} description={t.hotkeysAbout}>
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
              <span className="shrink-0 text-xs text-fg-subtle">{t.notAssigned}</span>
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
          {t.changeInChrome}
          <ArrowUpRight aria-hidden className="size-4" />
        </button>
      </div>
    </Section>
  );
}

const loadSites = async (): Promise<SiteAccessRow[]> => siteAccessRows(await grantedSitePatterns());

function SiteAccessSection() {
  const t = text();
  const [rows, reload] = useOnFocus(loadSites);
  const showToast = useUi((state) => state.showToast);

  async function remove(row: SiteAccessRow) {
    const removed = await removeSiteAccess([row.pattern]);
    reload();
    showToast(removed ? text().accessRemoved(row.label) : text().accessKept(row.label));
  }

  return (
    <Section title={t.sites} description={t.sitesAbout}>
      {rows && rows.length === 0 ? (
        <p className="text-sm text-fg-muted">{t.noSites}</p>
      ) : (
        <>
          <p className="text-xs text-fg-subtle">{rows && t.sitesCount(rows.length)}</p>
          {/* A long list scrolls by itself, so the sections below stay close. */}
          <ul
            aria-label={t.sites}
            tabIndex={0}
            className="-mr-2 flex max-h-80 flex-col overflow-y-auto overscroll-contain pr-2"
          >
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
                  {t.removeAccess}
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
  const t = text();
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
      showToast(text().exported(name, backupContents(summarizeBackup(backup))));
    } catch {
      showToast(text().notExported);
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
    <Section title={t.data} description={t.dataAbout}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON_SECONDARY}
          disabled={busy}
          onClick={() => void exportFile()}
        >
          <Download aria-hidden className="size-4" />
          {t.exportFile}
        </button>
        <button
          type="button"
          className={BUTTON_SECONDARY}
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          <Upload aria-hidden className="size-4" />
          {t.importFile}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label={t.fileLabel}
          onChange={(event) => void chooseFile(event)}
        />
      </div>
      <p className="text-xs text-fg-subtle">{t.importNote}</p>
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
  const t = text();
  const now = useNow();
  const closing = openGroups > 0 ? t.closing(openGroups) : '';
  return (
    <Dialog.Root open={backup !== undefined} onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className={DIALOG_OVERLAY} />
        <Dialog.Content className={DIALOG_CONTENT}>
          <Dialog.Title className="text-md font-semibold">{t.importTitle}</Dialog.Title>
          <Dialog.Description className="text-sm text-fg-muted">
            {backup && describeBackup(summarizeBackup(backup), now)} {t.hasData}
          </Dialog.Description>
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex flex-col gap-0.5">
              <dt className="font-semibold text-fg">{t.add}</dt>
              <dd className="text-fg-muted">{t.addAbout}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-semibold text-fg">{t.replace}</dt>
              <dd className="text-fg-muted">{t.replaceAbout(closing)}</dd>
            </div>
          </dl>
          <p className="text-xs text-fg-subtle">{t.undoNote}</p>
          <div className="flex justify-end gap-2">
            <Dialog.Close type="button" className={BUTTON_SECONDARY}>
              {t.cancel}
            </Dialog.Close>
            <button type="button" className={BUTTON_DANGER} onClick={() => onImport(true)}>
              {t.replace}
            </button>
            <button
              type="button"
              className={BUTTON_PRIMARY}
              autoFocus
              onClick={() => onImport(false)}
            >
              {t.add}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
