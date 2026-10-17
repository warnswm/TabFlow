/**
 * Content script of video pages: reports the duration and the position of the page's video to
 * the background, which keeps them for the video in the queue. Runs only on the sites the author
 * allowed (registered at runtime, see `syncVideoScript`), in every frame: embedded players too.
 * Nothing is sent anywhere else; the background ignores videos that are not in the queue.
 */
import { defineContentScript } from 'wxt/utils/define-content-script';
import { onVideoReportRequest, sendRuntimeMessage } from '@/lib/browser-api';
import type { CommandResponse, VideoReport } from '@/lib/messages';
import {
  mainVideoIndex,
  playerOrigins,
  REPORT_INTERVAL_MS,
  usableDuration,
} from '@/lib/queue/video-page';

/** How often the page is looked through for its video (players appear and are replaced). */
const SCAN_INTERVAL_MS = 2000;

declare global {
  interface Window {
    __tabflowVideo?: boolean;
  }
}

export default defineContentScript({
  registration: 'runtime',
  matches: [],
  main() {
    // Registered and also started in tabs opened before access was allowed: run once.
    if (window.__tabflowVideo) return;
    window.__tabflowVideo = true;

    const isTop = window.top === window;
    let video: HTMLVideoElement | undefined;
    let lastReport = 0;
    let reportedFramesFor = '';
    let stopped = false;
    let scanTimer = 0;

    /** YouTube plays ads in the same `<video>`: their length is not the video's. */
    const isAd = () => document.querySelector('.html5-video-player.ad-showing') !== null;

    function channelName(): string | undefined {
      const youtube = document.querySelector('ytd-watch-metadata #channel-name a');
      const text = youtube?.textContent?.trim();
      if (text) return text;
      return document.querySelector('meta[name="author"]')?.getAttribute('content')?.trim();
    }

    function send(report: VideoReport): void {
      if (stopped) return;
      lastReport = Date.now();
      let reply: Promise<CommandResponse>;
      try {
        reply = sendRuntimeMessage<CommandResponse>({ type: 'videoProgress', ...report });
      } catch {
        stop(); // the extension was reloaded or removed
        return;
      }
      void reply
        .then((response) => {
          const seekTo = response?.ok ? response.result.seekToSec : undefined;
          if (report.loaded && seekTo !== undefined && video && video.currentTime < 5) {
            video.currentTime = seekTo;
          }
        })
        .catch(stop);
    }

    function reportVideo(extra: Partial<VideoReport> = {}): void {
      if (!video || isAd()) return;
      const durationSec = usableDuration(video.duration);
      if (durationSec === undefined) return; // a live stream, or not loaded yet
      send({
        positionSec: Math.round(video.currentTime),
        durationSec,
        ...(isTop ? { title: document.title, channel: channelName() } : {}),
        ...extra,
      });
    }

    /** The page plays its video in a frame of another site: the background learns which. */
    function reportFrames(): void {
      if (!isTop || reportedFramesFor === location.href) return;
      const frames = [...document.querySelectorAll('iframe')].map((frame) => {
        const { width, height } = frame.getBoundingClientRect();
        return { src: frame.src, width, height };
      });
      const origins = playerOrigins(location.origin, frames);
      if (origins.length === 0) return;
      reportedFramesFor = location.href;
      send({ positionSec: 0, title: document.title, playerOrigins: origins });
    }

    const onLoaded = () => reportVideo({ loaded: true });
    const onTime = () => {
      if (Date.now() - lastReport >= REPORT_INTERVAL_MS) reportVideo();
    };
    const onPause = () => reportVideo();
    const onEnded = () => reportVideo({ ended: true });

    function attach(next: HTMLVideoElement | undefined): void {
      if (next === video) return;
      if (video) {
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('timeupdate', onTime);
        video.removeEventListener('pause', onPause);
        video.removeEventListener('seeked', onPause);
        video.removeEventListener('ended', onEnded);
      }
      video = next;
      if (!video) return;
      video.addEventListener('loadedmetadata', onLoaded);
      video.addEventListener('timeupdate', onTime);
      video.addEventListener('pause', onPause);
      video.addEventListener('seeked', onPause);
      video.addEventListener('ended', onEnded);
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) onLoaded();
    }

    function scan(): void {
      if (video?.isConnected) return;
      const videos = [...document.querySelectorAll('video')];
      const index = mainVideoIndex(videos.map((item) => item.getBoundingClientRect()));
      attach(videos[index]);
      if (!video) reportFrames();
    }

    function stop(): void {
      stopped = true;
      window.clearInterval(scanTimer);
      attach(undefined);
    }

    scan();
    scanTimer = window.setInterval(scan, SCAN_INTERVAL_MS);
    onVideoReportRequest(() => {
      if (video) reportVideo();
      else {
        reportedFramesFor = '';
        reportFrames();
      }
    });
    // Leaving the page or the tab: the last position is kept.
    window.addEventListener('pagehide', () => reportVideo());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') reportVideo();
    });
  },
});
