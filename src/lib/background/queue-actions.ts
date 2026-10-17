/**
 * The video queue «на потом»: adding a tab or a link, opening, priority, watched, removing — and
 * the reports of the content script on video pages (duration, position, the end of the video).
 * Adding never touches the tab: it stays open where it is.
 */
import type { Id, QueueItem, QueueItemUpdate } from '../db';
import { CommandError, type CommandResult, type VideoReport } from '../messages';
import { cleanVideoTitle, siteOf, videoKey } from '../queue/video-url';
import { isNearEnd, resumePosition } from '../queue/video-page';
import { youtubeVideoId } from '../app/youtube';
import type { BackgroundContext } from './context';
import { result } from './group-actions';
import { targetTab } from './quick-actions';
import { isSaveableUrl } from './tab-rules';

async function requireItem(ctx: BackgroundContext, itemId: Id): Promise<QueueItem> {
  const item = await ctx.repos.queue.get(itemId);
  if (!item) throw new CommandError('video-not-found', `Queue item ${itemId} not found`);
  return item;
}

/** The result with the video and its place in the queue (0 — not queued). */
async function videoResult(
  ctx: BackgroundContext,
  item: QueueItem,
  created = false,
): Promise<CommandResult> {
  const queued = await ctx.repos.queue.list('queued');
  const priority = queued.findIndex((other) => other.id === item.id) + 1;
  return result({ video: { itemId: item.id, title: item.title, priority, created } });
}

async function addToQueue(
  ctx: BackgroundContext,
  url: string,
  title: string,
  favIconUrl?: string,
): Promise<{ item: QueueItem; created: boolean }> {
  if (!isSaveableUrl(url)) {
    throw new CommandError('page-not-queueable', 'Only web pages and files go into the queue');
  }
  return ctx.repos.queue.add({
    url,
    title: title || url,
    site: siteOf(url),
    videoId: youtubeVideoId(url),
    favIconUrl,
  });
}

/**
 * «В очередь «на потом»» for a tab: the tab stays open. The content script of the page (on sites
 * TabFlow has access to) is asked to report the duration right away.
 */
export async function queueTab(
  ctx: BackgroundContext,
  chromeTabId?: number,
): Promise<CommandResult> {
  const tab = await targetTab(ctx, chromeTabId);
  const { item, created } = await addToQueue(
    ctx,
    tab.url,
    cleanVideoTitle(tab.title),
    tab.favIconUrl,
  );
  await ctx.api.requestVideoReport(tab.id);
  return videoResult(ctx, item, created);
}

/** A link into the queue; its duration becomes known when the video is opened. */
export async function queueLink(
  ctx: BackgroundContext,
  url: string,
  title?: string,
): Promise<CommandResult> {
  const { item, created } = await addToQueue(ctx, url, title?.trim() ?? '');
  return videoResult(ctx, item, created);
}

/** Shows the tab that already plays the video, or opens it at the end of the current window. */
export async function openVideo(ctx: BackgroundContext, itemId: Id): Promise<CommandResult> {
  const { api } = ctx;
  const item = await requireItem(ctx, itemId);
  const key = videoKey(item.url);
  const open = (await api.queryTabs({})).find((tab) => videoKey(tab.url) === key);
  if (open) {
    await api.activateTab(open.id);
  } else {
    await api.createTab({ windowId: await api.getCurrentWindowId(), url: item.url, active: true });
  }
  return videoResult(ctx, item);
}

export async function moveVideo(
  ctx: BackgroundContext,
  itemId: Id,
  index: number,
): Promise<CommandResult> {
  const item = await requireItem(ctx, itemId);
  await ctx.repos.queue.place(item.id, index);
  return videoResult(ctx, item);
}

/** Watched — out of the queue into «Просмотрено»; not watched — back at the end of the queue. */
export async function setWatched(
  ctx: BackgroundContext,
  itemId: Id,
  watched: boolean,
): Promise<CommandResult> {
  const item = await requireItem(ctx, itemId);
  const before = await videoResult(ctx, item);
  if (watched) await ctx.repos.queue.markWatched(item.id);
  else await ctx.repos.queue.markUnwatched(item.id);
  const after = await videoResult(ctx, item);
  const wasPriority = before.video?.priority || undefined;
  return after.video ? { ...after, video: { ...after.video, wasPriority } } : after;
}

export async function removeVideo(ctx: BackgroundContext, itemId: Id): Promise<CommandResult> {
  const item = await requireItem(ctx, itemId);
  await ctx.repos.queue.remove(item.id);
  return videoResult(ctx, item);
}

export async function restoreVideo(ctx: BackgroundContext, itemId: Id): Promise<CommandResult> {
  try {
    await ctx.repos.queue.restore(itemId);
  } catch {
    throw new CommandError('video-not-found', `Removed queue item ${itemId} not found`);
  }
  return videoResult(ctx, await requireItem(ctx, itemId));
}

/** Below this the video has just started: a saved position further on is worth continuing from. */
const JUST_STARTED_SEC = 5;

/**
 * A report of the content script in `tabId`. Only a queued video of that page is updated: its
 * duration, title and channel when they were unknown, the position; at the end it is watched.
 * A newly loaded video gets the saved position back in `seekToSec`.
 */
export async function videoProgress(
  ctx: BackgroundContext,
  tabId: number,
  report: VideoReport,
): Promise<CommandResult> {
  const { api, repos } = ctx;
  const tab = await api.getTab(tabId);
  const item = tab && (await repos.queue.findByUrl(tab.url));
  if (!item || item.status !== 'queued') return result({});

  const changes: QueueItemUpdate = {};
  const durationSec = report.durationSec ?? item.durationSec;
  if (report.durationSec !== undefined && report.durationSec !== item.durationSec) {
    changes.durationSec = report.durationSec;
  }
  if (report.durationSec !== undefined && item.playerOrigins) changes.playerOrigins = undefined;
  if (report.playerOrigins && durationSec === undefined) {
    changes.playerOrigins = report.playerOrigins;
  }
  const title = report.title && cleanVideoTitle(report.title);
  if (title && item.title === item.url) changes.title = title;
  if (report.channel && !item.channel) changes.channel = report.channel.trim();
  if (Object.keys(changes).length > 0) await repos.queue.update(item.id, changes);

  // A report without a video of its own (only the frames of the page) has no position.
  if (report.durationSec === undefined || durationSec === undefined) return result({});

  if (report.ended || isNearEnd(report.positionSec, durationSec)) {
    await repos.queue.markWatched(item.id);
    return videoResult(ctx, item);
  }
  if (report.loaded && report.positionSec < JUST_STARTED_SEC) {
    const seekToSec = resumePosition(item.positionSec, durationSec);
    // The saved position stays until the video is watched further.
    if (seekToSec !== undefined) return result({ seekToSec });
  }
  await repos.queue.updateProgress(item.id, Math.round(report.positionSec));
  return result({});
}
