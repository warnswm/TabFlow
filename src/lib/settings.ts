/**
 * User settings in `storage.local`: the restore mode and what the badge counts, chosen on the
 * settings page (`#/settings` of the main page).
 */
import { onSettingsChanged, readSetting, writeSetting } from './browser-api';
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

/** The settings the background reads; tests pass their own. */
export interface BackgroundSettings {
  badgeMode(): Promise<BadgeMode>;
}

export const storedSettings: BackgroundSettings = { badgeMode: loadBadgeMode };

/** Calls back when the badge setting changes on a page (the background redraws the badge). */
export function onBadgeModeChanged(callback: () => void): void {
  onSettingsChanged((keys) => {
    if (keys.includes(BADGE_MODE_KEY)) callback();
  });
}
