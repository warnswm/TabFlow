/**
 * Autosleep: a group nobody looked at for `minutes` falls asleep by itself (its tabs are
 * unloaded, they stay on the tab strip). Pure rules — the background runs them once a minute.
 *
 * Never put to sleep:
 * - a group whose tab is shown in a window, or marked «Не засыпать автоматически»;
 * - tabs that play sound, pinned tabs, tabs Chrome must not unload (`autoDiscardable: false`),
 *   tabs of the sites in the list «Не усыплять», tabs still opening their page. The other tabs
 *   of such a group fall asleep; these stay loaded.
 */
import type { BrowserTab } from '../browser-api';
import type { Id, TabGroup } from '../db/models';
import { isSaveableUrl } from '../background/tab-rules';

/** Thresholds offered in the settings; 0 — autosleep is off. */
export const AUTO_SLEEP_MINUTES = [0, 15, 30, 60, 120] as const;
export type AutoSleepMinutes = (typeof AUTO_SLEEP_MINUTES)[number];
export const DEFAULT_AUTO_SLEEP_MINUTES: AutoSleepMinutes = 30;

export interface AutoSleepSettings {
  minutes: AutoSleepMinutes;
  /** Sites never put to sleep: hosts without `www.` (`music.yandex.ru`, `web.telegram.org`). */
  sites: string[];
}

export interface AutoSleepTarget {
  groupId: Id;
  /** Tabs to unload; the rest of the group's tabs stay as they are. */
  tabIds: number[];
}

const MINUTE = 60_000;

/** Groups that fall asleep now and which of their tabs to unload. */
export function autoSleepTargets(
  groups: readonly TabGroup[],
  tabs: readonly BrowserTab[],
  now: number,
  settings: AutoSleepSettings,
): AutoSleepTarget[] {
  if (settings.minutes === 0) return [];
  const shown = new Set(tabs.filter((tab) => tab.active).map((tab) => tab.groupId));
  const targets: AutoSleepTarget[] = [];
  for (const group of groups) {
    if (group.state !== 'active' || group.chromeGroupId === undefined || group.keepAwake) continue;
    if (shown.has(group.chromeGroupId)) continue;
    const groupTabs = tabs.filter((tab) => tab.groupId === group.chromeGroupId);
    if (groupTabs.length === 0) continue;
    // A group just made, woken up or restored counts as used then: tabs a page reloads
    // without showing them keep their old `lastAccessed`.
    const lastUsed = Math.max(
      group.createdAt,
      group.stateChangedAt ?? 0,
      ...groupTabs.map((tab) => tab.lastAccessed),
    );
    if (now - lastUsed < settings.minutes * MINUTE) continue;
    const tabIds = groupTabs
      .filter((tab) => mayAutoSleep(tab, settings.sites))
      .map((tab) => tab.id);
    if (tabIds.length > 0) targets.push({ groupId: group.id, tabIds });
  }
  return targets;
}

/** A tab autosleep may unload. */
export function mayAutoSleep(tab: BrowserTab, sites: readonly string[]): boolean {
  return (
    !tab.discarded &&
    !tab.active &&
    !tab.pinned &&
    !tab.audible &&
    tab.autoDiscardable &&
    // Unloaded before its address is known, a tab comes back empty (`about:blank`).
    tab.committed &&
    isSaveableUrl(tab.url) &&
    !onSites(tab.url, sites)
  );
}

/** The page is on one of `sites` or their subdomains. */
export function onSites(url: string, sites: readonly string[]): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return false;
  }
  return sites.some((site) => host === site || host.endsWith(`.${site}`));
}

/**
 * The list «Не усыплять» as typed: one site per line or separated by commas, with or without
 * `https://`, `www.` and a path. Returns hosts in lower case without repeats; junk is dropped.
 */
export function parseSiteList(text: string): string[] {
  const sites = text
    .split(/[\s,;]+/)
    .map((entry) =>
      entry
        .trim()
        .toLowerCase()
        .replace(/^[a-z]+:\/\//, '')
        .replace(/^\*\./, '')
        .replace(/^www\./, '')
        .replace(/[/?#:].*$/, ''),
    )
    .filter((host) => /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(host) && host.length <= 253);
  return [...new Set(sites)];
}
