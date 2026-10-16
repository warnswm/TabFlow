import { describe, expect, it } from 'vitest';
import { isSaveableTab, isSaveableUrl, normalizeUrl, splitDuplicates } from './tab-rules';

describe('tab rules', () => {
  it('saves web pages and local files only', () => {
    for (const url of [
      'https://youtube.com/watch?v=1',
      'http://localhost:3000/',
      'file:///C:/a.pdf',
    ]) {
      expect(isSaveableUrl(url), url).toBe(true);
    }
    for (const url of [
      'chrome://settings',
      'chrome-extension://abc/app.html',
      'edge://flags',
      'about:blank',
      'devtools://devtools/bundled/inspector.html',
      'view-source:https://example.com',
      'data:text/plain,hi',
      'blob:https://example.com/1',
      'javascript:void(0)',
      '',
    ]) {
      expect(isSaveableUrl(url), url).toBe(false);
    }
  });

  it('never saves pinned tabs', () => {
    expect(isSaveableTab({ url: 'https://mail.example.com', pinned: true })).toBe(false);
    expect(isSaveableTab({ url: 'https://mail.example.com', pinned: false })).toBe(true);
  });

  it('ignores the #fragment when comparing URLs', () => {
    expect(normalizeUrl('https://example.com/doc#part-2')).toBe('https://example.com/doc');
    expect(normalizeUrl('not a url')).toBe('not a url');
  });

  it('keeps the first tab of every URL', () => {
    const items = [
      { id: 1, url: 'https://a.com/' },
      { id: 2, url: 'https://b.com/' },
      { id: 3, url: 'https://a.com/#top' },
    ];
    const { unique, duplicates } = splitDuplicates(items, (item) => item.url);
    expect(unique.map((item) => item.id)).toEqual([1, 2]);
    expect(duplicates.map((item) => item.id)).toEqual([3]);
  });
});
