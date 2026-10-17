import { defineBackground } from 'wxt/utils/define-background';
import { createBackground } from '@/lib/background';
import {
  createBrowserTabsApi,
  createExtensionUi,
  onHotkey,
  onInstalled,
  onMenuClick,
  onRuntimeMessage,
} from '@/lib/browser-api';
import { db, repositories, systemClock } from '@/lib/db';
import { hotkeyCommand } from '@/lib/hotkeys';
import type { Command } from '@/lib/messages';
import { menuCommand } from '@/lib/menus';

// MV3 service worker: it can be stopped at any time, so no state is kept in memory here.
// Listeners are registered synchronously, otherwise Chrome does not wake the worker for them.
export default defineBackground(() => {
  const api = createBrowserTabsApi();
  const ui = createExtensionUi();
  const background = createBackground({ api, ui, db, repos: repositories, clock: systemClock });

  /** Menu and shortcuts have no page to show a result: failures are only logged. */
  function runQuietly(command: Command | undefined, source: string): void {
    if (!command) return;
    void background.handleMessage(command).then((response) => {
      if (!response.ok) console.info(`[TabFlow] ${source} ${command.type}: ${response.code}`);
    });
  }

  // Queued first: events that arrive meanwhile are handled after the mirror is reconciled.
  void background.start();
  api.onEvent((event) => void background.handleEvent(event));
  onRuntimeMessage((message) => background.handleMessage(message));
  onMenuClick((click) => runQuietly(menuCommand(click), 'menu'));
  onHotkey((name, tabId) => runQuietly(hotkeyCommand(name, tabId), 'shortcut'));

  onInstalled((reason) => {
    console.info(`[TabFlow] onInstalled: ${reason}`);
  });
});
