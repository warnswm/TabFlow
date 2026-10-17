/**
 * Rules of the content script on video pages (`entrypoints/video.content.ts`): which `<video>`
 * is the video of the page, how often its position is reported, when it counts as watched.
 * Pure functions: the DOM stays in the entrypoint.
 */

/** Position reports while the video plays; pauses, seeks and leaving the page report at once. */
export const REPORT_INTERVAL_MS = 10_000;

/** A smaller `<video>` is a preview or an ad block, not the video of the page. */
const MIN_WIDTH = 200;
const MIN_HEIGHT = 100;

/** Duration in whole seconds; `undefined` for a live stream or a video not loaded yet. */
export function usableDuration(duration: number): number | undefined {
  return Number.isFinite(duration) && duration > 0 ? Math.round(duration) : undefined;
}

/** The largest visible video of the page; -1 when there is none. */
export function mainVideoIndex(sizes: readonly { width: number; height: number }[]): number {
  let best = -1;
  let bestArea = 0;
  sizes.forEach(({ width, height }, index) => {
    const area = width * height;
    if (width >= MIN_WIDTH && height >= MIN_HEIGHT && area > bestArea) {
      best = index;
      bestArea = area;
    }
  });
  return best;
}

/** Credits are not watched: the last 5 % (at most 30 s) count as the end. */
export function isNearEnd(positionSec: number, durationSec: number): boolean {
  if (durationSec <= 0) return false;
  return durationSec - positionSec <= Math.min(30, durationSec * 0.05);
}

/** A saved position worth continuing from: not the very start and not the end. */
export function resumePosition(savedSec: number, durationSec: number | undefined) {
  if (savedSec < 10 || durationSec === undefined || isNearEnd(savedSec, durationSec)) {
    return undefined;
  }
  return savedSec;
}

/**
 * Origins of frames that may play the page's video (an embedded player of another site):
 * large enough and not of the page's own origin.
 */
export function playerOrigins(
  pageOrigin: string,
  frames: readonly { src: string; width: number; height: number }[],
): string[] {
  const origins = new Set<string>();
  for (const { src, width, height } of frames) {
    if (width < MIN_WIDTH || height < MIN_HEIGHT) continue;
    try {
      const { origin, protocol } = new URL(src);
      if (origin !== pageOrigin && (protocol === 'https:' || protocol === 'http:')) {
        origins.add(origin);
      }
    } catch {
      // `about:blank`, `javascript:` and broken addresses play nothing.
    }
  }
  return [...origins].slice(0, 5);
}
