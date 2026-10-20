import {
  Archive,
  ArrowUpRight,
  CopyX,
  Group,
  ListVideo,
  Minimize2,
  Moon,
  SquareCheck,
  Settings,
  SquarePlay,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { isSaveableUrl } from '@/lib/background/tab-rules';
import {
  type BrowserTab,
  getHotkey,
  getOpenTabsInfo,
  getPageWindowId,
  listOpenTabs,
  type OpenTabsInfo,
  openSettingsPage,
  openSidePanel,
  requestSiteAccess,
  supportsSidePanel,
} from '@/lib/browser-api';
import { describeResponse } from '@/lib/command-messages';
import { localized } from '@/lib/i18n';
import { pluralEn, pluralRu, words } from '@/lib/i18n/words';
import { repositories } from '@/lib/db';
import { formatShortcut } from '@/lib/hotkeys';
import { type Command, sendCommand } from '@/lib/messages';
import { accessPatterns } from '@/lib/queue/site-access';
import { videoKey } from '@/lib/queue/video-url';
import { currentTarget, summarize } from '@/lib/summary';
import { duplicateCounts, findDuplicates } from '@/lib/tidy/duplicates';
import { groupableTabs } from '@/lib/tidy/grouping';
import { useLiveQuery } from '@/lib/use-live-query';

const listGroups = () => repositories.groups.listAll();
const listQueue = () => repositories.queue.list('queued');
const listLinks = () => repositories.tabs.listAll();

async function loadOpenTabs(): Promise<{ tabs: BrowserTab[]; windowId?: number }> {
  const [tabs, windowId] = await Promise.all([listOpenTabs(), getPageWindowId()]);
  return { tabs, windowId };
}

const text = localized({
  ru: {
    noAnswer: 'Фоновая часть TabFlow не ответила. Вкладки остались на месте.',
    pinned: 'закреплена',
    browserPage: 'служебная',
    settings: 'Настройки',
    tabsOpen: (n: number) => `${pluralRu(n, ['вкладка', 'вкладки', 'вкладок'])} открыто`,
    groupsAsleep: 'групп спят',
    stowed: 'убрано в TabFlow',
    collapseAll: 'Свернуть всё',
    quickActions: 'Быстрые действия',
    stowGroup: (name: string) => `Убрать ${name}`,
    asleep: 'спит',
    sleepGroup: (name: string) => `Усыпить ${name}`,
    stowTab: 'Убрать вкладку',
    stowSelected: 'Убрать выделенные',
    sleepInactive: 'Усыпить неактивные группы',
    queued: (n: number) => `в очереди · #${n}`,
    queueVideo: 'Видео в очередь',
    openQueue: 'Открыть очередь',
    openApp: 'Открыть TabFlow',
    duplicates: 'Закрыть дубликаты',
    sortTabs: 'Разложить вкладки по группам',
  },
  en: {
    noAnswer: 'The TabFlow background did not answer. Tabs stay where they are.',
    pinned: 'pinned',
    browserPage: 'browser page',
    settings: 'Settings',
    tabsOpen: (n: number) => `${pluralEn(n, ['tab', 'tabs'])} open`,
    groupsAsleep: 'groups asleep',
    stowed: 'stowed in TabFlow',
    collapseAll: 'Collapse all',
    quickActions: 'Quick actions',
    stowGroup: (name: string) => `Stow ${name}`,
    asleep: 'asleep',
    sleepGroup: (name: string) => `Put ${name} to sleep`,
    stowTab: 'Stow tab',
    stowSelected: 'Stow selected tabs',
    sleepInactive: 'Put inactive groups to sleep',
    queued: (n: number) => `queued · #${n}`,
    queueVideo: 'Add video to the queue',
    openQueue: 'Open queue',
    openApp: 'Open TabFlow',
    duplicates: 'Close duplicates',
    sortTabs: 'Sort tabs into groups',
  },
});

const NO_TABS: OpenTabsInfo = { count: 0, shownGroupIds: [], selected: 0 };

export default function App() {
  const t = text();
  const groups = useLiveQuery(listGroups) ?? [];
  const queued = useLiveQuery(listQueue) ?? [];
  const links = useLiveQuery(listLinks) ?? [];
  // All open tabs and this window: duplicates and tabs outside groups («Порядок»).
  const [open, setOpen] = useState<{ tabs: BrowserTab[]; windowId?: number }>({ tabs: [] });
  const [tabs, setTabs] = useState<OpenTabsInfo>(NO_TABS);
  const [shortcut, setShortcut] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const readTabs = useCallback(
    () =>
      Promise.all([getOpenTabsInfo(), loadOpenTabs()]).then(([info, all]) => {
        setTabs(info);
        setOpen(all);
      }),
    [],
  );

  useEffect(() => {
    void Promise.all([getOpenTabsInfo(), loadOpenTabs()]).then(([info, all]) => {
      setTabs(info);
      setOpen(all);
    });
    void getHotkey('collapse-all').then((key) => setShortcut(formatShortcut(key)));
  }, []);

  const summary = summarize(groups, new Set(tabs.shownGroupIds));
  const extras = duplicateCounts(findDuplicates(open.tabs, groups, links));
  const loose = open.windowId === undefined ? 0 : groupableTabs(open.tabs, open.windowId).length;
  const current: BrowserTab | undefined = tabs.current;
  const target = currentTarget(current, groups);
  const onTab = current ? { chromeTabId: current.id } : {};

  async function run(command: Command, name = '') {
    setBusy(true);
    try {
      setStatus(describeResponse(command.type, await sendCommand(command), name));
    } catch {
      setStatus(t.noAnswer);
    } finally {
      setBusy(false);
      await readTabs();
    }
  }

  async function openSettings() {
    await openSettingsPage();
    window.close();
  }

  async function openApp(screen?: 'tidy') {
    await sendCommand(screen ? { type: 'openApp', screen } : { type: 'openApp' });
    window.close();
  }

  // The current tab in the queue: its place, or -1.
  const queueIndex = current
    ? queued.findIndex((item) => videoKey(item.url) === videoKey(current.url))
    : -1;

  function queueCurrent() {
    if (!current) return;
    // Right in the click: Chrome asks once for the site (duration and position of its videos).
    void requestSiteAccess(accessPatterns(current.url));
    void run({ type: 'queueTab', chromeTabId: current.id });
  }

  function openQueue() {
    if (!current) return;
    // Nothing awaited before: Chrome opens the side panel only right in the click.
    void openSidePanel(current.windowId).then(() => window.close());
  }

  const groupName = target.kind === 'group' ? target.group.title || words().untitled : '';
  const noneNote =
    target.kind === 'none' ? (target.reason === 'pinned' ? t.pinned : t.browserPage) : '';

  return (
    <main className="flex w-[360px] flex-col bg-surface text-fg">
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
        <span className="flex size-6.5 items-center justify-center rounded-[7px] bg-accent text-on-accent">
          <svg
            aria-hidden="true"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="4" width="7" height="7" rx="1.5" />
            <rect x="14" y="4" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <path d="M14 17.5h7" />
          </svg>
        </span>
        <h1 className="text-[15px] font-bold">TabFlow</h1>
        <button
          type="button"
          aria-label={t.settings}
          title={t.settings}
          onClick={() => void openSettings()}
          className="ml-auto flex size-8 items-center justify-center rounded-md text-fg-muted transition-colors duration-(--duration-fast) hover:bg-surface-raised hover:text-fg"
        >
          <Settings aria-hidden className="size-4.5" />
        </button>
      </header>

      <section className="flex flex-col gap-3 p-4">
        <dl className="grid grid-cols-3 gap-2">
          <Stat value={tabs.count} label={t.tabsOpen(tabs.count)} />
          <Stat
            value={
              <>
                {summary.asleep}
                <span className="text-fg-subtle">/{summary.onStrip}</span>
              </>
            }
            label={t.groupsAsleep}
          />
          <Stat value={summary.stowed} label={t.stowed} accent />
        </dl>

        <button
          type="button"
          disabled={busy}
          onClick={() => void run({ type: 'collapseAll' })}
          className="flex h-11 items-center justify-center gap-2.5 rounded-[10px] bg-accent text-[15px] font-semibold text-on-accent transition-colors duration-(--duration-fast) hover:bg-accent-hover active:bg-accent-pressed disabled:opacity-50"
        >
          <Minimize2 aria-hidden="true" className="size-4.5" strokeWidth={2.2} />
          {t.collapseAll}
        </button>

        <p role="status" aria-live="polite" className="text-sm text-fg-muted empty:hidden">
          {status}
        </p>
      </section>

      <section aria-labelledby="quick-actions" className="flex flex-col gap-0.5 px-2">
        <h2
          id="quick-actions"
          className="px-2 pt-1 pb-1.5 text-[11px] font-semibold tracking-[0.06em] text-fg-subtle uppercase"
        >
          {t.quickActions}
        </h2>

        {target.kind === 'group' ? (
          <>
            <Action
              icon={<Archive />}
              disabled={busy}
              onClick={() => void run({ type: 'stowCurrent', ...onTab }, groupName)}
            >
              {t.stowGroup(words().quote(groupName))}
            </Action>
            <Action
              icon={<Moon />}
              disabled={busy || target.group.state === 'asleep'}
              note={target.group.state === 'asleep' ? t.asleep : undefined}
              onClick={() => void run({ type: 'sleepCurrent', ...onTab }, groupName)}
            >
              {t.sleepGroup(words().quote(groupName))}
            </Action>
          </>
        ) : (
          <Action
            icon={<Archive />}
            disabled={busy || target.kind === 'none'}
            note={noneNote || undefined}
            onClick={() => void run({ type: 'stowCurrent', ...onTab })}
          >
            {t.stowTab}
          </Action>
        )}

        {/* Tabs selected with Ctrl+click or Shift+click on the tab strip. */}
        {tabs.selected > 1 && (
          <Action
            icon={<SquareCheck />}
            disabled={busy}
            note={String(tabs.selected)}
            mono
            onClick={() => void run({ type: 'stowSelected' })}
          >
            {t.stowSelected}
          </Action>
        )}

        <Action
          icon={<Moon />}
          disabled={busy || summary.sleepable === 0}
          note={String(summary.sleepable)}
          mono
          onClick={() => void run({ type: 'sleepInactive' })}
        >
          {t.sleepInactive}
        </Action>

        <Action
          icon={<SquarePlay />}
          disabled={busy || !current || !isSaveableUrl(current.url) || queueIndex >= 0}
          note={queueIndex >= 0 ? t.queued(queueIndex + 1) : undefined}
          onClick={queueCurrent}
        >
          {t.queueVideo}
        </Action>

        {/* Both open «Порядок» on the main page: a preview first, undo in its toast. */}
        <Action
          icon={<CopyX />}
          disabled={extras.tabs + extras.links === 0}
          note={String(extras.tabs + extras.links)}
          mono
          onClick={() => void openApp('tidy')}
        >
          {t.duplicates}
        </Action>
        <Action
          icon={<Group />}
          disabled={loose < 2}
          note={String(loose)}
          mono
          onClick={() => void openApp('tidy')}
        >
          {t.sortTabs}
        </Action>

        {supportsSidePanel() && (
          <Action
            icon={<ListVideo />}
            disabled={!current}
            note={String(queued.length)}
            mono
            onClick={openQueue}
          >
            {t.openQueue}
          </Action>
        )}
      </section>

      <footer className="mt-auto flex items-center gap-2 border-t border-border px-4 py-3">
        <button
          type="button"
          onClick={() => void openApp()}
          className="flex items-center gap-1.5 rounded-sm font-semibold text-accent transition-colors duration-(--duration-fast) hover:text-accent-hover"
        >
          {t.openApp}
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </button>
        {shortcut && (
          <kbd
            title={t.collapseAll}
            className="ml-auto rounded-sm border border-border px-1.5 py-px font-mono text-[11px] text-fg-muted"
          >
            {shortcut}
          </kbd>
        )}
      </footer>
    </main>
  );
}

function Stat({ value, label, accent }: { value: ReactNode; label: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[10px] border border-border bg-bg p-2.5">
      <dt className="order-last text-xs text-fg-muted">{label}</dt>
      <dd className={`font-mono text-lg leading-6 ${accent ? 'text-accent' : ''}`}>{value}</dd>
    </div>
  );
}

function Action({
  icon,
  children,
  note,
  mono,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  children: ReactNode;
  note?: string;
  mono?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 items-center gap-3 rounded-md px-2 text-left text-base text-fg transition-colors duration-(--duration-fast) hover:bg-surface-raised disabled:opacity-50 disabled:hover:bg-transparent [&>svg]:size-4.5 [&>svg]:shrink-0 [&>svg]:text-fg-muted"
    >
      {icon}
      <span className="min-w-0 truncate">{children}</span>
      {note !== undefined && (
        <span className={`ml-auto shrink-0 text-xs text-fg-muted ${mono ? 'font-mono' : ''}`}>
          {note}
        </span>
      )}
    </button>
  );
}
