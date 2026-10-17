import { describe, expect, it } from 'vitest';
import { accessPatterns, missingPatterns, patternCovers, sitePattern } from './site-access';
import {
  isNearEnd,
  mainVideoIndex,
  playerOrigins,
  resumePosition,
  usableDuration,
} from './video-page';
import { cleanVideoTitle, siteLabel, siteOf, videoKey } from './video-url';

describe('video addresses', () => {
  it('gives every URL of one video the same key', () => {
    const id = 'dQw4w9WgXcQ';
    expect(videoKey(`https://www.youtube.com/watch?v=${id}&t=95s`)).toBe(`youtube:${id}`);
    expect(videoKey(`https://youtu.be/${id}`)).toBe(`youtube:${id}`);
    expect(videoKey('https://vkvideo.ru/video-1_2?t=1m5s#comments')).toBe(
      'https://vkvideo.ru/video-1_2',
    );
    expect(videoKey('https://vkvideo.ru/video-1_2')).not.toBe(
      videoKey('https://vkvideo.ru/video-1_3'),
    );
    expect(videoKey('not a url')).toBe('not a url');
  });

  it('names the site and cleans the title', () => {
    expect(siteOf('https://www.youtube.com/watch?v=x')).toBe('youtube.com');
    expect(siteOf('https://m.vk.com/video1')).toBe('vk.com');
    expect(siteOf('nope')).toBe('');
    expect(siteLabel('youtube.com')).toBe('YouTube');
    expect(siteLabel('vkvideo.ru')).toBe('vkvideo.ru');
    expect(cleanVideoTitle('(3) Dexie.js за 15 минут - YouTube')).toBe('Dexie.js за 15 минут');
    expect(cleanVideoTitle('Доклад — Конференция')).toBe('Доклад — Конференция');
  });
});

describe('site access', () => {
  it('asks for the whole site of the page and of its players', () => {
    expect(sitePattern('https://lektorium.tv/lecture/1')).toBe('*://lektorium.tv/*');
    expect(sitePattern('file:///C:/video.mp4')).toBeUndefined();
    expect(sitePattern('chrome://extensions')).toBeUndefined();
    expect(
      accessPatterns('https://lektorium.tv/a', [
        'https://player.vimeo.com',
        'https://lektorium.tv',
      ]),
    ).toEqual(['*://lektorium.tv/*', '*://player.vimeo.com/*']);
  });

  it('matches the patterns Chrome grants', () => {
    expect(patternCovers('*://lektorium.tv/*', 'https://lektorium.tv/a')).toBe(true);
    expect(patternCovers('*://lektorium.tv/*', 'https://other.tv/a')).toBe(false);
    expect(patternCovers('*://*.vk.com/*', 'https://m.vk.com/video')).toBe(true);
    expect(patternCovers('*://*.vk.com/*', 'https://vk.com/video')).toBe(true);
    expect(patternCovers('https://*/*', 'http://a.example/')).toBe(false);
    expect(patternCovers('*://*/*', 'file:///a')).toBe(false);
    expect(patternCovers('<all_urls>', 'https://a.example/')).toBe(true);
    expect(missingPatterns(['*://a.tv/*', '*://b.tv/*'], ['*://a.tv/*'])).toEqual(['*://b.tv/*']);
    expect(missingPatterns(['*://a.tv/*'], ['*://*/*'])).toEqual([]);
  });
});

describe('video page', () => {
  it('finds the video of the page: the largest one', () => {
    expect(
      mainVideoIndex([
        { width: 160, height: 90 },
        { width: 1280, height: 720 },
        { width: 640, height: 360 },
      ]),
    ).toBe(1);
    expect(mainVideoIndex([{ width: 120, height: 68 }])).toBe(-1);
    expect(mainVideoIndex([])).toBe(-1);
  });

  it('ignores live streams and videos not loaded yet', () => {
    expect(usableDuration(1121.6)).toBe(1122);
    expect(usableDuration(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(usableDuration(Number.NaN)).toBeUndefined();
    expect(usableDuration(0)).toBeUndefined();
  });

  it('counts the credits as the end and continues only from the middle', () => {
    expect(isNearEnd(1100, 1122)).toBe(true);
    expect(isNearEnd(1000, 1122)).toBe(false);
    expect(isNearEnd(115, 120)).toBe(true);
    expect(isNearEnd(100, 120)).toBe(false);
    expect(resumePosition(300, 1122)).toBe(300);
    expect(resumePosition(5, 1122)).toBeUndefined();
    expect(resumePosition(1110, 1122)).toBeUndefined();
    expect(resumePosition(300, undefined)).toBeUndefined();
  });

  it('names the sites of embedded players', () => {
    expect(
      playerOrigins('https://lektorium.tv', [
        { src: 'https://player.vimeo.com/video/1', width: 800, height: 450 },
        { src: 'https://lektorium.tv/frame', width: 800, height: 450 },
        { src: 'https://ads.example/banner', width: 300, height: 50 },
        { src: 'about:blank', width: 800, height: 450 },
        { src: 'https://player.vimeo.com/video/2', width: 800, height: 450 },
      ]),
    ).toEqual(['https://player.vimeo.com']);
  });
});
