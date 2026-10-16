import type { ReactNode } from 'react';
import { Archive, Moon, Play } from 'lucide-react';
import type { GroupView } from '@/lib/app/overview';
import { displayHost } from '@/lib/app/overview';
import { timeAgo } from '@/lib/app/time-format';
import { youtubeThumbnailUrl, youtubeVideoId } from '@/lib/app/youtube';
import { faviconUrl } from '@/lib/browser-api';
import { count, TABS } from '@/lib/command-messages';
import type { GroupState, SavedTab, Space, TabGroup } from '@/lib/db';
import { runCommand } from '../commands';
import { useUi } from '../store';
import { BUTTON_LINK, GROUP_DOT, UNTITLED } from '../ui';
import { GroupMenu } from './GroupMenu';

/** Stowed tiles: no fill and a dashed control-colored border, not just another color. */
const TILE: Record<GroupState, string> = {
  active: 'border-solid border-border bg-surface',
  asleep: 'border-solid border-border bg-surface',
  stowed: 'border-dashed border-border-control bg-transparent',
};

function statusText(group: TabGroup, now: number): string {
  const since = timeAgo(group.stateChangedAt ?? group.updatedAt, now);
  switch (group.state) {
    case 'active':
      return 'Активна';
    case 'asleep':
      return `Уснула ${since}`;
    case 'stowed':
      return `Убрана ${since}`;
  }
}

interface GroupTileProps {
  view: GroupView;
  spaces: readonly Space[];
  now: number;
  onOpenLinks: () => void;
  onEdit: () => void;
}

export function GroupTile({ view, spaces, now, onOpenLinks, onEdit }: GroupTileProps) {
  const { group, tabs } = view;
  const restoreMode = useUi((state) => state.restoreMode);
  const title = group.title || UNTITLED;
  const restore = () =>
    runCommand(
      { type: 'restoreGroup', groupId: group.id, mode: restoreMode },
      // Waking only switches to the group in Chrome: nothing to report.
      { name: group.title, quiet: group.state !== 'stowed' },
    );

  return (
    <article
      aria-label={`${title}, ${statusText(group, now).toLowerCase()}`}
      className={`flex flex-col overflow-hidden rounded-lg border ${TILE[group.state]}`}
    >
      <button
        type="button"
        onClick={onOpenLinks}
        aria-label={`Ссылки группы «${title}»`}
        className="relative aspect-video bg-bg-sunken text-left"
      >
        <Preview tabs={tabs} dimmed={group.state !== 'active'} />
        <span className="absolute right-2 bottom-2 rounded-sm bg-bg-sunken/85 px-1.5 font-mono text-[11px] leading-4 text-fg">
          {count(tabs.length, TABS)}
        </span>
        {group.state === 'asleep' && (
          <StateBadge icon={<Moon aria-hidden className="size-3.5" />} text="Спит" />
        )}
        {group.state === 'stowed' && (
          <StateBadge icon={<Archive aria-hidden className="size-3.5" />} text="Убрана в TabFlow" />
        )}
      </button>

      <div className="flex flex-col gap-1 px-3.5 pt-3 pb-3.5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={`size-2.5 shrink-0 rounded-full ${GROUP_DOT[group.color]}`}
          />
          <h3 className="min-w-0 truncate text-[15px] leading-[22px] font-semibold">{title}</h3>
          <div className="ml-auto">
            <GroupMenu
              group={group}
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
              Разбудить
            </button>
          )}
          {group.state === 'stowed' && (
            <button type="button" onClick={restore} className={`ml-auto ${BUTTON_LINK}`}>
              Вернуть
            </button>
          )}
        </div>
      </div>
    </article>
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
