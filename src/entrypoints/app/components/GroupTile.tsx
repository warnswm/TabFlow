import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Archive, ArrowRight, GripVertical, Lock, Moon, Play, Star } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import type { GroupView } from '@/lib/app/overview';
import { displayHost } from '@/lib/app/overview';
import type { GroupMatch } from '@/lib/app/search';
import { timeAgo } from '@/lib/app/time-format';
import { youtubeThumbnailUrl, youtubeVideoId } from '@/lib/app/youtube';
import { faviconUrl } from '@/lib/browser-api';
import { localized } from '@/lib/i18n';
import { pluralEn, pluralRu, words } from '@/lib/i18n/words';
import type { GroupState, SavedTab, Space, TabGroup } from '@/lib/db';
import { runCommand } from '../commands';
import type { DragData } from '../dnd';
import { useUi } from '../store';
import { BUTTON_ICON, BUTTON_LINK, GROUP_DOT, untitled } from '../ui';
import { GroupMenu } from './GroupMenu';
import { Highlighted } from './Highlighted';

/** Stowed tiles: no fill and a dashed control-colored border, not just another color. */
const TILE: Record<GroupState, string> = {
  active: 'border-solid border-border bg-surface',
  asleep: 'border-solid border-border bg-surface',
  stowed: 'border-dashed border-border-control bg-transparent',
};

/** How long a tile chosen in the palette stays outlined. */
const FOCUS_MS = 2000;

const text = localized({
  ru: {
    active: 'Активна',
    asleepSince: (since: string) => `Уснула ${since}`,
    autoSleptSince: (since: string) => `Уснула сама ${since}`,
    stowedSince: (since: string) => `Убрана ${since}`,
    tile: 'плитка',
    links: (title: string) => `Ссылки группы ${title}`,
    move: (title: string) => `Переместить ${title}`,
    wake: 'Разбудить',
    restore: 'Вернуть',
    linkHits: (n: number) =>
      `${n} ${pluralRu(n, ['ссылка совпадает', 'ссылки совпадают', 'ссылок совпадают'])}`,
    asleep: 'Спит',
    stowed: 'Убрана в TabFlow',
    favorite: 'В избранном',
    locked: 'Защищена от удаления',
  },
  en: {
    active: 'Active',
    asleepSince: (since: string) => `Asleep ${since}`,
    autoSleptSince: (since: string) => `Fell asleep ${since}`,
    stowedSince: (since: string) => `Stowed ${since}`,
    tile: 'tile',
    links: (title: string) => `Links of group ${title}`,
    move: (title: string) => `Move ${title}`,
    wake: 'Wake',
    restore: 'Restore',
    linkHits: (n: number) => `${n} ${pluralEn(n, ['link matches', 'links match'])}`,
    asleep: 'Asleep',
    stowed: 'Stowed in TabFlow',
    favorite: 'Favorite',
    locked: 'Protected from deletion',
  },
});

function statusText(group: TabGroup, now: number): string {
  const t = text();
  const since = timeAgo(group.stateChangedAt ?? group.updatedAt, now);
  switch (group.state) {
    case 'active':
      return t.active;
    case 'asleep':
      // Autosleep: the group fell asleep by itself, not by the user.
      return group.autoSlept ? t.autoSleptSince(since) : t.asleepSince(since);
    case 'stowed':
      return t.stowedSince(since);
  }
}

interface GroupTileProps {
  view: GroupView;
  spaces: readonly Space[];
  now: number;
  /** How the group matched the search, when something is searched. */
  match?: GroupMatch;
  terms: readonly string[];
  /** Drag & drop is on (off while the tiles are filtered). */
  sortable: boolean;
  onOpenLinks: () => void;
  onEdit: () => void;
}

export function GroupTile(props: GroupTileProps) {
  const { view, spaces, now, match, terms, sortable, onOpenLinks, onEdit } = props;
  const { group, tabs } = view;
  const restoreMode = useUi((state) => state.restoreMode);
  const focused = useUi((state) => state.focusGroupId === group.id);
  const previewRef = useRef<HTMLButtonElement>(null);
  const title = group.title || untitled();
  const data: DragData = { type: 'group', group };
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: group.id,
    data,
    disabled: !sortable,
    attributes: { roleDescription: text().tile },
  });

  // Chosen in the palette: scrolled into view, focused and outlined for a moment.
  useEffect(() => {
    if (!focused) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    previewRef.current?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    previewRef.current?.focus({ preventScroll: true });
    const timer = window.setTimeout(() => useUi.getState().focusGroup(undefined), FOCUS_MS);
    return () => window.clearTimeout(timer);
  }, [focused]);

  const restore = () =>
    runCommand(
      { type: 'restoreGroup', groupId: group.id, mode: restoreMode },
      // Waking only switches to the group in Chrome: nothing to report.
      { name: group.title, quiet: group.state !== 'stowed' },
    );
  const linkHits = match?.tabIds.size ?? 0;
  const marks = [
    group.favorite && text().favorite.toLowerCase(),
    group.locked && text().locked.toLowerCase(),
  ].filter(Boolean);

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...listeners}
      aria-label={[title, statusText(group, now).toLowerCase(), ...marks].join(', ')}
      className={`group/tile flex flex-col overflow-hidden rounded-lg border ${TILE[group.state]} ${isDragging ? 'opacity-50 outline-2 outline-offset-2 outline-accent outline-dashed' : ''} ${focused ? 'ring-2 ring-focus ring-offset-2 ring-offset-bg' : ''}`}
    >
      <button
        ref={previewRef}
        type="button"
        onClick={onOpenLinks}
        aria-label={text().links(words().quote(title))}
        className="relative aspect-video bg-bg-sunken text-left"
      >
        <TilePreview group={group} tabs={tabs} />
      </button>

      <div className="flex flex-col gap-1 px-3.5 pt-3 pb-3.5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={`size-2.5 shrink-0 rounded-full ${GROUP_DOT[group.color]}`}
          />
          <h3 className="min-w-0 truncate text-[15px] leading-[22px] font-semibold">
            <Highlighted text={title} terms={match?.title ? terms : []} />
          </h3>
          {group.favorite && (
            <Star aria-hidden className="size-3.5 shrink-0 fill-current text-fg-muted" />
          )}
          {group.locked && <Lock aria-hidden className="size-3.5 shrink-0 text-fg-muted" />}
          <div className="ml-auto flex items-center">
            {sortable && (
              <button
                ref={setActivatorNodeRef}
                type="button"
                {...attributes}
                aria-label={text().move(words().quote(title))}
                className={`${BUTTON_ICON} cursor-grab opacity-0 group-hover/tile:opacity-100 focus-visible:opacity-100`}
              >
                <GripVertical aria-hidden className="size-4" />
              </button>
            )}
            <GroupMenu
              group={group}
              tabs={tabs}
              spaces={spaces}
              onOpenLinks={onOpenLinks}
              onEdit={onEdit}
              onRestore={restore}
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5 pl-[18px] text-sm text-fg-muted">
          {group.state === 'active' && (
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-accent" />
          )}
          <span className="truncate">{statusText(group, now)}</span>
          {group.state === 'asleep' && (
            <button type="button" onClick={restore} className={`ml-auto ${BUTTON_LINK}`}>
              {text().wake}
            </button>
          )}
          {group.state === 'stowed' && (
            <button type="button" onClick={restore} className={`ml-auto ${BUTTON_LINK}`}>
              {text().restore}
            </button>
          )}
        </div>
        {group.note && (
          <p title={group.note} className="truncate pl-[18px] text-xs text-fg-subtle">
            <Highlighted text={group.note} terms={match ? terms : []} />
          </p>
        )}
        {linkHits > 0 && (
          <p className="pl-[18px] text-xs text-fg-subtle">{text().linkHits(linkHits)}</p>
        )}
      </div>
    </article>
  );
}

/**
 * What follows the pointer while a tile is dragged: a small chip, so the place in the grid and
 * the spaces in the sidebar stay visible. Over another space it says where the group goes.
 */
export function GroupDragChip({ view, target }: { view: GroupView; target?: Space }) {
  const { group, tabs } = view;
  return (
    <div
      className={`flex h-11 w-[260px] cursor-grabbing items-center gap-2.5 rounded-md border bg-surface-raised px-3 shadow-drag ${target ? 'border-accent' : 'border-border'}`}
    >
      <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${GROUP_DOT[group.color]}`} />
      <span className="min-w-0 flex-1 truncate font-semibold">{group.title || untitled()}</span>
      {target ? (
        <span className="flex max-w-[45%] shrink-0 items-center gap-1 text-sm font-semibold text-accent">
          <ArrowRight aria-hidden className="size-4 shrink-0" />
          <span className="truncate">{target.name}</span>
        </span>
      ) : (
        <span className="shrink-0 font-mono text-xs text-fg-muted">{tabs.length}</span>
      )}
    </div>
  );
}

function TilePreview({ group, tabs }: { group: TabGroup; tabs: readonly SavedTab[] }) {
  return (
    <>
      <Preview tabs={tabs} dimmed={group.state !== 'active'} />
      <span className="absolute right-2 bottom-2 rounded-sm bg-bg-sunken/85 px-1.5 font-mono text-[11px] leading-4 text-fg">
        {words().tabs(tabs.length)}
      </span>
      {group.state === 'asleep' && (
        <StateBadge icon={<Moon aria-hidden className="size-3.5" />} text={text().asleep} />
      )}
      {group.state === 'stowed' && (
        <StateBadge icon={<Archive aria-hidden className="size-3.5" />} text={text().stowed} />
      )}
    </>
  );
}

function StateBadge({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <span className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-bg-sunken/85 py-0.5 pr-2.5 pl-2 text-xs text-fg">
      {icon}
      {text}
    </span>
  );
}

/** 2×2 mosaic of the first links: a YouTube thumbnail or the site icon with its host. */
function Preview({ tabs, dimmed }: { tabs: readonly SavedTab[]; dimmed: boolean }) {
  const cells = [0, 1, 2, 3].map((i) => tabs[i]);
  return (
    <div
      aria-hidden
      className={`absolute inset-0 grid grid-cols-2 grid-rows-2 gap-0.5 transition-opacity duration-(--duration-slow) ${dimmed ? 'opacity-50' : ''}`}
    >
      {cells.map((tab, i) => (tab ? <PreviewCell key={tab.id} tab={tab} /> : <div key={i} />))}
    </div>
  );
}

function PreviewCell({ tab }: { tab: SavedTab }) {
  const videoId = youtubeVideoId(tab.url);
  if (videoId) {
    return (
      <div className="relative flex min-w-0 items-center justify-center overflow-hidden bg-surface-raised">
        <img
          src={youtubeThumbnailUrl(videoId)}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover"
        />
        <Play className="relative size-6 fill-fg/85 text-transparent drop-shadow" />
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col items-center justify-center gap-1.5 bg-surface px-2">
      <span className="flex size-[30px] items-center justify-center rounded-md bg-surface-raised">
        <img src={faviconUrl(tab.url)} alt="" className="size-5" />
      </span>
      <span className="max-w-full truncate text-[11px] leading-[14px] text-fg-muted">
        {displayHost(tab.url)}
      </span>
    </div>
  );
}
