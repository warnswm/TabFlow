import { defineBackground } from 'wxt/utils/define-background';
import { createBackground } from '@/lib/background';
import { createBrowserTabsApi, onInstalled, onRuntimeMessage } from '@/lib/browser-api';
import { db, repositories, systemClock } from '@/lib/db';

// MV3 service worker: it can be stopped at any time, so no state is kept in memory here.
// Listeners are registered synchronously, otherwise Chrome does not wake the worker for them.
export default defineBackground(() => {
  const api = createBrowserTabsApi();
  const background = createBackground({ api, db, repos: repositories, clock: systemClock });

  // Queued first: events that arrive meanwhile are handled after the mirror is reconciled.
  void background.start();
  api.onEvent((event) => void background.handleEvent(event));
  onRuntimeMessage((message) => background.handleMessage(message));

  onInstalled((reason) => {
    console.info(`[TabFlow] onInstalled: ${reason}`);
  });
});
