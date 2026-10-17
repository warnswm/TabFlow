/**
 * Keeps the badge and the context menu in line with the database. Runs in the background queue
 * after commands and browser events; Chrome is called only when something actually changed.
 */
import { buildMenu } from '../menus';
import { badgeText, badgeTitle } from '../summary';
import type { BackgroundContext } from './context';

export function createUiRefresher(ctx: BackgroundContext): () => Promise<void> {
  // What Chrome shows now; empty after the service worker starts, so the first refresh sets all.
  let shownBadge = '';
  let shownMenu = '';

  return async () => {
    const [groups, spaces] = await Promise.all([
      ctx.repos.groups.listAll(),
      ctx.repos.spaces.list(),
    ]);

    const stowed = groups.filter((group) => group.state === 'stowed').length;
    const badge = [badgeText(stowed), badgeTitle(stowed)] as const;
    if (JSON.stringify(badge) !== shownBadge) {
      await ctx.ui.setBadge(...badge);
      shownBadge = JSON.stringify(badge);
    }

    const menu = buildMenu(groups, spaces);
    if (JSON.stringify(menu) !== shownMenu) {
      await ctx.ui.setMenu(menu);
      shownMenu = JSON.stringify(menu);
    }
  };
}
