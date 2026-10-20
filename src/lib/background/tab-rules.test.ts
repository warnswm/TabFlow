import { describe, expect, it } from 'vitest';
import {
  isSaveableTab,
  isSaveableUrl,
  splitDuplicates,
  urlKey,
  youtubeStartSec,
} from './tab-rules';

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
    expect(urlKey('https://example.com/doc#part-2')).toBe(urlKey('https://example.com/doc'));
    expect(urlKey('not a url')).toBe('not a url');
  });

  it('treats tracking parameters, www, the protocol and a trailing slash as the same page', () => {
    const key = urlKey('https://example.com/docs/intro?lang=ru&page=2');
    for (const url of [
      'http://www.example.com/docs/intro/?page=2&lang=ru',
      'https://example.com/docs/intro?utm_source=mail&lang=ru&page=2&utm_campaign=x',
      'https://example.com/docs/intro?lang=ru&fbclid=abc&page=2&yclid=1#top',
    ]) {
      expect(urlKey(url), url).toBe(key);
    }
    for (const url of [
      'https://example.com/docs/intro?lang=en&page=2',
      'https://example.com/docs/Intro?lang=ru&page=2',
      'https://docs.example.com/docs/intro?lang=ru&page=2',
      'https://example.com:8080/docs/intro?lang=ru&page=2',
    ]) {
      expect(urlKey(url), url).not.toBe(key);
    }
  });

  it('takes any link to a YouTube video at any position as one page', () => {
    const key = urlKey('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    for (const url of [
      'https://youtu.be/dQw4w9WgXcQ?t=42',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=1m2s&list=PL1',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    ]) {
      expect(urlKey(url), url).toBe(key);
    }
    expect(urlKey('https://www.youtube.com/watch?v=aaaaaaaaaaa')).not.toBe(key);
  });

  it('reads the position of a YouTube link', () => {
    expect(youtubeStartSec('https://youtu.be/dQw4w9WgXcQ?t=42')).toBe(42);
    expect(youtubeStartSec('https://youtu.be/dQw4w9WgXcQ?t=95s')).toBe(95);
    expect(youtubeStartSec('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s')).toBe(3723);
    expect(youtubeStartSec('https://www.youtube.com/embed/dQw4w9WgXcQ?start=7')).toBe(7);
    expect(youtubeStartSec('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(0);
    expect(youtubeStartSec('not a url')).toBe(0);
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
