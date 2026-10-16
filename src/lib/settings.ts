/**
 * User settings in `storage.local`. Stage 3 keeps only the restore mode, chosen on the main page;
 * the settings page comes at stage 7.
 */
import { readSetting, writeSetting } from './browser-api';
import { RESTORE_MODES, type RestoreMode } from './messages';

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
