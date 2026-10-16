import type { BrowserTab } from '../browser-api';

/**
 * Only web pages and local files are saved. Browser pages (`chrome://`, `edge://`, `about:`),
 * extension pages (TabFlow itself), `devtools:`, `view-source:`, `data:`, `blob:` and
 * `javascript:` stay open and untouched.
 */
const SAVEABLE_PROTOCOLS = new Set(['http:', 'https:', 'file:']);

export function isSaveableUrl(url: string): boolean {
  try {
    return SAVEABLE_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false; // empty or not yet known URL
  }
}

/** Pinned tabs are never collapsed or stowed (Chrome does not group them either). */
export function isSaveableTab(tab: Pick<BrowserTab, 'url' | 'pinned'>): boolean {
  return !tab.pinned && isSaveableUrl(tab.url);
}

/** URL used for duplicate checks: the `#fragment` does not make a page different. */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href;
  } catch {
    return url;
  }
}

/** Keeps the first item of every URL; the rest are duplicates. */
export function splitDuplicates<T>(
  items: readonly T[],
  urlOf: (item: T) => string,
): { unique: T[]; duplicates: T[] } {
  const seen = new Set<string>();
  const unique: T[] = [];
  const duplicates: T[] = [];
  for (const item of items) {
    const key = normalizeUrl(urlOf(item));
    if (seen.has(key)) {
      duplicates.push(item);
    } else {
      seen.add(key);
      unique.push(item);
    }
  }
  return { unique, duplicates };
}
