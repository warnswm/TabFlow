/**
 * What the settings page shows: shortcuts in the order of the manifest, sites with access by
 * name, the summary of a backup before it is imported.
 */
import type { BackupSummary } from '../backup/format';
import { HOTKEYS, type HotkeyName } from '../hotkeys';
import { localized } from '../i18n';
import { words } from '../i18n/words';
import { shortDate } from './time-format';

const text = localized({
  ru: {
    hotkeys: {
      'collapse-all': 'Свернуть всё',
      'stow-current': 'Убрать текущую группу или вкладку в TabFlow',
      'sleep-current': 'Усыпить текущую группу',
      'open-app': 'Открыть TabFlow',
      'queue-current': 'Добавить текущую вкладку в очередь «на потом»',
      'open-queue': 'Открыть очередь в боковой панели',
      _execute_action: 'Открыть окно TabFlow на панели расширений',
    } satisfies Record<HotkeyName, string>,
    allSites: 'Все сайты',
    files: 'Локальные файлы',
    backup: (date: string, contents: string) => `Копия${date && ` от ${date}`}: ${contents}.`,
  },
  en: {
    hotkeys: {
      'collapse-all': 'Collapse all',
      'stow-current': 'Stow the current group or tab in TabFlow',
      'sleep-current': 'Put the current group to sleep',
      'open-app': 'Open TabFlow',
      'queue-current': 'Add the current tab to the watch-later queue',
      'open-queue': 'Open the queue in the side panel',
      _execute_action: 'Open the TabFlow popup',
    },
    allSites: 'All sites',
    files: 'Local files',
    backup: (date: string, contents: string) => `Backup${date && ` of ${date}`}: ${contents}.`,
  },
});

export interface HotkeyRow {
  name: string;
  description: string;
  /** Empty — no key assigned. */
  shortcut: string;
}

/** Shortcuts as the manifest lists them, with the keys Chrome has now. */
export function hotkeyRows(assigned: readonly { name: string; shortcut: string }[]): HotkeyRow[] {
  const keys = new Map(assigned.map(({ name, shortcut }) => [name, shortcut]));
  return (Object.keys(HOTKEYS) as HotkeyName[]).map((name) => ({
    name,
    description: text().hotkeys[name],
    shortcut: keys.get(name) ?? '',
  }));
}

export interface SiteAccessRow {
  pattern: string;
  label: string;
}

/** `*://*.youtube.com/*` → «youtube.com»; all sites, files — in words. Sorted by name. */
export function siteAccessRows(patterns: readonly string[]): SiteAccessRow[] {
  return [...new Set(patterns)]
    .map((pattern) => ({ pattern, label: sitePatternLabel(pattern) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
}

export function sitePatternLabel(pattern: string): string {
  if (pattern === '<all_urls>' || /^\*:\/\/\*\/\*$/.test(pattern)) return text().allSites;
  if (pattern.startsWith('file:')) return text().files;
  const match = /^[^:]+:\/\/(\*\.)?([^/]+)\//.exec(pattern);
  return match?.[2] ?? pattern;
}

/** «Копия от 19 окт 2026: 2 пространства · 12 групп · 140 ссылок · 8 видео · 1 раскладка». */
export function describeBackup(summary: BackupSummary, now: number): string {
  const date = summary.exportedAt > 0 ? shortDate(summary.exportedAt, now) : '';
  return text().backup(date, backupContents(summary));
}

/** «2 пространства · 12 групп · 140 ссылок · 8 видео · 1 раскладка». */
export function backupContents(summary: BackupSummary): string {
  const w = words();
  return [
    summary.spaces > 0 && w.spaces(summary.spaces),
    `${w.groups(summary.groups)} · ${w.links(summary.tabs)}`,
    summary.videos > 0 && w.videos(summary.videos),
    summary.layouts > 0 && w.layouts(summary.layouts),
  ]
    .filter(Boolean)
    .join(' · ');
}
