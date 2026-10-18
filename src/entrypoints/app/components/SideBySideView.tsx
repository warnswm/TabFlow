import {
  ArrowLeft,
  BookmarkPlus,
  Columns2,
  ExternalLink,
  LayoutGrid,
  Plus,
  RotateCw,
  X,
} from 'lucide-react';
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { displayHost, type Overview } from '@/lib/app/overview';
import type { Route } from '@/lib/app/route';
import type { SearchIndex } from '@/lib/app/search';
import {
  defaultLayoutName,
  layoutPanes,
  type PickedItem,
  pickedItems,
  toLayoutLinks,
  withAdded,
} from '@/lib/app/tile-picker';
import {
  allowFramesInThisTab,
  type BrowserTab,
  faviconUrl,
  grantedSitePatterns,
  listOpenTabs,
  requestSiteAccess,
  showOrOpenPage,
} from '@/lib/browser-api';
import { repositories, type TileLayout } from '@/lib/db';
import { patternCovers, sitePattern } from '@/lib/queue/site-access';
import {
  isPaneArrangement,
  isTileCount,
  MAX_TILES,
  moveRect,
  paneRects,
  type Rect,
  RESIZE_HANDLES,
  type ResizeHandle,
  resizeRect,
} from '@/lib/tiling/layout';
import { useLiveQuery } from '@/lib/use-live-query';
import { runCommand } from '../commands';
import { navigate } from '../hooks';
import { useUi } from '../store';
import { AddPanesDialog } from './TileDialog';
import { BUTTON_ICON, BUTTON_PRIMARY, BUTTON_SECONDARY, UNTITLED } from '../ui';

/**
 * «Рядом»: the main page turns into a viewer of 2–9 sites (links or open tabs), each in a frame of
 * its own. Panes start in the grid of `tiling/layout.ts`; each one moves by its bar and resizes by
 * its edges and corners at will — panes may overlap, the one touched last is on top. A saved
 * layout keeps where its panes are. Frames are not tabs: a site loads anew, and the tabs and groups
 * of Chrome stay as they are. Sites that refuse to show in a frame open in a tab instead.
 */

export type ViewerRoute = Extract<Route, { view: 'side' | 'layout' }>;

const SITE = /^https?:\/\//;

/** A pane is never smaller than this, in pixels. */
const MIN_PANE = { width: 240, height: 160 };

/** Where the handles sit in the gap around a pane, and their cursors. */
const HANDLE_CLASS: Record<ResizeHandle, string> = {
  n: 'top-0 inset-x-3 h-2 cursor-ns-resize',
  s: 'bottom-0 inset-x-3 h-2 cursor-ns-resize',
  e: 'right-0 inset-y-3 w-2 cursor-ew-resize',
  w: 'left-0 inset-y-3 w-2 cursor-ew-resize',
  ne: 'top-0 right-0 size-3 cursor-nesw-resize',
  sw: 'bottom-0 left-0 size-3 cursor-nesw-resize',
  nw: 'top-0 left-0 size-3 cursor-nwse-resize',
  se: 'bottom-0 right-0 size-3 cursor-nwse-resize',
};

/** Removes the headers that forbid framing, before the first frame loads. */
function useFramesAllowed(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    allowFramesInThisTab()
      .catch((error: unknown) => console.info('[TabFlow] Frames are not allowed:', error))
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}

type Rects = Readonly<Record<string, Rect>>;

export function SideBySideView({
  route,
  overview,
  index,
}: {
  route: ViewerRoute;
  overview: Overview;
  index: SearchIndex;
}) {
  const layoutId = route.view === 'layout' ? route.layoutId : undefined;
  const loadLayout = useMemo(
    () => async (): Promise<TileLayout | null> =>
      layoutId === undefined ? null : ((await repositories.layouts.get(layoutId)) ?? null),
    [layoutId],
  );
  const layout = useLiveQuery(loadLayout);
  const framesReady = useFramesAllowed();
  const [granted, setGranted] = useState<string[]>();
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  /** Panes moved or resized here, by key; `undefined` — nothing touched yet. */
  const [moved, setMoved] = useState<Rects>();
  /** Keys in the order panes were touched: the last one is on top. */
  const [front, setFront] = useState<string[]>([]);
  /** A pane is being moved or resized: frames must not take the pointer meanwhile. */
  const [dragging, setDragging] = useState(false);
  const areaRef = useRef<HTMLElement>(null);
  // Titles of open tabs outside TabFlow, shown by their address.
  const [pages, setPages] = useState<BrowserTab[]>([]);
  useEffect(() => {
    listOpenTabs()
      .then(setPages)
      .catch(() => setPages([]));
  }, []);

  const readGranted = () => void grantedSitePatterns().then(setGranted);
  useEffect(() => readGranted(), []);

  const panes =
    route.view === 'side'
      ? pickedItems(overview, pages, route.items)
      : layout
        ? layoutPanes(overview, layout.links)
        : [];
  const shown = panes.filter((pane) => !closed.has(pane.key));
  const savedRects =
    layout && isPaneArrangement(layout.rects, layout.links.length) ? layout.rects : undefined;
  const grid = paneRects(shown.length);
  const title = route.view === 'layout' ? layout?.name || UNTITLED : 'Рядом';
  const loading = route.view === 'layout' && layout === undefined;
  const arranged = moved !== undefined || savedRects !== undefined;

  /** Where a pane is: moved here, else saved in the layout, else the grid of the shown panes. */
  function rectOf(pane: PickedItem): Rect {
    const touched = moved?.[pane.key];
    if (touched) return touched;
    const saved = savedRects?.[panes.indexOf(pane)];
    if (saved) return saved;
    return (
      grid[shown.indexOf(pane)] ?? paneRects(1)[0] ?? { left: 0, top: 0, width: 100, height: 100 }
    );
  }

  /** A saved layout keeps where its panes are; closed panes keep their places too. */
  function saveArrangement(rects: Rects | undefined) {
    if (!layout) return;
    const all =
      rects &&
      panes.map((pane, i) => rects[pane.key] ?? savedRects?.[i] ?? paneRects(panes.length)[i]);
    repositories.layouts
      .setRects(layout.id, all?.every((rect) => rect !== undefined) ? all : undefined)
      .catch(() =>
        useUi.getState().showToast('Расположение рамок не сохранено — раскладка прежняя.'),
      );
  }

  function startDrag(event: ReactPointerEvent, pane: PickedItem, handle: ResizeHandle | 'move') {
    const area = areaRef.current?.getBoundingClientRect();
    if (event.button !== 0 || !area || area.width === 0 || area.height === 0) return;
    event.preventDefault();
    // The first touch fixes every pane where it is: closing one no longer moves the others.
    const base: Rects = moved ?? Object.fromEntries(shown.map((item) => [item.key, rectOf(item)]));
    const start = base[pane.key] ?? rectOf(pane);
    const min = {
      width: Math.min(100, (MIN_PANE.width / area.width) * 100),
      height: Math.min(100, (MIN_PANE.height / area.height) * 100),
    };
    let last = start;
    setMoved(base);
    setFront((keys) => [...keys.filter((key) => key !== pane.key), pane.key]);
    setDragging(true);

    const onMove = (move: PointerEvent) => {
      const dx = ((move.clientX - event.clientX) / area.width) * 100;
      const dy = ((move.clientY - event.clientY) / area.height) * 100;
      last = handle === 'move' ? moveRect(start, dx, dy) : resizeRect(start, handle, dx, dy, min);
      setMoved((current) => ({ ...(current ?? base), [pane.key]: last }));
    };
    const onEnd = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      setDragging(false);
      saveArrangement({ ...base, [pane.key]: last });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  }

  function resetArrangement() {
    setMoved(undefined);
    setFront([]);
    saveArrangement(undefined);
  }

  /** Saves the panes shown here as a layout, with where they are; the viewer then shows it. */
  async function saveLayout() {
    const { showToast } = useUi.getState();
    if (!isTileCount(shown.length)) return;
    const name = defaultLayoutName(shown);
    try {
      const saved = await repositories.layouts.create(
        name,
        toLayoutLinks(shown),
        arranged ? shown.map(rectOf) : undefined,
      );
      showToast(`Раскладка «${name}» сохранена — она в диалоге «Рядом» на главной.`);
      navigate({ view: 'layout', layoutId: saved.id });
    } catch {
      showToast('Раскладка не сохранена. Ссылки остались в своих группах.');
    }
  }

  function back() {
    window.location.hash = useUi.getState().viewerReturn ?? '#/';
  }

  // «Добавить»: a saved layout counts all its links (closing a pane only hides it), «Рядом» —
  // the panes shown.
  const [adding, setAdding] = useState(false);
  const paneCount = layout ? layout.links.length : shown.length;
  const room = MAX_TILES - paneCount;

  /** New panes join the shown ones on top; frames already open are not reloaded. */
  async function addPanes(items: readonly PickedItem[]) {
    readGranted();
    if (route.view === 'side') {
      const keys = items.map((item) => item.key);
      setClosed((current) => new Set([...current].filter((key) => !keys.includes(key))));
      setFront((current) => [...current.filter((key) => !keys.includes(key)), ...keys]);
      navigate({ view: 'side', items: withAdded(route.items, closed, keys) });
      return;
    }
    if (!layout) return;
    try {
      const updated = await repositories.layouts.addLinks(layout.id, toLayoutLinks(items));
      const fresh = layoutPanes(overview, updated.links)
        .slice(layout.links.length)
        .map((pane) => pane.key);
      setFront((current) => [...current, ...fresh]);
    } catch {
      useUi.getState().showToast('Раскладка не изменилась — ссылки остались в своих группах.');
    }
  }

  return (
    <div className="flex h-screen flex-col bg-bg">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-3">
        <button type="button" onClick={back} className={BUTTON_SECONDARY}>
          <ArrowLeft aria-hidden className="size-4" />К группам
        </button>
        <Columns2 aria-hidden className="size-4 shrink-0 text-accent" />
        <h1 className="min-w-0 truncate text-md font-semibold">{title}</h1>
        <p className="ml-auto hidden truncate text-xs text-fg-subtle xl:block">
          Рамку двигает заголовок, размер меняют края и углы. Сайт не показывается — «Открыть во
          вкладке».
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-2 xl:ml-0">
          {arranged && shown.length > 0 && (
            <button type="button" onClick={resetArrangement} className={BUTTON_SECONDARY}>
              <LayoutGrid aria-hidden className="size-4" />
              Выровнять
            </button>
          )}
          {route.view === 'side' && isTileCount(shown.length) && (
            <button type="button" onClick={() => void saveLayout()} className={BUTTON_SECONDARY}>
              <BookmarkPlus aria-hidden className="size-4" />
              Сохранить раскладку
            </button>
          )}
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={room <= 0 || loading}
            title={room <= 0 ? `Рядом — не больше ${MAX_TILES} рамок` : 'Добавить сайты рядом'}
            className={BUTTON_PRIMARY}
          >
            <Plus aria-hidden className="size-4" />
            Добавить
          </button>
        </div>
      </header>
      <AddPanesDialog
        overview={overview}
        index={index}
        open={adding}
        onOpenChange={setAdding}
        adding={{
          shownUrls: new Set((layout ? panes : shown).map((pane) => pane.url)),
          shownCount: paneCount,
          onAdd: (items) => void addPanes(items),
        }}
      />

      <main ref={areaRef} className={`relative min-h-0 flex-1 ${dragging ? 'select-none' : ''}`}>
        {shown.length === 0 && !loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-fg-muted">
            <p>
              {route.view === 'layout' && layout === null
                ? 'Раскладка не найдена — возможно, она уже удалена.'
                : 'Рядом ничего не открыто. Ссылки остались в своих группах.'}
            </p>
            <button type="button" onClick={back} className={BUTTON_PRIMARY}>
              К группам
            </button>
          </div>
        ) : (
          shown.map((pane) => {
            const rect = rectOf(pane);
            return (
              <div
                key={pane.key}
                className="absolute p-1"
                style={{
                  left: `${rect.left}%`,
                  top: `${rect.top}%`,
                  width: `${rect.width}%`,
                  height: `${rect.height}%`,
                  zIndex: front.indexOf(pane.key) + 1,
                }}
                onPointerDownCapture={() =>
                  setFront((keys) =>
                    keys.at(-1) === pane.key
                      ? keys
                      : [...keys.filter((key) => key !== pane.key), pane.key],
                  )
                }
              >
                <Pane
                  pane={pane}
                  framesReady={framesReady && granted !== undefined}
                  hasAccess={granted?.some((pattern) => patternCovers(pattern, pane.url)) ?? false}
                  dragging={dragging}
                  onMoveStart={(event) => startDrag(event, pane, 'move')}
                  onAccess={readGranted}
                  onClose={() => setClosed((keys) => new Set(keys).add(pane.key))}
                />
                {RESIZE_HANDLES.map((handle) => (
                  <div
                    key={handle}
                    aria-hidden
                    onPointerDown={(event) => startDrag(event, pane, handle)}
                    className={`absolute touch-none ${HANDLE_CLASS[handle]}`}
                  />
                ))}
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}

interface PaneProps {
  pane: PickedItem;
  framesReady: boolean;
  hasAccess: boolean;
  /** A pane is being moved or resized: the frame lets the pointer through. */
  dragging: boolean;
  onMoveStart: (event: ReactPointerEvent) => void;
  onAccess: () => void;
  onClose: () => void;
}

/** One site: a bar with its name and actions (dragged to move the pane), and the frame. */
function Pane({
  pane,
  framesReady,
  hasAccess,
  dragging,
  onMoveStart,
  onAccess,
  onClose,
}: PaneProps) {
  const [reload, setReload] = useState(0);
  const site = SITE.test(pane.url);
  const host = displayHost(pane.url);
  const name = pane.title || pane.url;

  function openInTab() {
    if (pane.link) void runCommand({ type: 'openTab', tabId: pane.link.id }, { quiet: true });
    else void showOrOpenPage(pane.url);
  }

  function allowAccess() {
    const pattern = sitePattern(pane.url);
    if (!pattern) return;
    // Right in the click: Chrome asks only then.
    void requestSiteAccess([pattern]).then((allowed) => {
      if (allowed) onAccess();
    });
  }

  return (
    <section
      aria-label={name}
      className="flex h-full flex-col overflow-hidden rounded-md border border-border bg-surface shadow-popover"
    >
      <div
        onPointerDown={(event) => {
          // The buttons of the bar are clicked, not dragged.
          if (!(event.target as HTMLElement).closest('button')) onMoveStart(event);
        }}
        className="flex h-9 shrink-0 cursor-grab touch-none items-center gap-2 border-b border-border px-2 text-sm active:cursor-grabbing"
      >
        <img alt="" src={faviconUrl(pane.url, 16)} className="size-4 shrink-0" />
        <span className="min-w-0 truncate font-semibold">{name}</span>
        <span className="hidden shrink-0 text-xs text-fg-subtle sm:inline">{host}</span>
        <div className="ml-auto flex shrink-0 items-center">
          <button
            type="button"
            aria-label="Обновить"
            title="Обновить"
            onClick={() => setReload((n) => n + 1)}
            className={BUTTON_ICON}
          >
            <RotateCw aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Открыть во вкладке"
            title="Открыть во вкладке"
            onClick={openInTab}
            className={BUTTON_ICON}
          >
            <ExternalLink aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Закрыть панель"
            title="Закрыть панель — ссылка останется в группе"
            onClick={onClose}
            className={BUTTON_ICON}
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      </div>

      {!site ? (
        <Notice text="Файлы и служебные страницы открываются только во вкладке.">
          <button type="button" onClick={openInTab} className={BUTTON_PRIMARY}>
            Открыть во вкладке
          </button>
        </Notice>
      ) : framesReady && !hasAccess ? (
        <Notice
          text={`Нет доступа к сайту ${host}. Без него многие сайты не показываются в рамке.`}
        >
          <button type="button" onClick={allowAccess} className={BUTTON_PRIMARY}>
            Разрешить доступ
          </button>
          <button type="button" onClick={openInTab} className={BUTTON_SECONDARY}>
            Открыть во вкладке
          </button>
        </Notice>
      ) : framesReady ? (
        <iframe
          key={reload}
          src={pane.url}
          title={name}
          allow="fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write"
          className={`min-h-0 w-full flex-1 bg-bg ${dragging ? 'pointer-events-none' : ''}`}
        />
      ) : null}
    </section>
  );
}

function Notice({ text, children }: { text: string; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center text-sm text-fg-muted">
      <p className="max-w-80">{text}</p>
      <div className="flex flex-wrap justify-center gap-2">{children}</div>
    </div>
  );
}
