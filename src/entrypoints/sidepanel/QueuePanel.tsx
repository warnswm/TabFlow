import { type Announcements, closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DropdownMenu } from 'radix-ui';
import {
  ArrowUpToLine,
  Check,
  ChevronRight,
  Ellipsis,
  GripVertical,
  KeyRound,
  Play,
  Plus,
  RotateCcw,
  Trash,
} from 'lucide-react';
import { useState } from 'react';
import { applyOrder, moveId } from '@/lib/app/reorder';
import { type BrowserTab, requestSiteAccess } from '@/lib/browser-api';
import { repositories, type QueueItem } from '@/lib/db';
import {
  FREE_TIME_SLOTS,
  formatMinutes,
  pickForTime,
  pickHint,
  progressShare,
  queueTotal,
  type QueueSort,
  sortQueue,
  todayPlan,
  totalText,
} from '@/lib/queue/plan';
import { accessPatterns, missingPatterns } from '@/lib/queue/site-access';
import { siteLabel, videoKey } from '@/lib/queue/video-url';
import { isSaveableUrl } from '@/lib/background/tab-rules';
import { useLiveQuery } from '@/lib/use-live-query';
import { runCommand } from '../app/commands';
import { VideoThumb } from '../app/components/VideoThumb';
import { screenReaderInstructions, useDragSensors } from '../app/dnd';
import { BUTTON_ICON, BUTTON_LINK, MENU_CONTENT, MENU_ITEM, MENU_SEPARATOR } from '../app/ui';
import { useActiveTab, useGrantedSites } from './hooks';

const loadQueue = () =>
  Promise.all([repositories.queue.list('queued'), repositories.queue.list('watched')]);

/** «Просмотрено» shows the latest ones. */
const WATCHED_SHOWN = 20;

const CHIP =
  'h-6.5 rounded-full border px-2.5 font-mono text-xs transition-colors duration-(--duration-fast)';
const CHIP_ON = 'border-accent-soft bg-accent-soft text-accent';
const CHIP_OFF = 'border-border text-fg-muted hover:text-fg';

export function QueuePanel({ sort }: { sort: QueueSort }) {
  const data = useLiveQuery(loadQueue);
  const activeTab = useActiveTab();
  const granted = useGrantedSites();
  const [minutes, setMinutes] = useState(20);
  const sensors = useDragSensors();

  // Right after a drop the new order is shown until the database change arrives.
  const [dropped, setDropped] = useState<{ base: readonly QueueItem[]; ids: string[] }>();
  if (!data) return null;
  const [queued, watched] = data;
  const ordered =
    dropped?.base === queued ? applyOrder(queued, dropped.ids, (item) => item.id) : queued;
  const shown = sortQueue(ordered, sort);
  const priorityOf = new Map(ordered.map((item, index) => [item.id, index + 1]));
  const slot = FREE_TIME_SLOTS.find((item) => item.minutes === minutes) ?? FREE_TIME_SLOTS[0];
  const picked = new Set(pickForTime(ordered, minutes).priorities);
  const total = queueTotal(ordered);
  const canDrag = sort === 'priority';

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const itemId = String(active.id);
    const ids = moveId(
      ordered.map((item) => item.id),
      itemId,
      String(over.id),
    );
    setDropped({ base: queued, ids });
    void runCommand(
      { type: 'moveVideo', itemId, index: ids.indexOf(itemId) },
      { quiet: true },
    ).then((response) => {
      if (!response?.ok) setDropped(undefined);
    });
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Взято видео #${priorityOf.get(String(active.id))}.`,
    onDragOver: ({ over }) =>
      over ? `Над местом #${priorityOf.get(String(over.id))}.` : 'Вне очереди.',
    onDragEnd: ({ over }) =>
      over ? `Видео поставлено на место #${priorityOf.get(String(over.id))}.` : 'Видео на месте.',
    onDragCancel: () => 'Перемещение отменено. Видео на месте.',
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <section
          aria-label="На сегодня"
          className="mx-4 flex flex-col gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-3"
        >
          <p className="flex items-baseline gap-2">
            <span className="text-[13px] text-fg-muted">На сегодня</span>
            <span className="font-mono text-[13px]">
              {ordered.length === 0 ? 'очередь пуста' : totalText(todayPlan(ordered))}
            </span>
          </p>
          <div role="group" aria-label="Свободное время" className="flex flex-wrap gap-1.5">
            {FREE_TIME_SLOTS.map((item) => (
              <button
                key={item.minutes}
                type="button"
                aria-pressed={item.minutes === minutes}
                onClick={() => setMinutes(item.minutes)}
                className={`${CHIP} ${item.minutes === minutes ? CHIP_ON : CHIP_OFF}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {slot && ordered.length > 0 && (
            <p className="text-xs text-fg-subtle">{pickHint(ordered, slot)}</p>
          )}
        </section>

        <div className="flex items-baseline gap-2 px-4 pt-3.5 pb-1.5">
          <h2 className="text-[13px] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
            Очередь
          </h2>
          {total.count > 0 && (
            <span className="font-mono text-xs text-fg-subtle">
              {total.count}
              {total.unknown < total.count && ` · ${formatMinutes(total.totalSec)}`}
            </span>
          )}
        </div>

        {ordered.length === 0 ? (
          <p className="mx-4 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted">
            Очередь пуста. Видео добавляется кнопкой ниже или из меню страницы — «В очередь «на
            потом»».
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            accessibility={{ announcements, screenReaderInstructions }}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={shown.map((item) => item.id)}
              strategy={verticalListSortingStrategy}
              disabled={!canDrag}
            >
              <ol className="flex flex-col gap-0.5 px-2">
                {shown.map((item) => {
                  const priority = priorityOf.get(item.id) ?? 0;
                  return (
                    <VideoRow
                      key={item.id}
                      item={item}
                      priority={priority}
                      picked={picked.has(priority)}
                      canDrag={canDrag}
                      needsAccess={
                        item.durationSec === undefined &&
                        missingPatterns(accessPatterns(item.url, item.playerOrigins), granted)
                          .length > 0
                      }
                    />
                  );
                })}
              </ol>
            </SortableContext>
          </DndContext>
        )}

        {watched.length > 0 && <WatchedList items={watched} />}
      </div>

      <footer className="flex flex-col gap-2 border-t border-border px-4 pt-3 pb-4">
        <AddCurrentTab tab={activeTab} queued={ordered} />
        <p className="text-center text-xs text-fg-subtle">
          {canDrag
            ? 'Перетаскивайте видео, чтобы менять приоритет'
            : 'Сначала короткие — приоритет меняется в порядке «По приоритету»'}
        </p>
      </footer>
    </>
  );
}

function VideoRow({
  item,
  priority,
  picked,
  canDrag,
  needsAccess,
}: {
  item: QueueItem;
  priority: number;
  /** Fits into the chosen free time. */
  picked: boolean;
  canDrag: boolean;
  /** The duration needs access to the site (or to its embedded player). */
  needsAccess: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, attributes: { roleDescription: 'видео' } });
  const share = progressShare(item);
  // The watched share first: the channel may be cut off.
  const meta = [
    `#${priority}`,
    share >= 0.01 ? `${Math.round(share * 100)} %` : undefined,
    item.channel,
    siteLabel(item.site),
  ].filter(Boolean);
  const name = item.title || item.url;
  const allowAccess = () => void requestSiteAccess(accessPatterns(item.url, item.playerOrigins));

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`group flex items-center gap-1.5 rounded-[10px] p-1.5 hover:bg-surface-raised ${
        picked ? 'bg-surface' : ''
      } ${isDragging ? 'relative z-10 bg-surface-raised shadow-drag' : ''}`}
    >
      {canDrag ? (
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Переместить видео «${name}», сейчас #${priority}`}
          className={`${BUTTON_ICON} w-5 cursor-grab text-fg-subtle`}
        >
          <GripVertical aria-hidden className="size-3.5" />
        </button>
      ) : (
        <span aria-hidden className="w-5" />
      )}

      <button
        type="button"
        onClick={() => void runCommand({ type: 'openVideo', itemId: item.id }, { quiet: true })}
        title="Открыть видео"
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left"
      >
        <VideoThumb item={item} className="h-[58px] w-[104px] rounded-md" />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="line-clamp-2 text-[13px] leading-[18px] font-semibold">{name}</span>
          <span className="truncate text-xs text-fg-muted">
            {meta.join(' · ')}
            {picked && <span className="sr-only"> · помещается в свободное время</span>}
          </span>
        </span>
      </button>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger aria-label={`Действия с видео «${name}»`} className={BUTTON_ICON}>
            <Ellipsis aria-hidden className="size-4" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={4} className={MENU_CONTENT}>
              <DropdownMenu.Item
                className={MENU_ITEM}
                onSelect={() =>
                  void runCommand({ type: 'openVideo', itemId: item.id }, { quiet: true })
                }
              >
                <Play aria-hidden /> Открыть
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={MENU_ITEM}
                disabled={priority === 1}
                onSelect={() =>
                  void runCommand({ type: 'moveVideo', itemId: item.id, index: 0 }, { quiet: true })
                }
              >
                <ArrowUpToLine aria-hidden /> Наверх очереди
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={MENU_ITEM}
                onSelect={() =>
                  void runCommand({ type: 'setWatched', itemId: item.id, watched: true })
                }
              >
                <Check aria-hidden /> Просмотрено
              </DropdownMenu.Item>
              {needsAccess && (
                <DropdownMenu.Item className={MENU_ITEM} onSelect={allowAccess}>
                  <KeyRound aria-hidden /> Разрешить доступ к сайту
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Separator className={MENU_SEPARATOR} />
              <DropdownMenu.Item
                className={`${MENU_ITEM} text-danger data-highlighted:text-danger`}
                onSelect={() => void runCommand({ type: 'removeVideo', itemId: item.id })}
              >
                <Trash aria-hidden /> Удалить из очереди
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        {needsAccess && (
          <button
            type="button"
            onClick={allowAccess}
            title="Длительность и позиция видео читаются только на разрешённых сайтах"
            className={`${BUTTON_LINK} text-[11px]`}
          >
            Доступ
          </button>
        )}
      </div>
    </li>
  );
}

function WatchedList({ items }: { items: readonly QueueItem[] }) {
  const latest = [...items]
    .sort((a, b) => (b.watchedAt ?? 0) - (a.watchedAt ?? 0))
    .slice(0, WATCHED_SHOWN);
  return (
    <details className="group/watched mx-2 mt-3 mb-2">
      <summary className="flex cursor-pointer list-none items-baseline gap-2 rounded-md px-2 py-1.5 hover:bg-surface-raised [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden
          className="size-3.5 self-center text-fg-subtle transition-transform group-open/watched:rotate-90"
        />
        <span className="text-[13px] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
          Просмотрено
        </span>
        <span className="font-mono text-xs text-fg-subtle">{items.length}</span>
      </summary>
      <ul className="flex flex-col">
        {latest.map((item) => (
          <li key={item.id} className="flex items-center gap-2 rounded-md py-1 pr-1 pl-7.5">
            <span className="min-w-0 flex-1 truncate text-[13px] text-fg-muted">
              {item.title || item.url}
            </span>
            <button
              type="button"
              aria-label={`Вернуть в очередь «${item.title}»`}
              title="Вернуть в очередь"
              onClick={() =>
                void runCommand({ type: 'setWatched', itemId: item.id, watched: false })
              }
              className={BUTTON_ICON}
            >
              <RotateCcw aria-hidden className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label={`Удалить «${item.title}»`}
              title="Удалить"
              onClick={() => void runCommand({ type: 'removeVideo', itemId: item.id })}
              className={BUTTON_ICON}
            >
              <Trash aria-hidden className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** «Добавить текущую вкладку»: the active tab of the panel's window. */
function AddCurrentTab({
  tab,
  queued,
}: {
  tab: BrowserTab | undefined;
  queued: readonly QueueItem[];
}) {
  const key = tab && videoKey(tab.url);
  const index = key === undefined ? -1 : queued.findIndex((item) => videoKey(item.url) === key);
  const queueable = tab !== undefined && isSaveableUrl(tab.url);

  function add() {
    if (!tab) return;
    // Right in the click: Chrome asks for the site once, the video is added either way.
    void requestSiteAccess(accessPatterns(tab.url));
    void runCommand({ type: 'queueTab', chromeTabId: tab.id });
  }

  return (
    <button
      type="button"
      disabled={!queueable || index >= 0}
      onClick={add}
      className="flex h-10 items-center justify-center gap-2 rounded-[10px] bg-accent text-sm font-semibold text-on-accent transition-colors duration-(--duration-fast) hover:bg-accent-hover active:bg-accent-pressed disabled:opacity-50 disabled:hover:bg-accent"
    >
      {index >= 0 ? (
        <>
          <Check aria-hidden className="size-4" strokeWidth={2.4} />
          Текущая вкладка в очереди · #{index + 1}
        </>
      ) : (
        <>
          <Plus aria-hidden className="size-4" strokeWidth={2.4} />
          {queueable || !tab ? 'Добавить текущую вкладку' : 'Служебная страница — не добавляется'}
        </>
      )}
    </button>
  );
}
