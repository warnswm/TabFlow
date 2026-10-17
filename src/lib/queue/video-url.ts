/**
 * Addresses of videos in the queue: one key per video (a YouTube video has many URLs), the site
 * shown under the title, a title without the site's additions.
 */
import { youtubeVideoId } from '../app/youtube';

/** Playback position in the URL (`&t=95s`): the same video, another moment. */
const TIME_PARAMS = ['t', 'start', 'time_continue'];

/**
 * The same key for every URL of one video: the YouTube id, otherwise the URL without `#anchor`
 * and position parameters.
 */
export function videoKey(url: string): string {
  const videoId = youtubeVideoId(url);
  if (videoId) return `youtube:${videoId}`;
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    for (const param of TIME_PARAMS) parsed.searchParams.delete(param);
    return parsed.href;
  } catch {
    return url;
  }
}

/** Host without `www.` and `m.`: `youtube.com`, `vkvideo.ru`. Empty for a broken URL. */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^(?:www|m)\./, '');
  } catch {
    return '';
  }
}

/** What the queue shows as the source: «YouTube» or the host. */
export function siteLabel(site: string): string {
  return site === 'youtube.com' || site === 'youtu.be' ? 'YouTube' : site;
}

/** «(3) Название - YouTube» → «Название». */
export function cleanVideoTitle(title: string): string {
  return title
    .replace(/^\(\d+\+?\)\s+/, '')
    .replace(/\s+[-–—]\s+YouTube$/, '')
    .trim();
}
