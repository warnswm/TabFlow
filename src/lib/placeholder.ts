/**
 * Placeholder page for restored tabs that should not load yet. Chrome cannot create a tab that is
 * already discarded, and opening the site itself makes it load. Instead the tab opens a local
 * TabFlow page that shows the real title and icon, gets discarded right away, and goes to the
 * real URL as soon as the tab is opened.
 *
 * The target travels in the `#fragment` of the page URL, so it never leaves the browser.
 * Everything outside the page (mirror, stow, collapse) sees the real URL — see `browser-api.ts`.
 */
import { isSaveableUrl } from './background/tab-rules';

export const PLACEHOLDER_PAGE_PATH = '/lazy.html';

export interface PlaceholderTarget {
  url: string;
  title: string;
  favIconUrl?: string;
}

/**
 * Chrome's favicon cache for a page (`_favicon`, needs the `favicon` permission): served locally
 * by the browser, a generic globe when the page was never visited. Chrome-only.
 */
export function cachedFaviconUrl(extensionOrigin: string, pageUrl: string, size = 32): string {
  const params = new URLSearchParams({ pageUrl, size: String(size) });
  return `${extensionOrigin}/_favicon/?${params.toString()}`;
}

export function buildPlaceholderUrl(pageUrl: string, target: PlaceholderTarget): string {
  const params = new URLSearchParams({ u: target.url, t: target.title });
  if (target.favIconUrl) params.set('i', target.favIconUrl);
  return `${pageUrl}#${params.toString()}`;
}

/** The target of a placeholder URL, or `undefined` for any other URL (or an unsafe target). */
export function parsePlaceholderUrl(pageUrl: string, raw: string): PlaceholderTarget | undefined {
  if (!raw.startsWith(`${pageUrl}#`)) return undefined;
  const params = new URLSearchParams(raw.slice(pageUrl.length + 1));
  const url = params.get('u');
  // Only web pages and files: the page must never navigate to `javascript:` or similar.
  if (!url || !isSaveableUrl(url)) return undefined;
  const favIconUrl = params.get('i');
  return {
    url,
    title: params.get('t') || url,
    ...(favIconUrl && isSaveableUrl(favIconUrl) && { favIconUrl }),
  };
}
