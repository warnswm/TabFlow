import { Columns2, Ellipsis, Pencil, Search, Trash, X } from 'lucide-react';
import { Dialog, DropdownMenu } from 'radix-ui';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { displayHost, type Overview } from '@/lib/app/overview';
import type { Route } from '@/lib/app/route';
import type { SearchIndex } from '@/lib/app/search';
import {
  defaultLayoutName,
  pickedLinks,
  pickerGroups,
  togglePick,
  toLayoutLinks,
} from '@/lib/app/tile-picker';
import { faviconUrl, requestSiteAccess } from '@/lib/browser-api';
import { count, plural } from '@/lib/command-messages';
import { type Id, repositories, type TileLayout } from '@/lib/db';
import { sitePattern } from '@/lib/queue/site-access';
import { MAX_TILES, MIN_TILES, tileRects } from '@/lib/tiling/layout';
import { useLiveQuery } from '@/lib/use-live-query';
import { runCommand } from '../commands';
import { navigate } from '../hooks';
import { useUi } from '../store';
import {
  BUTTON_ICON,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  DIALOG_CONTENT,
  DIALOG_OVERLAY,
  GROUP_DOT,
  INPUT,
  MENU_CONTENT,
  MENU_ITEM,
  UNTITLED,
} from '../ui';

/**
 * «Рядом»: 2–4 links of any groups, shown side by side on the main page (`SideBySideView`).
 * Saved layouts open in one click; they are database records the page writes itself.
 */

const loadLayouts = () => repositories.layouts.list();

const LINKS = ['ссылка', 'ссылки', 'ссылок'] as const;
const PANES = ['панель', 'панели', 'панелей'] as const;

/**
 * Opens the viewer. Called right in the click: Chrome asks for access to the sites only there
 * (sites already allowed are not asked again). `prepare` runs after that (saving a layout).
 */
function showSideBySide(route: Route, urls: readonly string[], prepare?: () => Promise<boolean>) {
  const patterns = [...new Set(urls.map(sitePattern).filter((p) => p !== undefined))];
  const access = requestSiteAccess(patterns);
  void (async () => {
    await access;
    if (prepare && !(await prepare())) return;
    useUi.getState().setViewerReturn(window.location.hash);
    navigate(route);
  })();
}

/** Open tabs of the shown links are unloaded: they stay on the tab strip. */
function sleepShownLinks(tabIds: readonly Id[]) {
  if (tabIds.length > 0) void runCommand({ type: 'sleepLinks', tabIds: [...tabIds] });
}

/** Which pane gets which number: 2 — columns, 3 — one left and two right, 4 — 2×2. */
const LAYOUT_HINT: Record<number, string> = {
  2: 'Две колонки.',
  3: 'Первая — слева, две — справа друг над другом.',
  4: 'Сетка 2×2, по строкам.',
};

interface TileDialogProps {
  overview: Overview;
  index: SearchIndex;
}

export function TileDialog({ overview, index }: TileDialogProps) {
  const target = useUi((state) => state.tileDialog);
  const close = useUi((state) => state.closeTileDialog);

  return (
    <Dialog.Root open={target !== undefined} onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className={DIALOG_OVERLAY} />
        <Dialog.Content className={`${DIALOG_CONTENT} w-[min(680px,calc(100vw-32px))]`}>
          <div className="flex items-center gap-2">
            <Columns2 aria-hidden className="size-4 text-accent" />
            <Dialog.Title className="text-md font-semibold">Рядом</Dialog.Title>
            <Dialog.Close aria-label="Закрыть" className={`ml-auto ${BUTTON_ICON}`}>
              <X aria-hidden className="size-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="-mt-2 text-sm text-fg-muted">
            От 2 до 4 ссылок — сайты открываются рядом прямо на главной. Ссылки остаются в своих
            группах, их открытые вкладки засыпают и остаются на местах.
          </Dialog.Description>
          {target && (
            <TilePicker
              overview={overview}
              index={index}
              startGroupId={target.groupId}
              onDone={close}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface TilePickerProps extends TileDialogProps {
  startGroupId?: Id;
  onDone: () => void;
}

function TilePicker({ overview, index, startGroupId, onDone }: TilePickerProps) {
  const layouts = useLiveQuery(loadLayouts) ?? [];
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Id[]>([]);
  const [save, setSave] = useState(false);
  const [name, setName] = useState<string>();
  const groups = pickerGroups(overview, index, query);
  const links = pickedLinks(overview, picked);
  const full = picked.length >= MAX_TILES;

  // From the menu of a tile: the list starts at that group.
  const startRef = useRef<HTMLDivElement>(null);
  useEffect(() => startRef.current?.scrollIntoView({ block: 'start' }), []);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (links.length < MIN_TILES) return;
    const tabIds = links.map((link) => link.id);
    showSideBySide(
      { view: 'side', tabIds },
      links.map((link) => link.url),
      async () => {
        if (save) {
          try {
            await repositories.layouts.create(
              name?.trim() || defaultLayoutName(links),
              toLayoutLinks(links),
            );
          } catch {
            useUi.getState().showToast('Раскладка не сохранена. Ссылки остались в своих группах.');
            return false;
          }
        }
        onDone();
        sleepShownLinks(tabIds);
        return true;
      },
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-col gap-4">
      {layouts.length > 0 && query === '' && (
        <section aria-label="Сохранённые раскладки" className="flex flex-col gap-1">
          <h2 className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">
            Раскладки
          </h2>
          <ul className="flex flex-col">
            {layouts.map((layout) => (
              <LayoutRow key={layout.id} layout={layout} onOpen={onDone} />
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Ссылки" className="flex min-h-0 flex-col gap-2">
        <label className="relative block">
          <span className="sr-only">Найти ссылку</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти ссылку или группу"
            className={`${INPUT} pl-9`}
          />
        </label>
        <div className="max-h-[42vh] min-h-24 overflow-y-auto pr-1">
          {groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-fg-muted">
              {query
                ? 'Ничего не найдено.'
                : 'Ссылок пока нет — сначала сохраните вкладки в группы.'}
            </p>
          ) : (
            groups.map(({ group, space, tabs }) => (
              <div
                key={group.id}
                ref={group.id === startGroupId ? startRef : undefined}
                className="flex flex-col pb-2"
              >
                <div className="flex items-center gap-2 px-1 py-1.5 text-sm">
                  <span
                    aria-hidden
                    className={`size-2 shrink-0 rounded-full ${GROUP_DOT[group.color]}`}
                  />
                  <span className="truncate font-semibold">{group.title || UNTITLED}</span>
                  <span className="truncate text-fg-subtle">· {space.name}</span>
                </div>
                {tabs.map((tab) => {
                  const at = picked.indexOf(tab.id);
                  const on = at >= 0;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      disabled={!on && full}
                      onClick={() => setPicked((current) => togglePick(current, tab.id))}
                      className={`flex h-9 items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors duration-(--duration-fast) disabled:opacity-50 ${
                        on ? 'bg-accent-soft text-fg' : 'hover:bg-surface-raised'
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`flex size-5 shrink-0 items-center justify-center rounded-sm border font-mono text-xs ${
                          on
                            ? 'border-accent bg-accent font-semibold text-on-accent'
                            : 'border-border-control'
                        }`}
                      >
                        {on ? at + 1 : ''}
                      </span>
                      <img alt="" src={faviconUrl(tab.url, 16)} className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{tab.title || tab.url}</span>
                      <span className="shrink-0 text-xs text-fg-subtle">
                        {displayHost(tab.url)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <LayoutScheme count={Math.max(picked.length, MIN_TILES)} active={picked.length} />
        <p className="min-w-40 flex-1 text-sm text-fg-muted" aria-live="polite">
          {picked.length < MIN_TILES
            ? `Выбрано: ${picked.length} из ${MAX_TILES}. Нужно хотя бы две ссылки.`
            : `${count(picked.length, PANES)}. ${LAYOUT_HINT[picked.length] ?? ''}`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={save}
            onChange={(event) => setSave(event.target.checked)}
            className="size-4 accent-(--color-accent)"
          />
          Сохранить раскладку
        </label>
        {save && (
          <input
            aria-label="Название раскладки"
            value={name ?? defaultLayoutName(links)}
            onChange={(event) => setName(event.target.value)}
            placeholder="Название"
            maxLength={80}
            className={`${INPUT} min-w-40 flex-1`}
          />
        )}
        <div className="ml-auto flex gap-2">
          <Dialog.Close type="button" className={BUTTON_SECONDARY}>
            Отмена
          </Dialog.Close>
          <button type="submit" disabled={links.length < MIN_TILES} className={BUTTON_PRIMARY}>
            <Columns2 aria-hidden className="size-4" />
            Открыть рядом
          </button>
        </div>
      </div>
    </form>
  );
}

/** A saved layout: opens in one click; renamed in place, deleted with undo. */
function LayoutRow({ layout, onOpen }: { layout: TileLayout; onOpen: () => void }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(layout.name);
  const linkCount = layout.links.length;

  function rename(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation(); // not the form of the dialog
    setRenaming(false);
    const trimmed = name.trim();
    if (trimmed === '' || trimmed === layout.name) return;
    repositories.layouts
      .rename(layout.id, trimmed)
      .catch(() =>
        useUi.getState().showToast('Название не сохранено — раскладка осталась прежней.'),
      );
  }

  async function remove() {
    const { showToast } = useUi.getState();
    try {
      const removed = await repositories.layouts.remove(layout.id);
      showToast(`Раскладка «${layout.name}» удалена. Ссылки остались в своих группах.`, () => {
        void repositories.layouts.restore(removed).then(() => showToast('Отменено.'));
      });
    } catch {
      showToast('Раскладка не удалена.');
    }
  }

  if (renaming) {
    return (
      <li>
        <form onSubmit={rename} className="flex items-center gap-2 py-1">
          <input
            aria-label="Название раскладки"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={rename}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                setName(layout.name);
                setRenaming(false);
              }
            }}
            maxLength={80}
            className={INPUT}
          />
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => {
          showSideBySide(
            { view: 'layout', layoutId: layout.id },
            layout.links.map((link) => link.url),
            async () => {
              onOpen();
              sleepShownLinks(layout.links.map((link) => link.tabId));
              return true;
            },
          );
        }}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-(--duration-fast) hover:bg-surface-raised"
      >
        <LayoutScheme count={linkCount} active={linkCount} />
        <span className="min-w-0 flex-1 truncate font-semibold">{layout.name || UNTITLED}</span>
        <span className="shrink-0 font-mono text-xs text-fg-subtle">
          {linkCount} {plural(linkCount, LINKS)}
        </span>
      </button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label={`Действия с раскладкой «${layout.name}»`}
          className={BUTTON_ICON}
        >
          <Ellipsis aria-hidden className="size-4" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={4} className={MENU_CONTENT}>
            <DropdownMenu.Item className={MENU_ITEM} onSelect={() => setRenaming(true)}>
              <Pencil aria-hidden /> Переименовать
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={`${MENU_ITEM} text-danger data-highlighted:text-danger`}
              onSelect={() => void remove()}
            >
              <Trash aria-hidden /> Удалить
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </li>
  );
}

const SCHEME = { left: 0, top: 0, width: 48, height: 28 };

/** A small picture of the windows: numbered cells, the first `active` ones filled. */
function LayoutScheme({ count: cells, active }: { count: number; active: number }) {
  return (
    <span aria-hidden className="relative block h-7 w-12 shrink-0">
      {tileRects(cells, SCHEME).map((rect, i) => (
        <span
          key={i}
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width - 2,
            height: rect.height - 2,
          }}
          className={`absolute flex items-center justify-center rounded-xs border font-mono text-[9px] leading-none ${
            i < active
              ? 'border-accent bg-accent-soft text-accent'
              : 'border-border-control text-fg-subtle'
          }`}
        >
          {i + 1}
        </span>
      ))}
    </span>
  );
}
