import { ArrowUpRight } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getPageWindowId, openSidePanel, supportsSidePanel } from '@/lib/browser-api';
import { repositories } from '@/lib/db';
import { cardsInRow, todayPlan, totalText } from '@/lib/queue/plan';
import { siteLabel } from '@/lib/queue/video-url';
import { useLiveQuery } from '@/lib/use-live-query';
import { runCommand } from '../commands';
import { BUTTON_LINK } from '../ui';
import { VideoThumb } from './VideoThumb';

const listQueue = () => repositories.queue.list('queued');

/** Cards are at least this wide; one row shows as many as fit, the whole queue is in the panel. */
const CARD_MIN_WIDTH = 240;
const CARD_GAP = 12;

/** «Очередь · На сегодня: 3 видео · 47 мин · Вся очередь · 12» and one row of the first videos. */
export function QueueStrip() {
  const queued = useLiveQuery(listQueue);
  const [windowId, setWindowId] = useState<number>();
  const [columns, setColumns] = useState(4);
  const rowRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    void getPageWindowId().then(setWindowId);
  }, []);
  const shown = queued !== undefined && queued.length > 0;
  // Measured before the first paint, then again whenever the row changes width.
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const fit = () => setColumns(cardsInRow(row.clientWidth, CARD_MIN_WIDTH, CARD_GAP));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(row);
    return () => observer.disconnect();
  }, [shown]);
  if (!queued || queued.length === 0) return null;

  return (
    <section aria-labelledby="queue-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <h2 id="queue-heading" className="text-md font-semibold">
          Очередь
        </h2>
        <span className="text-sm text-fg-muted">
          На сегодня: <span className="font-mono">{totalText(todayPlan(queued))}</span>
        </span>
        {supportsSidePanel() && windowId !== undefined && (
          <button
            type="button"
            // Nothing awaited before: Chrome opens the side panel only right in the click.
            onClick={() => void openSidePanel(windowId)}
            className={`ml-auto flex items-center gap-1 text-sm ${BUTTON_LINK}`}
          >
            Вся очередь · <span className="font-mono">{queued.length}</span>
            <ArrowUpRight aria-hidden className="size-3.5" />
          </button>
        )}
      </div>
      <ol
        ref={rowRef}
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {queued.slice(0, columns).map((item, index) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() =>
                void runCommand({ type: 'openVideo', itemId: item.id }, { quiet: true })
              }
              className="flex w-full flex-col overflow-hidden rounded-lg border border-border bg-surface text-left transition-colors duration-(--duration-fast) hover:border-border-control"
            >
              <span className="relative block">
                <VideoThumb item={item} large className="aspect-video w-full" />
                <span className="absolute top-2 left-2 rounded-sm bg-bg-sunken/80 px-1.5 font-mono text-[11px]">
                  #{index + 1}
                </span>
              </span>
              <span className="flex flex-col gap-0.5 px-3 py-2.5">
                <span className="line-clamp-2 text-sm font-semibold">{item.title || item.url}</span>
                <span className="truncate text-xs text-fg-muted">
                  {[item.channel, siteLabel(item.site)].filter(Boolean).join(' · ')}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
