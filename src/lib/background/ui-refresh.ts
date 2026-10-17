/**
 * Keeps the badge and the context menu in line with the database. Runs in the background queue
 * after commands and browser events; Chrome is called only when something actually changed.
 */
import { buildMenu } from '../menus';
import { badge } from '../summary';
import type { BackgroundContext } from './context';

export function createUiRefresher(ctx: BackgroundContext): () => Promise<void> {
  // What Chrome shows now; empty after the service worker starts, so the first refresh sets all.
  let shownBadge = '';
  let shownMenu = '';

  return async () => {
    const [groups, spaces, queued, mode] = await Promise.all([
      ctx.repos.groups.listAll(),
      ctx.repos.spaces.list(),
      ctx.repos.queue.list('queued'),
      ctx.settings.badgeMode(),
    ]);

    const stowed = groups.filter((group) => group.state === 'stowed').length;
    const next = badge(mode, queued, stowed);
    if (JSON.stringify(next) !== shownBadge) {
      await ctx.ui.setBadge(next.text, next.title);
      shownBadge = JSON.stringify(next);
    }

    const menu = buildMenu(groups, spaces);
    if (JSON.stringify(menu) !== shownMenu) {
      await ctx.ui.setMenu(menu);
      shownMenu = JSON.stringify(menu);
    }
  };
}
