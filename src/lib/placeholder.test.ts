import { describe, expect, it } from 'vitest';
import { buildPlaceholderUrl, cachedFaviconUrl, parsePlaceholderUrl } from './placeholder';

const PAGE = 'chrome-extension://tabflow/lazy.html';

describe('placeholder URLs', () => {
  it('round-trips the real URL, title and icon', () => {
    const target = {
      url: 'https://www.youtube.com/watch?v=1&list=PL#t=30',
      title: 'Урок 1 — «TypeScript» & co',
      favIconUrl: 'https://www.youtube.com/favicon.ico',
    };
    const raw = buildPlaceholderUrl(PAGE, target);

    expect(raw.startsWith(`${PAGE}#`)).toBe(true);
    expect(parsePlaceholderUrl(PAGE, raw)).toEqual(target);
  });

  it('builds the URL of Chrome favicon cache for a page', () => {
    expect(cachedFaviconUrl('chrome-extension://tabflow', 'https://a.com/x?y=1')).toBe(
      'chrome-extension://tabflow/_favicon/?pageUrl=https%3A%2F%2Fa.com%2Fx%3Fy%3D1&size=32',
    );
  });

  it('ignores other URLs and unsafe targets', () => {
    expect(parsePlaceholderUrl(PAGE, 'https://example.com/')).toBeUndefined();
    expect(parsePlaceholderUrl(PAGE, `${PAGE}#u=javascript%3Aalert(1)`)).toBeUndefined();
    expect(parsePlaceholderUrl(PAGE, `${PAGE}#t=no-url`)).toBeUndefined();
  });

  it('drops an unsafe icon URL but keeps the tab', () => {
    const raw = `${PAGE}#u=https%3A%2F%2Fa.com%2F&i=javascript%3Ax`;
    expect(parsePlaceholderUrl(PAGE, raw)).toEqual({
      url: 'https://a.com/',
      title: 'https://a.com/',
    });
  });
});
