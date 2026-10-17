import { Play } from 'lucide-react';
import { displayHost } from '@/lib/app/overview';
import { youtubeThumbnailUrl } from '@/lib/app/youtube';
import { faviconUrl } from '@/lib/browser-api';
import type { QueueItem } from '@/lib/db';
import { durationLabel, progressShare } from '@/lib/queue/plan';

/** Fits the small thumbnail of the side panel (104 px): «29:12 / 37:05», not «50:00 / 1:36:14». */
const SMALL_LABEL_LENGTH = 13;

/**
 * Preview of a queued video, 16:9: the YouTube thumbnail (the only network request) or the site
 * icon with its host; the time in the corner («29:12 / 37:05» once started) and the watched part
 * as a red bar, as on YouTube.
 */
export function VideoThumb({
  item,
  className = '',
  large = false,
}: {
  item: QueueItem;
  className?: string;
  /** The card of the main page: bigger play icon and labels. */
  large?: boolean;
}) {
  const share = progressShare(item);
  const label = large ? 'px-1.5 text-[11px] leading-4' : 'px-1 text-[10px] leading-3.5';
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden bg-surface-raised ${className}`}
    >
      {item.videoId ? (
        <img
          src={youtubeThumbnailUrl(item.videoId)}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span className="flex flex-col items-center gap-1">
          <img src={item.favIconUrl || faviconUrl(item.url)} alt="" className="size-5" />
          {large && (
            <span className="max-w-full truncate px-2 text-[11px] text-fg-muted">
              {displayHost(item.url)}
            </span>
          )}
        </span>
      )}
      {item.videoId && (
        <Play
          aria-hidden
          className={`relative fill-fg/80 text-transparent drop-shadow ${large ? 'size-8' : 'size-5'}`}
        />
      )}
      <span
        className={`absolute right-1 bottom-1.5 rounded-[4px] whitespace-nowrap bg-bg-sunken/80 font-mono text-fg ${label}`}
        aria-hidden
      >
        {durationLabel(item, large ? undefined : SMALL_LABEL_LENGTH)}
      </span>
      {share > 0 && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-bg-sunken/60">
          <span className="block h-full bg-video-progress" style={{ width: `${share * 100}%` }} />
        </span>
      )}
    </div>
  );
}
