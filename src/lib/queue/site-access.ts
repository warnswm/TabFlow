/**
 * Access to video sites. TabFlow has no site access at install: when a video of a new site goes
 * into the queue, Chrome asks once for that site (`optional_host_permissions`), and the content
 * script that reads the duration and the position runs only on the sites allowed.
 */

/** Match pattern for the whole site of `url` (both schemes): `*://lektorium.tv/*`. */
export function sitePattern(url: string): string | undefined {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:' && protocol !== 'http:') return undefined;
    return `*://${hostname}/*`;
  } catch {
    return undefined;
  }
}

/** Patterns for the page and the embedded players of a video, without repeats. */
export function accessPatterns(url: string, playerOrigins: readonly string[] = []): string[] {
  const patterns = [url, ...playerOrigins].map(sitePattern);
  return [...new Set(patterns.filter((pattern) => pattern !== undefined))];
}

// Does a match pattern cover `url`? Patterns: `*://*.example.com/*`, `https://*/*`, `<all_urls>`.
export function patternCovers(pattern: string, url: string): boolean {
  if (pattern === '<all_urls>') return /^(?:https?|file):/.test(url);
  const match = /^(\*|https?|file):\/\/([^/]*)\//.exec(pattern);
  if (!match) return false;
  const [, scheme, host = ''] = match;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const protocol = parsed.protocol.slice(0, -1);
  if (scheme === '*' ? protocol !== 'http' && protocol !== 'https' : scheme !== protocol) {
    return false;
  }
  if (host === '*') return true;
  if (host.startsWith('*.')) {
    const domain = host.slice(2);
    return parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`);
  }
  return parsed.hostname === host;
}

/** Patterns the granted ones do not cover yet. */
export function missingPatterns(needed: readonly string[], granted: readonly string[]): string[] {
  return needed.filter((pattern) => {
    const sample = pattern.replace('*://', 'https://').replace(/\/\*$/, '/');
    return !granted.some((have) => patternCovers(have, sample));
  });
}
