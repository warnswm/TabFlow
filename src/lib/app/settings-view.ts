/**
 * What the settings page shows: shortcuts in the order of the manifest, sites with access by
 * name, the summary of a backup before it is imported.
 */
import type { BackupSummary } from '../backup/format';
import { count, GROUPS } from '../command-messages';
import { HOTKEYS, type HotkeyName } from '../hotkeys';
import { shortDate } from './time-format';

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
    description: HOTKEYS[name].description,
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
  if (pattern === '<all_urls>' || /^\*:\/\/\*\/\*$/.test(pattern)) return 'Все сайты';
  if (pattern.startsWith('file:')) return 'Локальные файлы';
  const match = /^[^:]+:\/\/(\*\.)?([^/]+)\//.exec(pattern);
  return match?.[2] ?? pattern;
}

const SPACES: [string, string, string] = ['пространство', 'пространства', 'пространств'];
const LINKS: [string, string, string] = ['ссылка', 'ссылки', 'ссылок'];
const LAYOUTS: [string, string, string] = ['раскладка', 'раскладки', 'раскладок'];

/** «Копия от 19 окт 2026: 2 пространства · 12 групп · 140 ссылок · 8 видео · 1 раскладка». */
export function describeBackup(summary: BackupSummary, now: number): string {
  const date = summary.exportedAt > 0 ? ` от ${shortDate(summary.exportedAt, now)}` : '';
  return `Копия${date}: ${backupContents(summary)}.`;
}

/** «2 пространства · 12 групп · 140 ссылок · 8 видео · 1 раскладка». */
export function backupContents(summary: BackupSummary): string {
  return [
    summary.spaces > 0 && count(summary.spaces, SPACES),
    `${count(summary.groups, GROUPS)} · ${count(summary.tabs, LINKS)}`,
    summary.videos > 0 && `${summary.videos} видео`,
    summary.layouts > 0 && count(summary.layouts, LAYOUTS),
  ]
    .filter(Boolean)
    .join(' · ');
}
