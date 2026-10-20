/**
 * User settings in `storage.local`: the restore mode, what the badge counts, the interface
 * language, autosleep and how tabs are sorted into groups, chosen on the settings page
 * (`#/settings` of the main page).
 */
import { browserLanguage, onSettingsChanged, readSetting, writeSetting } from './browser-api';
import {
  type Language,
  type LanguageSetting,
  parseLanguageSetting,
  resolveLanguage,
  setLanguage,
} from './i18n';
import { RESTORE_MODES, type RestoreMode } from './messages';
import { BADGE_MODES, type BadgeMode } from './summary';
import {
  AUTO_SLEEP_MINUTES,
  type AutoSleepMinutes,
  type AutoSleepSettings,
  DEFAULT_AUTO_SLEEP_MINUTES,
} from './tidy/auto-sleep';
import { GROUPING_MODES, type GroupingMode } from './tidy/grouping';

const RESTORE_MODE_KEY = 'tabflow.restoreMode';
export const DEFAULT_RESTORE_MODE: RestoreMode = 'placeholder';

export function parseRestoreMode(value: unknown): RestoreMode {
  return RESTORE_MODES.includes(value as RestoreMode)
    ? (value as RestoreMode)
    : DEFAULT_RESTORE_MODE;
}

export async function loadRestoreMode(): Promise<RestoreMode> {
  return parseRestoreMode(await readSetting(RESTORE_MODE_KEY));
}

export async function saveRestoreMode(mode: RestoreMode): Promise<void> {
  await writeSetting(RESTORE_MODE_KEY, mode);
}

const BADGE_MODE_KEY = 'tabflow.badgeMode';
export const DEFAULT_BADGE_MODE: BadgeMode = 'today';

export function parseBadgeMode(value: unknown): BadgeMode {
  return BADGE_MODES.includes(value as BadgeMode) ? (value as BadgeMode) : DEFAULT_BADGE_MODE;
}

export async function loadBadgeMode(): Promise<BadgeMode> {
  return parseBadgeMode(await readSetting(BADGE_MODE_KEY));
}

export async function saveBadgeMode(mode: BadgeMode): Promise<void> {
  await writeSetting(BADGE_MODE_KEY, mode);
}

const LANGUAGE_KEY = 'tabflow.language';

export async function loadLanguageSetting(): Promise<LanguageSetting> {
  return parseLanguageSetting(await readSetting(LANGUAGE_KEY));
}

export async function saveLanguageSetting(setting: LanguageSetting): Promise<void> {
  await writeSetting(LANGUAGE_KEY, setting);
}

/** The interface language: the setting, or the language of Chrome for «Как в Chrome». */
export async function loadLanguage(): Promise<Language> {
  return resolveLanguage(await loadLanguageSetting(), browserLanguage());
}

/** Calls back when the language setting changes (on any page). */
export function onLanguageSettingChanged(callback: () => void): void {
  onSettingsChanged((keys) => {
    if (keys.includes(LANGUAGE_KEY)) callback();
  });
}

/**
 * A page starts in the stored language and follows the setting; render after this resolves, so
 * the first frame is already in the right language.
 */
export async function startPageLanguage(): Promise<void> {
  setLanguage(await loadLanguage());
  onLanguageSettingChanged(() => void loadLanguage().then(setLanguage));
}

const AUTO_SLEEP_MINUTES_KEY = 'tabflow.autoSleepMinutes';
const KEEP_AWAKE_SITES_KEY = 'tabflow.keepAwakeSites';

export function parseAutoSleepMinutes(value: unknown): AutoSleepMinutes {
  return AUTO_SLEEP_MINUTES.includes(value as AutoSleepMinutes)
    ? (value as AutoSleepMinutes)
    : DEFAULT_AUTO_SLEEP_MINUTES;
}

function parseStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

export async function loadAutoSleep(): Promise<AutoSleepSettings> {
  const [minutes, sites] = await Promise.all([
    readSetting(AUTO_SLEEP_MINUTES_KEY),
    readSetting(KEEP_AWAKE_SITES_KEY),
  ]);
  return { minutes: parseAutoSleepMinutes(minutes), sites: parseStrings(sites) };
}

export async function saveAutoSleepMinutes(minutes: AutoSleepMinutes): Promise<void> {
  await writeSetting(AUTO_SLEEP_MINUTES_KEY, minutes);
}

/** `sites` — already parsed (`parseSiteList`). */
export async function saveKeepAwakeSites(sites: readonly string[]): Promise<void> {
  await writeSetting(KEEP_AWAKE_SITES_KEY, [...sites]);
}

const GROUPING_MODE_KEY = 'tabflow.groupingMode';
const GROUPING_RULES_KEY = 'tabflow.groupingRules';
const AI_GROUPING_KEY = 'tabflow.aiGrouping';

/** How «Разложить вкладки» sorts tabs, remembered from the last time; topics by default. */
export async function loadGroupingMode(): Promise<GroupingMode> {
  const value = await readSetting(GROUPING_MODE_KEY);
  return GROUPING_MODES.includes(value as GroupingMode) ? (value as GroupingMode) : 'topic';
}

export async function saveGroupingMode(mode: GroupingMode): Promise<void> {
  await writeSetting(GROUPING_MODE_KEY, mode);
}

/** Own topics as typed on the settings page (`parseTopicRules`). */
export async function loadGroupingRules(): Promise<string> {
  const value = await readSetting(GROUPING_RULES_KEY);
  return typeof value === 'string' ? value : '';
}

export async function saveGroupingRules(text: string): Promise<void> {
  await writeSetting(GROUPING_RULES_KEY, text);
}

/** Topics by Gemini Nano (experimental): off by default. */
export async function loadAiGrouping(): Promise<boolean> {
  return (await readSetting(AI_GROUPING_KEY)) === true;
}

export async function saveAiGrouping(on: boolean): Promise<void> {
  await writeSetting(AI_GROUPING_KEY, on);
}

/** The settings the background reads; tests pass their own. */
export interface BackgroundSettings {
  badgeMode(): Promise<BadgeMode>;
  language(): Promise<Language>;
  autoSleep(): Promise<AutoSleepSettings>;
}

export const storedSettings: BackgroundSettings = {
  badgeMode: loadBadgeMode,
  language: loadLanguage,
  autoSleep: loadAutoSleep,
};

/** Calls back when the badge setting changes on a page (the background redraws the badge). */
export function onBadgeModeChanged(callback: () => void): void {
  onSettingsChanged((keys) => {
    if (keys.includes(BADGE_MODE_KEY)) callback();
  });
}
