import { youtubeVideoId } from '../app/youtube';
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

/**
 * Query parameters that only say where a visitor came from (ads, mail, share buttons): two URLs
 * that differ only in them show the same page.
 */
const TRACKING_PARAM =
  /^(?:utm_.+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|yclid|ysclid|igshid|mc_cid|mc_eid|_openstat|_ga|_gl)$/i;

/**
 * Key for duplicate checks — two URLs with the same key show the same page:
 * - the `#fragment`, tracking parameters (`utm_*`, `fbclid`, `yclid`…), `www.`, `http`/`https`,
 *   a trailing `/` and the order of parameters do not matter;
 * - a YouTube video is one page whatever the link (`watch`, `youtu.be`, `shorts`) and the
 *   position (`&t=95s`) — the key is its id.
 */
export function urlKey(url: string): string {
  const videoId = youtubeVideoId(url);
  if (videoId) return `youtube:${videoId}`;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    parsed.hash = '';
    return parsed.href;
  }
  const params = [...parsed.searchParams]
    .filter(([name]) => !TRACKING_PARAM.test(name))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = new URLSearchParams(params).toString();
  const host = parsed.host.replace(/^www\./, '');
  const path = parsed.pathname.replace(/\/+$/, '');
  return `${host}${path}${query ? `?${query}` : ''}`;
}

/** Playback position of a YouTube link in seconds (`t=95`, `t=1m35s`, `start=95`); 0 when none. */
export function youtubeStartSec(url: string): number {
  let value: string | null;
  try {
    const params = new URL(url).searchParams;
    value = params.get('t') ?? params.get('start');
  } catch {
    return 0;
  }
  if (!value) return 0;
  if (/^\d+s?$/.test(value)) return parseInt(value, 10);
  const parts = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!parts) return 0;
  const [, h = '0', m = '0', s = '0'] = parts;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
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
    const key = urlKey(urlOf(item));
    if (seen.has(key)) {
      duplicates.push(item);
    } else {
      seen.add(key);
      unique.push(item);
    }
  }
  return { unique, duplicates };
}
