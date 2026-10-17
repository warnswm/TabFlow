/**
 * Placeholder tabs (`entrypoints/lazy`) are pages of TabFlow itself, so Chrome treats them
 * differently from sites:
 * - after a browser restart it brings them back unloaded, and an unloaded placeholder shows no
 *   icon — the icon is set by the page itself. Such tabs are reloaded in the background (a local
 *   page, no site loads) and discarded again once the icon is applied, as after «Вернуть»;
 * - when the extension is reloaded or updated, Chrome closes them all. At the next start their
 *   links are opened again as placeholders in the same native groups instead of going to the trash.
 */
import type { BrowserTab } from '../browser-api';
import type { Id } from '../db';
import { buildPlaceholderUrl } from '../placeholder';
import type { BackgroundContext } from './context';
import { discardWhen } from './group-actions';
import { isSaveableUrl } from './tab-rules';

/** Chrome restores tabs a little after the service worker starts: those are caught by events. */
export const ICON_REFRESH_WINDOW_MS = 60_000;
/** Placeholders reloaded at the same time. */
const PARALLEL = 6;
/** A reloaded tab may still report its old icon for a moment: wait at least this many polls. */
const MIN_POLLS = 4;
/** Then up to 2 s for the icon (as when restoring a group). */
const ICON_MAX_POLLS = 40;

/** A placeholder waiting in the background; the shown one goes to its site by itself. */
export function needsIconRefresh(tab: BrowserTab): boolean {
  return tab.placeholder && !tab.active;
}

/** Discards a just opened placeholder once its icon is applied (or after 2 s without it). */
export function discardPlaceholder(ctx: BackgroundContext, tabId: number): Promise<number> {
  return discardWhen(
    ctx,
    tabId,
    (tab, poll) => needsIconRefresh(tab) && tab.loaded && (tab.hasIcon || poll >= ICON_MAX_POLLS),
  );
}

export interface IconRefresher {
  /** Refreshes every waiting placeholder of every window, except `skip` (just opened ones). */
  refreshAll(skip?: ReadonlySet<number>): Promise<void>;
  refresh(tabId: number): Promise<void>;
}

export function createIconRefresher(ctx: BackgroundContext): IconRefresher {
  const inFlight = new Set<number>();

  async function refresh(tabId: number): Promise<void> {
    if (inFlight.has(tabId)) return;
    inFlight.add(tabId);
    try {
      await ctx.api.reloadTab(tabId);
      await discardWhen(
        ctx,
        tabId,
        (tab, poll) =>
          needsIconRefresh(tab) &&
          tab.loaded &&
          poll >= MIN_POLLS &&
          (tab.hasIcon || poll >= ICON_MAX_POLLS),
      );
    } catch (error) {
      // The tab simply keeps showing no icon until it is opened.
      console.warn(`[TabFlow] Placeholder ${tabId} was not refreshed.`, error);
    } finally {
      inFlight.delete(tabId);
    }
  }

  return {
    refresh,
    async refreshAll(skip = new Set<number>()) {
      const waiting = (await ctx.api.queryTabs({})).filter(
        (tab) => needsIconRefresh(tab) && !skip.has(tab.id),
      );
      for (let i = 0; i < waiting.length; i += PARALLEL) {
        await Promise.all(waiting.slice(i, i + PARALLEL).map((tab) => refresh(tab.id)));
      }
    },
  };
}

/**
 * Opens as placeholders the saved links of a group on the tab strip that have no tab in it,
 * each next to the tab of the link before it, and links them. Returns the opened tab ids;
 * they still have to be discarded (`discardPlaceholder`). Used at a start in a new session:
 * the tabs were closed while TabFlow was not running (the extension was reloaded or updated).
 */
export async function reopenMissingLinks(
  ctx: BackgroundContext,
  groupId: Id,
  chromeGroupId: number,
): Promise<number[]> {
  const { api, repos } = ctx;
  const used = new Set<number>();
  const opened: number[] = [];
  let anchor: number | undefined; // window index right after the previous link's tab

  for (const link of await repos.tabs.listByGroup(groupId)) {
    const groupTabs = await api.queryTabs({ groupId: chromeGroupId });
    const [first] = groupTabs;
    if (!first) break; // the group is gone: the mirror stows it with all its links
    const open = groupTabs.find((tab) => !used.has(tab.id) && tab.url === link.url);
    if (open) {
      used.add(open.id);
      anchor = open.index + 1;
      continue;
    }
    if (!isSaveableUrl(link.url)) continue;

    try {
      const tab = await api.createTab({
        windowId: first.windowId,
        url: buildPlaceholderUrl(api.placeholderPageUrl, link),
        active: false,
        index: anchor ?? first.index,
      });
      await api.addTabsToGroup([tab.id], chromeGroupId);
      await repos.tabs.update(link.id, { chromeTabId: tab.id });
      used.add(tab.id);
      opened.push(tab.id);
      anchor = ((await api.getTab(tab.id))?.index ?? tab.index) + 1;
    } catch (error) {
      // Not opened: the mirror moves the link to the trash, where it can be restored.
      console.warn(`[TabFlow] Link ${link.id} was not reopened.`, error);
    }
  }
  return opened;
}
