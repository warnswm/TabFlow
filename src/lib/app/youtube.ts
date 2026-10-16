/** YouTube links: video id for thumbnails (the tile preview now, the queue at stage 6). */

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const VIDEO_ID = /^[\w-]{11}$/;

/** The video id of a watch, shorts, embed, live or youtu.be link; `undefined` for anything else. */
export function youtubeVideoId(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  let id: string | null | undefined;
  if (parsed.hostname === 'youtu.be') {
    id = parsed.pathname.split('/')[1];
  } else if (YOUTUBE_HOSTS.has(parsed.hostname)) {
    id =
      parsed.pathname === '/watch'
        ? parsed.searchParams.get('v')
        : /^\/(?:shorts|embed|live)\/([^/]+)/.exec(parsed.pathname)?.[1];
  }
  return id && VIDEO_ID.test(id) ? id : undefined;
}

/** 320×180 thumbnail — the only network request of the overview. */
export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}
