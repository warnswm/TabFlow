/**
 * Access to sites. TabFlow has no site access at install: when a video of a new site goes into the
 * queue, or a site is shown in «Рядом», Chrome asks once for that site (`optional_host_permissions`).
 * The content script that reads the duration and the position runs only on the sites allowed.
 *
 * Access is asked for the whole site with its subdomains: a page talks to its own subdomains
 * (`notifications.tradingview.com`, `pushstream.…`), and in a frame of «Рядом» the cookies of the
 * account go only to hosts TabFlow has access to.
 */

/** Second-level labels under country domains: `bbc.co.uk`, `site.com.ru`. */
const COUNTRY_SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'or', 'ne']);

/** Hosting domains where every subdomain is a site of its own (part of the public suffix list). */
const SHARED_HOSTS = new Set([
  'github.io',
  'gitlab.io',
  'blogspot.com',
  'herokuapp.com',
  'netlify.app',
  'vercel.app',
  'pages.dev',
  'workers.dev',
  'web.app',
  'firebaseapp.com',
  'appspot.com',
  'azurewebsites.net',
  'cloudfront.net',
]);

/**
 * The registrable domain of a host — the site with its subdomains: `www.tradingview.com` →
 * `tradingview.com`, `news.bbc.co.uk` → `bbc.co.uk`, `user.github.io` stays itself. An IP address
 * or a one-label host (`localhost`) stays as is.
 */
export function siteDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (/^[\d.]+$/.test(host) || host.includes(':')) return host; // IPv4, IPv6
  const labels = host.split('.');
  if (labels.length <= 2) return host;
  const lastTwo = labels.slice(-2).join('.');
  if (SHARED_HOSTS.has(lastTwo)) return labels.slice(-3).join('.');
  const [second, top] = labels.slice(-2);
  const countryLevel =
    top?.length === 2 && second !== undefined && COUNTRY_SECOND_LEVEL.has(second);
  return countryLevel ? labels.slice(-3).join('.') : lastTwo;
}

/**
 * Match pattern for the whole site of `url` with its subdomains (both schemes):
 * `*://*.lektorium.tv/*` — Chrome's `*.` covers the domain itself too.
 */
export function sitePattern(url: string): string | undefined {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:' && protocol !== 'http:') return undefined;
    const domain = siteDomain(hostname);
    return domain.includes('.') && !/^[\d.]+$/.test(domain)
      ? `*://*.${domain}/*`
      : `*://${domain}/*`;
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
    // A whole site needs its subdomains too: the domain and any subdomain must be covered.
    const samples = sample.includes('://*.')
      ? [sample.replace('://*.', '://'), sample.replace('://*.', '://tabflow-probe.')]
      : [sample];
    return !samples.every((url) => granted.some((have) => patternCovers(have, url)));
  });
}
