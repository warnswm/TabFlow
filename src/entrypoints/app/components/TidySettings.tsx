import { useEffect, useState } from 'react';
import { type BuiltInAiState, prepareBuiltInAi } from '@/lib/browser-api';
import { getLanguage, localized } from '@/lib/i18n';
import { words } from '@/lib/i18n/words';
import {
  loadAiGrouping,
  loadAutoSleep,
  loadGroupingRules,
  saveAiGrouping,
  saveAutoSleepMinutes,
  saveGroupingRules,
  saveKeepAwakeSites,
} from '@/lib/settings';
import { AUTO_SLEEP_MINUTES, type AutoSleepMinutes, parseSiteList } from '@/lib/tidy/auto-sleep';
import { parseTopicRules } from '@/lib/tidy/grouping';
import { useBuiltInAi } from '../hooks';
import { ChoiceList, Section } from './SettingsParts';

/** Settings of autosleep and of «Разложить вкладки» (the screen «Порядок»). */

const text = localized({
  ru: {
    autoSleep: 'Автосон групп',
    autoSleepAbout:
      'Группа, в которую давно не заходили, засыпает сама: вкладки выгружаются из памяти и остаются на панели.',
    minutes: (m: AutoSleepMinutes) =>
      m === 0 ? 'Выключен' : m < 60 ? `Через ${m} мин` : m === 60 ? 'Через 1 час' : 'Через 2 часа',
    byDefault: 'По умолчанию.',
    keepAwake: 'Не усыплять сайты',
    keepAwakeHint:
      'По одному на строке или через запятую. Вкладки этих сайтов не засыпают, остальные вкладки их группы — засыпают.',
    keepAwakePlaceholder: 'music.yandex.ru\nweb.telegram.org',
    sitesSaved: (n: number) => (n === 0 ? 'Список пуст.' : `В списке: ${words().sites(n)}.`),
    alwaysAwake:
      'Не засыпают никогда: группа вкладки на экране, вкладки со звуком, закреплённые. Группу целиком — «Не засыпать автоматически» в меню плитки.',
    grouping: 'Разложить вкладки',
    groupingAbout:
      'Экран «Порядок» собирает вкладки окна вне групп в группы по темам или по сайтам — с предпросмотром и «Отменить».',
    rules: 'Свои темы',
    rulesHint:
      'По одной на строке: название, двоеточие, слова заголовка или сайты через запятую. Свои темы проверяются первыми.',
    rulesPlaceholder: 'Работа: jira, confluence, corp.example.com\nДача: семена, теплица',
    rulesSaved: (n: number) => (n === 0 ? 'Своих тем нет.' : `Своих тем: ${n}.`),
    ai: 'Темы с помощью Gemini Nano (эксперимент)',
    aiStates: {
      available:
        'Встроенная нейросеть Chrome готова. Работает на этом компьютере, данные не уходят.',
      downloadable:
        'Chrome скачает модель при включении — несколько ГБ, один раз для всех сайтов и расширений.',
      downloading: 'Chrome скачивает модель…',
      unavailable:
        'Недоступно в этом браузере: нужна встроенная нейросеть Chrome (Gemini Nano) и мощный компьютер. Темы берутся из словаря.',
    } as Record<BuiltInAiState, string>,
    aiNote:
      'Русский язык Gemini Nano пока официально не поддерживает — названия групп могут быть неточными.',
    downloaded: (share: number) => `Скачано ${Math.round(share * 100)} %.`,
    downloadFailed: 'Модель не скачалась. Темы берутся из словаря.',
    downloadWhere:
      'Chrome качает модель в свой профиль (папка OptGuideOnDeviceModel), ход загрузки — на странице chrome://on-device-internals. Когда закончит, надпись сменится сама.',
  },
  en: {
    autoSleep: 'Autosleep',
    autoSleepAbout:
      'A group nobody has opened for a while falls asleep by itself: its tabs are unloaded from memory and stay on the tab strip.',
    minutes: (m: AutoSleepMinutes) =>
      m === 0 ? 'Off' : m < 60 ? `After ${m} min` : m === 60 ? 'After 1 hour' : 'After 2 hours',
    byDefault: 'Default.',
    keepAwake: 'Never put to sleep',
    keepAwakeHint:
      'One site per line or separated by commas. Tabs of these sites stay awake; the other tabs of their group fall asleep.',
    keepAwakePlaceholder: 'open.spotify.com\nweb.whatsapp.com',
    sitesSaved: (n: number) =>
      n === 0 ? 'The list is empty.' : `In the list: ${words().sites(n)}.`,
    alwaysAwake:
      'Never asleep: the group of the tab on screen, tabs playing sound, pinned tabs. A whole group — “Keep awake” in the tile menu.',
    grouping: 'Sort tabs into groups',
    groupingAbout:
      'The “Tidy up” screen sorts the tabs of a window outside groups into groups by topic or by site — with a preview and Undo.',
    rules: 'Own topics',
    rulesHint:
      'One per line: a name, a colon, title words or sites separated by commas. Own topics are checked first.',
    rulesPlaceholder: 'Work: jira, confluence, corp.example.com\nGarden: seeds, greenhouse',
    rulesSaved: (n: number) => (n === 0 ? 'No own topics.' : `Own topics: ${n}.`),
    ai: 'Topics by Gemini Nano (experimental)',
    aiStates: {
      available: 'The built-in AI of Chrome is ready. It runs on this computer; nothing leaves it.',
      downloadable:
        'Chrome downloads the model when this is turned on — several GB, once for all sites and extensions.',
      downloading: 'Chrome is downloading the model…',
      unavailable:
        'Not available in this browser: it needs the built-in AI of Chrome (Gemini Nano) and a capable computer. Topics come from the dictionary.',
    },
    aiNote: 'Experimental: group names may be imprecise.',
    downloaded: (share: number) => `Downloaded ${Math.round(share * 100)}%.`,
    downloadFailed: 'The model did not download. Topics come from the dictionary.',
    downloadWhere:
      'Chrome downloads the model into its profile (folder OptGuideOnDeviceModel); progress is on chrome://on-device-internals. This line changes by itself when it is done.',
  },
});

const TEXTAREA =
  'min-h-20 w-full rounded-md border border-border-control bg-bg px-3 py-2 font-mono text-sm text-fg placeholder:text-fg-subtle';

export function AutoSleepSection() {
  const t = text();
  const [minutes, setMinutes] = useState<AutoSleepMinutes>();
  const [sites, setSites] = useState('');
  const [count, setCount] = useState(0);
  useEffect(() => {
    void loadAutoSleep().then((settings) => {
      setMinutes(settings.minutes);
      setSites(settings.sites.join('\n'));
      setCount(settings.sites.length);
    });
  }, []);

  function saveSites() {
    const parsed = parseSiteList(sites);
    setSites(parsed.join('\n'));
    setCount(parsed.length);
    void saveKeepAwakeSites(parsed);
  }

  return (
    <Section title={t.autoSleep} description={t.autoSleepAbout}>
      <ChoiceList
        name="auto-sleep"
        value={minutes === undefined ? undefined : String(minutes)}
        choices={AUTO_SLEEP_MINUTES.map((m) => ({
          value: String(m),
          label: t.minutes(m),
          hint: m === 30 ? t.byDefault : '',
        }))}
        onChange={(value) => {
          const m = Number(value) as AutoSleepMinutes;
          setMinutes(m);
          void saveAutoSleepMinutes(m);
        }}
      />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-fg">{t.keepAwake}</span>
        <span className="text-xs text-fg-muted">{t.keepAwakeHint}</span>
        <textarea
          value={sites}
          onChange={(event) => setSites(event.target.value)}
          onBlur={saveSites}
          placeholder={t.keepAwakePlaceholder}
          rows={3}
          spellCheck={false}
          className={TEXTAREA}
        />
        <span className="text-xs text-fg-subtle">{t.sitesSaved(count)}</span>
      </label>
      <p className="text-xs text-fg-muted">{t.alwaysAwake}</p>
    </Section>
  );
}

export function GroupingSection() {
  const t = text();
  const [rules, setRules] = useState('');
  const [ai, setAi] = useState(false);
  const [state, setState] = useBuiltInAi();
  const [progress, setProgress] = useState<string>();

  useEffect(() => {
    void loadGroupingRules().then(setRules);
    void loadAiGrouping().then(setAi);
  }, []);

  function toggleAi(on: boolean) {
    setAi(on);
    void saveAiGrouping(on);
    if (!on || state !== 'downloadable') return;
    // Right in the click: Chrome downloads the model only after a user action.
    setState('downloading');
    prepareBuiltInAi(getLanguage(), (share) => setProgress(t.downloaded(share)))
      .then(() => {
        setProgress(undefined);
        setState('available');
      })
      .catch(() => setProgress(t.downloadFailed));
  }

  const unavailable = state === 'unavailable';
  return (
    <Section title={t.grouping} description={t.groupingAbout}>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-fg">{t.rules}</span>
        <span className="text-xs text-fg-muted">{t.rulesHint}</span>
        <textarea
          value={rules}
          onChange={(event) => setRules(event.target.value)}
          onBlur={() => void saveGroupingRules(rules)}
          placeholder={t.rulesPlaceholder}
          rows={3}
          spellCheck={false}
          className={TEXTAREA}
        />
        <span className="text-xs text-fg-subtle">
          {t.rulesSaved(parseTopicRules(rules).length)}
        </span>
      </label>
      <label
        className={`flex items-start gap-3 rounded-md px-2 py-2 ${unavailable ? 'opacity-50' : 'cursor-pointer hover:bg-surface-raised'}`}
      >
        <input
          type="checkbox"
          checked={ai && !unavailable}
          disabled={unavailable || state === undefined}
          onChange={(event) => toggleAi(event.target.checked)}
          className="mt-1 size-4 shrink-0 accent-accent"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm text-fg">{t.ai}</span>
          {state && <span className="text-xs text-fg-muted">{t.aiStates[state]}</span>}
          {state === 'downloading' && (
            <span className="text-xs text-fg-muted">{progress ?? t.downloadWhere}</span>
          )}
          {state !== 'downloading' && progress && (
            <span className="text-xs text-fg-muted">{progress}</span>
          )}
          {!unavailable && <span className="text-xs text-fg-subtle">{t.aiNote}</span>}
        </span>
      </label>
    </Section>
  );
}
