import { ArrowLeft, Columns2, ExternalLink, RotateCw, X } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { displayHost, type Overview } from '@/lib/app/overview';
import { layoutPanes, linkPanes, type ViewerPane } from '@/lib/app/tile-picker';
import {
  allowFramesInThisTab,
  faviconUrl,
  grantedSitePatterns,
  openPageInNewTab,
  requestSiteAccess,
} from '@/lib/browser-api';
import { repositories, type TileLayout } from '@/lib/db';
import { patternCovers, sitePattern } from '@/lib/queue/site-access';
import { paneRects } from '@/lib/tiling/layout';
import { useLiveQuery } from '@/lib/use-live-query';
import { runCommand } from '../commands';
import { useUi } from '../store';
import { BUTTON_ICON, BUTTON_PRIMARY, BUTTON_SECONDARY, UNTITLED } from '../ui';

/**
 * «Рядом»: the main page turns into a viewer of 2–4 sites side by side, each in a frame of its
 * own (`tiling/layout.ts`). Frames are not tabs: a site loads anew, and the tabs and groups of
 * Chrome stay as they are. Sites that refuse to show in a frame open in a tab instead.
 */

export type ViewerRoute = { view: 'side'; tabIds: string[] } | { view: 'layout'; layoutId: string };

const SITE = /^https?:\/\//;

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

export function SideBySideView({ route, overview }: { route: ViewerRoute; overview: Overview }) {
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

  const readGranted = () => void grantedSitePatterns().then(setGranted);
  useEffect(() => readGranted(), []);

  const panes =
    route.view === 'side'
      ? linkPanes(overview, route.tabIds)
      : layout
        ? layoutPanes(overview, layout.links)
        : [];
  const shown = panes.filter((pane) => !closed.has(pane.key));
  const rects = paneRects(shown.length);
  const title = route.view === 'layout' ? layout?.name || UNTITLED : 'Рядом';
  const loading = route.view === 'layout' && layout === undefined;

  function back() {
    window.location.hash = useUi.getState().viewerReturn ?? '#/';
  }

  return (
    <div className="flex h-screen flex-col bg-bg">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-3">
        <button type="button" onClick={back} className={BUTTON_SECONDARY}>
          <ArrowLeft aria-hidden className="size-4" />К группам
        </button>
        <Columns2 aria-hidden className="size-4 shrink-0 text-accent" />
        <h1 className="min-w-0 truncate text-md font-semibold">{title}</h1>
        <p className="ml-auto hidden truncate text-xs text-fg-subtle lg:block">
          Сайт не показывается в рамке — «Открыть во вкладке». Вкладки и группы остались на местах.
        </p>
      </header>

      <main className="relative min-h-0 flex-1">
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
          shown.map((pane, i) => {
            const rect = rects[i];
            if (!rect) return null;
            return (
              <div
                key={pane.key}
                className="absolute p-1"
                style={{
                  left: `${rect.left}%`,
                  top: `${rect.top}%`,
                  width: `${rect.width}%`,
                  height: `${rect.height}%`,
                }}
              >
                <Pane
                  pane={pane}
                  framesReady={framesReady && granted !== undefined}
                  hasAccess={granted?.some((pattern) => patternCovers(pattern, pane.url)) ?? false}
                  onAccess={readGranted}
                  onClose={() => setClosed((keys) => new Set(keys).add(pane.key))}
                />
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}

interface PaneProps {
  pane: ViewerPane;
  framesReady: boolean;
  hasAccess: boolean;
  onAccess: () => void;
  onClose: () => void;
}

/** One site: a bar with its name and actions, and the frame. */
function Pane({ pane, framesReady, hasAccess, onAccess, onClose }: PaneProps) {
  const [reload, setReload] = useState(0);
  const site = SITE.test(pane.url);
  const host = displayHost(pane.url);
  const name = pane.title || pane.url;

  function openInTab() {
    if (pane.link) void runCommand({ type: 'openTab', tabId: pane.link.id }, { quiet: true });
    else void openPageInNewTab(pane.url);
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
      className="flex h-full flex-col overflow-hidden rounded-md border border-border bg-surface"
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2 text-sm">
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
          allowFullScreen
          className="min-h-0 w-full flex-1 bg-bg"
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
