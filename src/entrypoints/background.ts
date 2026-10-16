import { defineBackground } from 'wxt/utils/define-background';
import { onInstalled } from '@/lib/browser-api';

// MV3 service worker: it can be stopped at any time, so no state is kept in memory here.
export default defineBackground(() => {
  onInstalled((reason) => {
    console.info(`[TabFlow] onInstalled: ${reason}`);
  });
});
