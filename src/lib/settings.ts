/**
 * User settings in `storage.local`: the restore mode, what the badge counts and the interface
 * language, chosen on the settings page (`#/settings` of the main page).
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

/** The settings the background reads; tests pass their own. */
export interface BackgroundSettings {
  badgeMode(): Promise<BadgeMode>;
  language(): Promise<Language>;
}

export const storedSettings: BackgroundSettings = {
  badgeMode: loadBadgeMode,
  language: loadLanguage,
};

/** Calls back when the badge setting changes on a page (the background redraws the badge). */
export function onBadgeModeChanged(callback: () => void): void {
  onSettingsChanged((keys) => {
    if (keys.includes(BADGE_MODE_KEY)) callback();
  });
}
