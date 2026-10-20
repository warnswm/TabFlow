import { defineBackground } from 'wxt/utils/define-background';
import { createBackground } from '@/lib/background';
import { AUTO_SLEEP_ALARM } from '@/lib/background/auto-sleep';
import {
  createBrowserTabsApi,
  createExtensionUi,
  ensureAlarm,
  injectVideoScript,
  onAlarm,
  onHotkey,
  onInstalled,
  onMenuClick,
  onRuntimeMessage,
  onSiteAccessChanged,
  openSidePanel,
  requestSiteAccess,
  syncVideoScript,
} from '@/lib/browser-api';
import { db, repositories, systemClock } from '@/lib/db';
import { hotkeyCommand } from '@/lib/hotkeys';
import type { Command } from '@/lib/messages';
import { MENU_IDS, menuCommand, menuQueueUrl } from '@/lib/menus';
import { accessPatterns } from '@/lib/queue/site-access';
import { onBadgeModeChanged, onLanguageSettingChanged, storedSettings } from '@/lib/settings';

// MV3 service worker: it can be stopped at any time, so no state is kept in memory here.
// Listeners are registered synchronously, otherwise Chrome does not wake the worker for them.
export default defineBackground(() => {
  const api = createBrowserTabsApi();
  const ui = createExtensionUi();
  const background = createBackground({
    api,
    ui,
    db,
    repos: repositories,
    clock: systemClock,
    settings: storedSettings,
  });

  /** Menu and shortcuts have no page to show a result: failures are only logged. */
  function runQuietly(command: Command | undefined, source: string): void {
    if (!command) return;
    void background.handleMessage(command).then((response) => {
      if (!response.ok) console.info(`[TabFlow] ${source} ${command.type}: ${response.code}`);
    });
  }

  /** The content script runs on the allowed sites only; newly allowed ones get it at once. */
  function syncSites(added: string[]): void {
    void syncVideoScript()
      .then(() => injectVideoScript(added))
      .catch((error: unknown) => console.warn('[TabFlow] Video script:', error));
  }

  // Queued first: events that arrive meanwhile are handled after the mirror is reconciled.
  void background.start();
  syncSites([]);
  api.onEvent((event) => void background.handleEvent(event));
  onRuntimeMessage((message, sender) => background.handleMessage(message, sender));
  onSiteAccessChanged(syncSites);
  onBadgeModeChanged(() => void background.refreshUi());
  onLanguageSettingChanged(() => void background.followLanguage());
  // Autosleep: checked once a minute; how long a group is unused comes from Chrome.
  onAlarm(AUTO_SLEEP_ALARM, () => void background.autoSleep());
  void ensureAlarm(AUTO_SLEEP_ALARM, 1).catch((error: unknown) =>
    console.warn('[TabFlow] Autosleep alarm:', error),
  );

  onMenuClick((click) => {
    // Chrome allows these only right in the click, before anything is awaited.
    if (click.itemId === MENU_IDS.openQueue && click.windowId !== undefined) {
      void openSidePanel(click.windowId);
      return;
    }
    const queueUrl = menuQueueUrl(click);
    if (queueUrl) void requestSiteAccess(accessPatterns(queueUrl));
    runQuietly(menuCommand(click), 'menu');
  });

  onHotkey((name, tab) => {
    if (name === 'open-queue') {
      if (tab) void openSidePanel(tab.windowId);
      return;
    }
    if (name === 'queue-current' && tab?.url) void requestSiteAccess(accessPatterns(tab.url));
    runQuietly(hotkeyCommand(name, tab?.id), 'shortcut');
  });

  onInstalled((reason) => {
    console.info(`[TabFlow] onInstalled: ${reason}`);
  });
});
