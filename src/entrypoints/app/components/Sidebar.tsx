import { Folder, Inbox, Plus, Settings, Trash } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useState } from 'react';
import type { Overview } from '@/lib/app/overview';
import type { Route } from '@/lib/app/route';
import { routeHash } from '@/lib/app/route';
import { count, GROUPS, plural, TABS } from '@/lib/command-messages';
import type { Id } from '@/lib/db';
import type { RestoreMode } from '@/lib/messages';
import { useUi } from '../store';
import { MENU_CONTENT, MENU_ITEM } from '../ui';
import { SpaceNameDialog } from './SpaceDialogs';

const NAV_ITEM =
  'flex h-9 items-center gap-2.5 rounded-md px-2 text-fg transition-colors duration-(--duration-fast) hover:bg-surface-raised [&_svg]:size-4 [&_svg]:shrink-0';
const NAV_ITEM_CURRENT =
  'flex h-9 items-center gap-2.5 rounded-md bg-accent-soft px-2 font-semibold text-accent [&_svg]:size-4 [&_svg]:shrink-0';

const RESTORE_MODE_LABEL: Record<RestoreMode, string> = {
  placeholder: 'Заглушки TabFlow — сайты не грузятся',
  background: 'Сайты, выгрузка в фоне',
};

interface SidebarProps {
  overview: Overview;
  route: Route;
  /** The space shown now (the route may have none: «Входящие»). */
  currentSpaceId?: Id;
}

export function Sidebar({ overview, route, currentSpaceId }: SidebarProps) {
  const [creating, setCreating] = useState(false);
  const { groupsByState, tabsOutOfMemory, tabCount } = overview;
  const share = tabCount === 0 ? 0 : Math.round((tabsOutOfMemory / tabCount) * 100);

  return (
    <nav
      aria-label="Разделы"
      className="flex w-60 shrink-0 flex-col gap-6 border-r border-border bg-bg-sunken px-3 py-5"
    >
      <div className="flex items-center gap-2.5 px-2">
        <span className="flex size-[30px] items-center justify-center rounded-md bg-accent text-on-accent">
          <svg
            aria-hidden
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="4" width="7" height="7" rx="1.5" />
            <rect x="14" y="4" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <path d="M14 17.5h7" />
          </svg>
        </span>
        <span className="text-[17px] font-bold tracking-[-0.01em]">TabFlow</span>
      </div>

      <div className="flex flex-col gap-0.5">
        <h2 className="px-2 pb-1.5 text-[11px] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
          Пространства
        </h2>
        {overview.spaces.map(({ space, tabCount: spaceTabs }) => {
          const current = route.view === 'space' && space.id === currentSpaceId;
          return (
            <a
              key={space.id}
              href={routeHash({ view: 'space', spaceId: space.id })}
              aria-current={current ? 'page' : undefined}
              className={current ? NAV_ITEM_CURRENT : NAV_ITEM}
            >
              {space.isDefault ? (
                <Inbox aria-hidden className={current ? '' : 'text-fg-muted'} />
              ) : (
                <Folder aria-hidden className={current ? '' : 'text-fg-muted'} />
              )}
              <span className="min-w-0 truncate">{space.name}</span>
              <span
                className={`ml-auto font-mono text-xs ${current ? '' : 'text-fg-muted'}`}
                aria-label={count(spaceTabs, TABS)}
              >
                {spaceTabs}
              </span>
            </a>
          );
        })}
        <button
          type="button"
          onClick={() => setCreating(true)}
          className={`${NAV_ITEM} text-fg-muted`}
        >
          <Plus aria-hidden />
          Новое пространство
        </button>
      </div>

      <div className="flex flex-col gap-0.5">
        <a
          href={routeHash({ view: 'trash' })}
          aria-current={route.view === 'trash' ? 'page' : undefined}
          className={route.view === 'trash' ? NAV_ITEM_CURRENT : NAV_ITEM}
        >
          <Trash aria-hidden className={route.view === 'trash' ? '' : 'text-fg-muted'} />
          Корзина
        </a>
      </div>

      <div className="mt-auto flex flex-col gap-3">
        <section
          aria-label="Не в памяти"
          className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-3.5"
        >
          <span className="text-xs text-fg-muted">Не в памяти</span>
          <span className="font-mono text-[22px] leading-7">
            {tabsOutOfMemory}
            <span className="ml-1.5 font-sans text-sm text-fg-muted">
              {plural(tabsOutOfMemory, TABS)}
            </span>
          </span>
          <div
            role="meter"
            aria-label="Доля вкладок не в памяти"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={share}
            className="h-1 overflow-hidden rounded-full bg-border"
          >
            <div className="h-1 bg-accent" style={{ width: `${share}%` }} />
          </div>
          <span className="text-xs text-fg-subtle">
            {count(groupsByState.asleep, GROUPS)}{' '}
            {plural(groupsByState.asleep, ['спит', 'спят', 'спят'])} · {groupsByState.stowed}{' '}
            {plural(groupsByState.stowed, ['убрана', 'убраны', 'убраны'])}
          </span>
        </section>
        <SettingsMenu />
      </div>

      <SpaceNameDialog open={creating} onOpenChange={setCreating} />
    </nav>
  );
}

/** Until the settings page (stage 7): how stowed groups come back. */
function SettingsMenu() {
  const restoreMode = useUi((state) => state.restoreMode);
  const setRestoreMode = useUi((state) => state.setRestoreMode);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={`${NAV_ITEM} text-fg-muted`}>
        <Settings aria-hidden />
        Настройки
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side="top" align="start" sideOffset={4} className={MENU_CONTENT}>
          <DropdownMenu.Label className="px-2 py-1.5 text-xs text-fg-subtle">
            Как возвращать группу
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={restoreMode}
            onValueChange={(value) => setRestoreMode(value as RestoreMode)}
          >
            {(Object.keys(RESTORE_MODE_LABEL) as RestoreMode[]).map((mode) => (
              <DropdownMenu.RadioItem
                key={mode}
                value={mode}
                className={`${MENU_ITEM} pl-7 relative`}
              >
                <DropdownMenu.ItemIndicator className="absolute left-2 flex">
                  <span aria-hidden className="size-2 rounded-full bg-current" />
                </DropdownMenu.ItemIndicator>
                {RESTORE_MODE_LABEL[mode]}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
