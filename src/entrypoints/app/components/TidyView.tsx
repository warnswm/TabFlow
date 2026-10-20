import { CopyX, Group, Sparkles } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { displayHost, type Overview } from '@/lib/app/overview';
import {
  type BrowserTab,
  faviconUrl,
  getPageWindowId,
  listOpenTabs,
  promptBuiltInAi,
} from '@/lib/browser-api';
import { getLanguage, localized } from '@/lib/i18n';
import { words } from '@/lib/i18n/words';
import {
  loadAiGrouping,
  loadGroupingMode,
  loadGroupingRules,
  saveGroupingMode,
} from '@/lib/settings';
import { AI_ANSWER_SCHEMA, aiPrompt, readAiAnswer } from '@/lib/tidy/ai-grouping';
import {
  duplicateCounts,
  type DuplicateItem,
  type DuplicateSet,
  findDuplicates,
} from '@/lib/tidy/duplicates';
import {
  type ExistingGroup,
  GROUPING_MODES,
  type GroupingMode,
  groupableTabs,
  type Placement,
  planGrouping,
  parseTopicRules,
  sitePlacer,
  topicPlacer,
} from '@/lib/tidy/grouping';
import { runCommand } from '../commands';
import { useBuiltInAi } from '../hooks';
import { useUi } from '../store';
import { BUTTON_PRIMARY, BUTTON_SECONDARY, GROUP_DOT, untitled } from '../ui';

/**
 * «Порядок» (`#/tidy`): duplicates among open tabs and saved links, and sorting the tabs of this
 * window outside groups into groups. Both with a preview (every row can be left out) and
 * «Отменить» in the toast. Opened from the sidebar, the popup and the palette.
 */

const text = localized({
  ru: {
    title: 'Порядок',
    intro:
      'Дубликаты и вкладки вне групп — сначала предпросмотр, потом действие. Всё можно отменить.',
    duplicates: 'Дубликаты',
    duplicatesAbout:
      'Одна страница, открытая или сохранённая несколько раз. Адреса сравниваются без #якоря и меток рекламы (utm), видео YouTube — по ролику.',
    noDuplicates: 'Дубликатов нет: каждая страница открыта и сохранена один раз.',
    keepTab: (group?: string) =>
      group ? `Останется вкладка группы ${group}.` : 'Останется одна вкладка.',
    keepLink: (group: string) => `Останется ссылка в ${group}.`,
    closeTabs: (n: number) => `Закроется: ${words().tabs(n)}`,
    trashLinks: (groups: string) => `В корзину — ссылки из ${groups}`,
    closeButton: (n: number) => `Закрыть дубликаты · ${n}`,
    totals: (tabs: number, links: number) =>
      [tabs > 0 && `лишних вкладок: ${tabs}`, links > 0 && `повторов ссылок: ${links}`]
        .filter(Boolean)
        .join(' · '),
    grouping: 'Разложить вкладки',
    groupingAbout: (n: number) =>
      `Вкладки этого окна вне групп: ${n}. Группа собирается из двух вкладок и больше; новые группы появятся на панели и во «Входящих».`,
    modes: { topic: 'По темам', site: 'По сайтам' } as Record<GroupingMode, string>,
    nothingToGroup: 'Раскладывать нечего: вкладки вне групп не набирают и двух на тему или сайт.',
    joins: 'добавятся в группу на панели',
    groupButton: (n: number) => `Разложить · ${words().tabs(n)}`,
    more: (n: number) => `и ещё ${n}`,
    askAi: 'Спросить Gemini Nano',
    aiThinking: 'Gemini Nano раскладывает…',
    aiDownloading:
      'Chrome ещё скачивает Gemini Nano — кнопка «Спросить Gemini Nano» появится здесь сама. Пока темы — из словаря.',
    aiUsed: 'Темы — от Gemini Nano (эксперимент).',
    dictionary: 'Вернуть словарь',
    aiFailed: 'Gemini Nano не ответил — темы взяты из словаря. Вкладки на месте.',
    aiEmpty: 'Gemini Nano не нашёл тем — оставлен словарь. Вкладки на месте.',
  },
  en: {
    title: 'Tidy up',
    intro:
      'Duplicates and tabs outside groups — a preview first, then the action. Everything can be undone.',
    duplicates: 'Duplicates',
    duplicatesAbout:
      'One page open or saved more than once. Addresses are compared without #anchors and ad tags (utm); YouTube videos by the video.',
    noDuplicates: 'No duplicates: every page is open and saved once.',
    keepTab: (group?: string) => (group ? `The tab of group ${group} stays.` : 'One tab stays.'),
    keepLink: (group: string) => `The link in ${group} stays.`,
    closeTabs: (n: number) => `Closes: ${words().tabs(n)}`,
    trashLinks: (groups: string) => `To Trash — links from ${groups}`,
    closeButton: (n: number) => `Close duplicates · ${n}`,
    totals: (tabs: number, links: number) =>
      [tabs > 0 && `extra tabs: ${tabs}`, links > 0 && `repeated links: ${links}`]
        .filter(Boolean)
        .join(' · '),
    grouping: 'Sort tabs into groups',
    groupingAbout: (n: number) =>
      `Tabs of this window outside groups: ${n}. A group needs two tabs or more; new groups appear on the tab strip and in Inbox.`,
    modes: { topic: 'By topic', site: 'By site' },
    nothingToGroup: 'Nothing to sort: no topic or site has two tabs outside groups.',
    joins: 'join the group on the tab strip',
    groupButton: (n: number) => `Sort · ${words().tabs(n)}`,
    more: (n: number) => `and ${n} more`,
    askAi: 'Ask Gemini Nano',
    aiThinking: 'Gemini Nano is sorting…',
    aiDownloading:
      'Chrome is still downloading Gemini Nano — “Ask Gemini Nano” appears here by itself. Until then topics come from the dictionary.',
    aiUsed: 'Topics by Gemini Nano (experimental).',
    dictionary: 'Back to the dictionary',
    aiFailed: 'Gemini Nano did not answer — topics come from the dictionary. Tabs are in place.',
    aiEmpty: 'Gemini Nano found no topics — the dictionary stays. Tabs are in place.',
  },
});

/** Open tabs and the window of this page; read again on focus and every few seconds. */
function useOpenTabs(overview: Overview): {
  tabs: BrowserTab[];
  windowId?: number;
  reload(): void;
} {
  const [state, setState] = useState<{ tabs: BrowserTab[]; windowId?: number }>({ tabs: [] });
  const reload = useCallback(() => {
    Promise.all([listOpenTabs(), getPageWindowId()])
      .then(([tabs, windowId]) => setState({ tabs, windowId }))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    reload();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') reload();
    }, 4000);
    window.addEventListener('focus', reload);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', reload);
    };
  }, [reload]);
  // Groups changed in TabFlow: their tabs did too.
  useEffect(reload, [overview, reload]);
  return { ...state, reload };
}

export function TidyView({ overview }: { overview: Overview }) {
  const t = text();
  const open = useOpenTabs(overview);
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-[-0.02em]">{t.title}</h1>
        <p className="text-sm text-fg-muted">{t.intro}</p>
      </header>
      <DuplicatesSection overview={overview} tabs={open.tabs} onDone={open.reload} />
      {open.windowId !== undefined && (
        <GroupingSection
          overview={overview}
          tabs={open.tabs}
          windowId={open.windowId}
          onDone={open.reload}
        />
      )}
    </div>
  );
}

function Card({
  icon,
  title,
  description,
  aside,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="flex items-center gap-2 text-md font-semibold [&_svg]:size-4 [&_svg]:text-fg-muted">
            {icon}
            {title}
          </h2>
          <p className="text-sm text-fg-muted">{description}</p>
        </div>
        {aside}
      </div>
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        {children}
      </div>
    </section>
  );
}

function Favicon({ url }: { url: string }) {
  return <img src={faviconUrl(url, 16)} alt="" className="size-4 shrink-0" />;
}

/** A row with a checkbox: unchecked rows are left out. */
function CheckRow({
  checked,
  onChange,
  label,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <li className="border-b border-border last:border-b-0">
      <label className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-surface-raised">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-label={label}
          className="mt-0.5 size-4 shrink-0 accent-accent"
        />
        <span className={`flex min-w-0 flex-1 flex-col gap-0.5 ${checked ? '' : 'opacity-50'}`}>
          {children}
        </span>
      </label>
    </li>
  );
}

/** Items left out of the preview, by key; keys that are gone are forgotten by themselves. */
function useLeftOut(): [ReadonlySet<string>, (key: string, out: boolean) => void] {
  const [leftOut, setLeftOut] = useState<ReadonlySet<string>>(new Set());
  const toggle = useCallback((key: string, out: boolean) => {
    setLeftOut((current) => {
      const next = new Set(current);
      if (out) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  return [leftOut, toggle];
}

function DuplicatesSection({
  overview,
  tabs,
  onDone,
}: {
  overview: Overview;
  tabs: readonly BrowserTab[];
  onDone: () => void;
}) {
  const t = text();
  const found = useMemo(() => {
    const views = overview.spaces.flatMap((space) => space.groups);
    return findDuplicates(
      tabs,
      views.map((view) => view.group),
      views.flatMap((view) => view.tabs),
    );
  }, [overview, tabs]);
  const [leftOut, setLeftOut] = useLeftOut();
  const [running, setRunning] = useState(false);
  const sets = [...found.tabs, ...found.links];
  const chosen = sets.filter((set) => !leftOut.has(set.key));
  const counts = duplicateCounts(found);
  const selected = chosen.reduce((sum, set) => sum + set.extras.length, 0);

  async function close() {
    setRunning(true);
    await runCommand({ type: 'closeDuplicates', keys: chosen.map((set) => set.key) });
    setRunning(false);
    onDone();
  }

  return (
    <Card
      icon={<CopyX aria-hidden />}
      title={t.duplicates}
      description={t.duplicatesAbout}
      aside={
        sets.length > 0 && (
          <span className="shrink-0 font-mono text-xs text-fg-muted">
            {t.totals(counts.tabs, counts.links)}
          </span>
        )
      }
    >
      {sets.length === 0 ? (
        <p className="text-sm text-fg-muted">{t.noDuplicates}</p>
      ) : (
        <>
          <ul className="flex flex-col">
            {sets.map((set) => (
              <CheckRow
                key={set.key}
                checked={!leftOut.has(set.key)}
                onChange={(checked) => setLeftOut(set.key, !checked)}
                label={set.keep.title || displayHost(set.keep.url)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Favicon url={set.keep.url} />
                  <span className="truncate text-sm text-fg">
                    {set.keep.title || displayHost(set.keep.url)}
                  </span>
                  <span className="shrink-0 text-xs text-fg-subtle">
                    {displayHost(set.keep.url)}
                  </span>
                </span>
                <span className="text-xs text-fg-muted">{describeSet(set)}</span>
              </CheckRow>
            ))}
          </ul>
          <div className="flex justify-end">
            <button
              type="button"
              className={BUTTON_PRIMARY}
              disabled={running || selected === 0}
              onClick={() => void close()}
            >
              {t.closeButton(selected)}
            </button>
          </div>
        </>
      )}
    </Card>
  );
}

/** «Останется вкладка группы «Учёба». Закроется: 2 вкладки · В корзину — ссылки из «Чтение»». */
function describeSet(set: DuplicateSet): string {
  const t = text();
  const quote = (title: string) => words().quote(title || untitled());
  const groupOf = (item: DuplicateItem) => (item.kind === 'link' ? item : item.link);
  const keepGroup = groupOf(set.keep);
  const keep =
    set.keep.kind === 'link'
      ? t.keepLink(quote(set.keep.groupTitle))
      : t.keepTab(keepGroup && quote(keepGroup.groupTitle));
  const tabs = set.extras.filter((item) => item.kind === 'tab').length;
  const groups = [
    ...new Set(
      set.extras.flatMap((item) => {
        const group = groupOf(item);
        return group ? [quote(group.groupTitle)] : [];
      }),
    ),
  ];
  const parts = [
    tabs > 0 && t.closeTabs(tabs),
    groups.length > 0 && t.trashLinks(groups.join(', ')),
  ];
  return `${keep} ${parts.filter(Boolean).join(' · ')}.`;
}

function GroupingSection({
  overview,
  tabs,
  windowId,
  onDone,
}: {
  overview: Overview;
  tabs: readonly BrowserTab[];
  windowId: number;
  onDone: () => void;
}) {
  const t = text();
  const language = getLanguage();
  const [mode, setMode] = useState<GroupingMode>('topic');
  const [rules, setRules] = useState('');
  const [aiOn, setAiOn] = useState(false);
  const [aiState] = useBuiltInAi();
  const [aiPlacements, setAiPlacements] = useState<ReadonlyMap<number, Placement>>();
  const [thinking, setThinking] = useState(false);
  const [running, setRunning] = useState(false);
  const [leftOut, setLeftOut] = useLeftOut();

  useEffect(() => {
    void loadGroupingMode().then(setMode);
    void loadGroupingRules().then(setRules);
    void loadAiGrouping().then(setAiOn);
  }, []);

  const loose = useMemo(() => groupableTabs(tabs, windowId), [tabs, windowId]);
  const existing = useMemo<ExistingGroup[]>(
    () =>
      overview.spaces.flatMap((space) =>
        space.groups.flatMap(({ group }) =>
          group.chromeGroupId !== undefined && group.windowId === windowId
            ? [{ id: group.chromeGroupId, title: group.title, color: group.color }]
            : [],
        ),
      ),
    [overview, windowId],
  );
  const plan = useMemo(() => {
    if (mode === 'site') return planGrouping(loose, existing, sitePlacer(language));
    const dictionary = topicPlacer(parseTopicRules(rules), language);
    const place = aiPlacements
      ? (tab: (typeof loose)[number]) => aiPlacements.get(tab.id) ?? dictionary(tab)
      : dictionary;
    return planGrouping(loose, existing, place);
  }, [mode, loose, existing, rules, aiPlacements, language]);
  const titles = useMemo(() => new Map(loose.map((tab) => [tab.id, tab])), [loose]);
  const chosen = plan.filter((group) => !leftOut.has(group.title));
  const selected = chosen.reduce((sum, group) => sum + group.tabIds.length, 0);
  const aiWanted = aiOn && mode === 'topic' && loose.length >= 2;
  // The button only once Chrome has the model; while it downloads — a line saying so.
  const aiReady = aiWanted && aiState === 'available';
  const aiWaiting = aiWanted && (aiState === 'downloading' || aiState === 'downloadable');

  function changeMode(next: GroupingMode) {
    setMode(next);
    void saveGroupingMode(next);
  }

  async function askAi() {
    const { showToast } = useUi.getState();
    setThinking(true);
    try {
      const answer = await promptBuiltInAi(aiPrompt(loose), AI_ANSWER_SCHEMA);
      const placements = readAiAnswer(answer, loose, language);
      if (placements.size === 0) showToast(t.aiEmpty);
      else setAiPlacements(placements);
    } catch {
      showToast(t.aiFailed);
    } finally {
      setThinking(false);
    }
  }

  async function group() {
    setRunning(true);
    await runCommand({
      type: 'groupTabs',
      groups: chosen.map((planned) => ({
        title: planned.title,
        color: planned.color,
        chromeTabIds: planned.tabIds,
        ...(planned.joinChromeGroupId !== undefined && {
          joinChromeGroupId: planned.joinChromeGroupId,
        }),
      })),
    });
    setRunning(false);
    setAiPlacements(undefined);
    onDone();
  }

  return (
    <Card
      icon={<Group aria-hidden />}
      title={t.grouping}
      description={t.groupingAbout(loose.length)}
      aside={
        <div role="radiogroup" className="flex shrink-0 rounded-md border border-border p-0.5">
          {GROUPING_MODES.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => changeMode(value)}
              className={`h-7 rounded-sm px-2.5 text-sm transition-colors duration-(--duration-fast) ${
                mode === value
                  ? 'bg-accent-soft font-semibold text-accent'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              {t.modes[value]}
            </button>
          ))}
        </div>
      }
    >
      {aiWaiting && <p className="text-xs text-fg-muted">{t.aiDownloading}</p>}
      {aiReady && (
        <div className="flex flex-wrap items-center gap-3">
          {aiPlacements ? (
            <>
              <span className="text-xs text-fg-muted">{t.aiUsed}</span>
              <button
                type="button"
                className={BUTTON_SECONDARY}
                onClick={() => setAiPlacements(undefined)}
              >
                {t.dictionary}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={BUTTON_SECONDARY}
              disabled={thinking}
              onClick={() => void askAi()}
            >
              <Sparkles aria-hidden className="size-4" />
              {thinking ? t.aiThinking : t.askAi}
            </button>
          )}
        </div>
      )}
      {plan.length === 0 ? (
        <p className="text-sm text-fg-muted">{t.nothingToGroup}</p>
      ) : (
        <>
          <ul className="flex flex-col">
            {plan.map((planned) => {
              const shown = planned.tabIds.slice(0, 4).flatMap((id) => {
                const tab = titles.get(id);
                return tab ? [tab] : [];
              });
              const hidden = planned.tabIds.length - shown.length;
              return (
                <CheckRow
                  key={planned.title}
                  checked={!leftOut.has(planned.title)}
                  onChange={(checked) => setLeftOut(planned.title, !checked)}
                  label={planned.title}
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={`size-2.5 shrink-0 rounded-full ${GROUP_DOT[planned.color]}`}
                    />
                    <span className="truncate text-sm font-semibold text-fg">{planned.title}</span>
                    <span className="shrink-0 font-mono text-xs text-fg-muted">
                      {planned.tabIds.length}
                    </span>
                    {planned.joinChromeGroupId !== undefined && (
                      <span className="shrink-0 text-xs text-fg-subtle">{t.joins}</span>
                    )}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {shown.map((tab) => (
                      <span key={tab.id} className="flex max-w-56 min-w-0 items-center gap-1.5">
                        <Favicon url={tab.url} />
                        <span className="truncate text-xs text-fg-muted">
                          {tab.title || displayHost(tab.url)}
                        </span>
                      </span>
                    ))}
                    {hidden > 0 && <span className="text-xs text-fg-subtle">{t.more(hidden)}</span>}
                  </span>
                </CheckRow>
              );
            })}
          </ul>
          <div className="flex justify-end">
            <button
              type="button"
              className={BUTTON_PRIMARY}
              disabled={running || selected === 0}
              onClick={() => void group()}
            >
              {t.groupButton(selected)}
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
