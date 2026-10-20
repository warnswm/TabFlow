/**
 * Autosleep, run by an alarm once a minute (the service worker is stopped in between, so nothing
 * is kept in memory: how long a group is unused comes from Chrome's `lastAccessed` of its tabs).
 * The rules are in `tidy/auto-sleep.ts`.
 */
import { autoSleepTargets } from '../tidy/auto-sleep';
import type { BackgroundContext } from './context';
import { syncGroup } from './mirror';

/** Name of the alarm that runs autosleep. */
export const AUTO_SLEEP_ALARM = 'tabflow.autoSleep';

/** Puts unused groups to sleep; returns how many fell asleep entirely. */
export async function autoSleep(ctx: BackgroundContext): Promise<number> {
  const { api, repos } = ctx;
  const settings = await ctx.settings.autoSleep();
  if (settings.minutes === 0) return 0;

  const targets = autoSleepTargets(
    await repos.groups.listAll(),
    await api.queryTabs({}),
    ctx.clock(),
    settings,
  );
  let slept = 0;
  for (const target of targets) {
    for (const tabId of target.tabIds) {
      try {
        // Chrome returns nothing instead of throwing when it refuses: the tab stays loaded.
        await api.discardTab(tabId);
      } catch {
        // Closed or shown meanwhile.
      }
    }
    const group = await repos.groups.get(target.groupId);
    if (group?.chromeGroupId === undefined) continue;
    const synced = await syncGroup(ctx, group.chromeGroupId);
    // Tabs that must stay loaded (sound, sites of the list) keep the group awake, the rest sleep.
    if (synced?.state === 'asleep') {
      await repos.groups.update(synced.id, { autoSlept: true });
      slept++;
    }
  }
  return slept;
}
