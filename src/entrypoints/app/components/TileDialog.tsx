import { Columns2, Ellipsis, Pencil, Plus, Search, Trash, X } from 'lucide-react';
import { Dialog, DropdownMenu } from 'radix-ui';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { displayHost, type Overview } from '@/lib/app/overview';
import type { Route } from '@/lib/app/route';
import type { SearchIndex } from '@/lib/app/search';
import {
  defaultLayoutName,
  openPages,
  pageKey,
  type PickedItem,
  pickedItems,
  pickerGroups,
  togglePick,
  toLayoutLinks,
} from '@/lib/app/tile-picker';
import { type BrowserTab, faviconUrl, listOpenTabs, requestSiteAccess } from '@/lib/browser-api';
import { localized } from '@/lib/i18n';
import { pluralEn, pluralRu, words } from '@/lib/i18n/words';
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
  untitled,
} from '../ui';

/**
 * «Рядом»: 2–9 links of any groups or open tabs outside TabFlow, shown side by side on the main
 * page (`SideBySideView`).
 * Saved layouts open in one click; they are database records the page writes itself.
 */

const loadLayouts = () => repositories.layouts.list();

const panesRu = (n: number) => `${n} ${pluralRu(n, ['панель', 'панели', 'панелей'])}`;
const panesEn = (n: number) => `${n} ${pluralEn(n, ['pane', 'panes'])}`;

const text = localized({
  ru: {
    panes: panesRu,
    linkNoun: (n: number) => pluralRu(n, ['ссылка', 'ссылки', 'ссылок']),
    addTitle: 'Добавить рядом',
    close: 'Закрыть',
    addAbout: (room: number, max: number) =>
      `Можно добавить ещё ${words().links(room)} — всего не больше ${max}. Открытые рамки не перезагружаются.`,
    layoutHint: {
      2: 'Две колонки.',
      3: 'Первая — слева, две — справа друг над другом.',
      4: 'Сетка 2×2.',
      5: 'Три сверху, две снизу.',
      6: 'Сетка 3×2.',
      7: 'Четыре сверху, три снизу.',
      8: 'Сетка 4×2.',
      9: 'Сетка 3×3.',
    } as Record<number, string>,
    title: 'Рядом',
    about:
      'От 2 до 9 открытых вкладок или ссылок — сайты открываются рядом прямо на главной. Ссылки остаются в своих группах, вкладки засыпают и остаются на местах.',
    notSaved: 'Раскладка не сохранена. Ссылки остались в своих группах.',
    savedLayouts: 'Сохранённые раскладки',
    layouts: 'Раскладки',
    linksAndTabs: 'Ссылки и вкладки',
    find: 'Найти вкладку или ссылку',
    findPlaceholder: 'Найти вкладку, ссылку или группу',
    nothingFound: 'Ничего не найдено.',
    nothingYet: 'Открытых вкладок и сохранённых ссылок пока нет.',
    openTabs: 'Открытые вкладки · вне групп',
    addingNow: (before: number, picked: number, limit: number) =>
      `Сейчас ${panesRu(before)}, выбрано ещё ${picked} из ${limit}.`,
    pickMore: (picked: number, max: number) => `Выбрано: ${picked} из ${max}. Нужно хотя бы две.`,
    saveLayout: 'Сохранить раскладку',
    layoutName: 'Название раскладки',
    name: 'Название',
    cancel: 'Отмена',
    add: 'Добавить',
    open: 'Открыть рядом',
    renameFailed: 'Название не сохранено — раскладка осталась прежней.',
    deleted: (name: string) => `Раскладка ${name} удалена. Ссылки остались в своих группах.`,
    undone: 'Отменено.',
    notDeleted: 'Раскладка не удалена.',
    layoutActions: (name: string) => `Действия с раскладкой ${name}`,
    rename: 'Переименовать',
    delete: 'Удалить',
  },
  en: {
    panes: panesEn,
    linkNoun: (n: number) => pluralEn(n, ['link', 'links']),
    addTitle: 'Add side by side',
    close: 'Close',
    addAbout: (room: number, max: number) =>
      `${words().links(room)} more can be added — ${max} at most. Open frames do not reload.`,
    layoutHint: {
      2: 'Two columns.',
      3: 'The first on the left, two on the right, one above the other.',
      4: 'A 2×2 grid.',
      5: 'Three on top, two below.',
      6: 'A 3×2 grid.',
      7: 'Four on top, three below.',
      8: 'A 4×2 grid.',
      9: 'A 3×3 grid.',
    },
    title: 'Side by side',
    about:
      '2 to 9 open tabs or links — the sites open side by side right on the main page. Links stay in their groups, tabs fall asleep and stay in place.',
    notSaved: 'The layout was not saved. Links stay in their groups.',
    savedLayouts: 'Saved layouts',
    layouts: 'Layouts',
    linksAndTabs: 'Links and tabs',
    find: 'Find a tab or link',
    findPlaceholder: 'Find a tab, link or group',
    nothingFound: 'Nothing found.',
    nothingYet: 'No open tabs or saved links yet.',
    openTabs: 'Open tabs · outside groups',
    addingNow: (before: number, picked: number, limit: number) =>
      `Now ${panesEn(before)}, ${picked} more picked of ${limit}.`,
    pickMore: (picked: number, max: number) =>
      `Picked: ${picked} of ${max}. At least two are needed.`,
    saveLayout: 'Save layout',
    layoutName: 'Layout name',
    name: 'Name',
    cancel: 'Cancel',
    add: 'Add',
    open: 'Open side by side',
    renameFailed: 'The name was not saved — the layout is unchanged.',
    deleted: (name: string) => `Layout ${name} deleted. Links stay in their groups.`,
    undone: 'Undone.',
    notDeleted: 'The layout was not deleted.',
    layoutActions: (name: string) => `Actions for layout ${name}`,
    rename: 'Rename',
    delete: 'Delete',
  },
});

/**
 * Opens the viewer. Called right in the click: Chrome asks for access to the sites only there
 * (sites already allowed are not asked again). `prepare` runs after that (saving a layout).
 */
function showSideBySide(route: Route, urls: readonly string[], prepare?: () => Promise<boolean>) {
  const access = askSiteAccess(urls);
  void (async () => {
    await access;
    if (prepare && !(await prepare())) return;
    useUi.getState().setViewerReturn(window.location.hash);
    navigate(route);
  })();
}

/** Asks access to the whole sites of the pages. Right in a click: Chrome asks only then. */
function askSiteAccess(urls: readonly string[]): Promise<boolean> {
  return requestSiteAccess([...new Set(urls.map(sitePattern).filter((p) => p !== undefined))]);
}

/** Tabs of the shown links and the shown open tabs are unloaded: they stay on the tab strip. */
function sleepShown(tabIds: readonly Id[], chromeTabIds: readonly number[] = []) {
  if (tabIds.length + chromeTabIds.length === 0) return;
  void runCommand({ type: 'sleepLinks', tabIds: [...tabIds], chromeTabIds: [...chromeTabIds] });
}

/** Unloads the tabs of picked links and open tabs. */
function sleepPicked(items: readonly PickedItem[]) {
  sleepShown(
    items.flatMap((item) => (item.link ? [item.link.id] : [])),
    items.flatMap((item) =>
      !item.link && item.chromeTabId !== undefined ? [item.chromeTabId] : [],
    ),
  );
}

/** What the viewer tells the dialog when panes are added to it. */
export interface AddingPanes {
  /** Addresses already shown: they are not offered again. */
  shownUrls: ReadonlySet<string>;
  /** Panes shown now. */
  shownCount: number;
  /** Called after access to the sites was asked; their tabs are already put to sleep. */
  onAdd: (items: PickedItem[]) => void;
}

/** «Добавить» in the viewer: more links or open tabs to the panes shown, up to nine in all. */
export function AddPanesDialog({
  overview,
  index,
  adding,
  open,
  onOpenChange,
}: TileDialogProps & {
  adding: AddingPanes;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const room = MAX_TILES - adding.shownCount;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={DIALOG_OVERLAY} />
        <Dialog.Content className={`${DIALOG_CONTENT} w-[min(680px,calc(100vw-32px))]`}>
          <div className="flex items-center gap-2">
            <Plus aria-hidden className="size-4 text-accent" />
            <Dialog.Title className="text-md font-semibold">{text().addTitle}</Dialog.Title>
            <Dialog.Close aria-label={text().close} className={`ml-auto ${BUTTON_ICON}`}>
              <X aria-hidden className="size-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="-mt-2 text-sm text-fg-muted">
            {text().addAbout(room, MAX_TILES)}
          </Dialog.Description>
          {open && (
            <TilePicker
              overview={overview}
              index={index}
              adding={adding}
              onDone={() => onOpenChange(false)}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const SECTION_TITLE = 'text-xs font-semibold tracking-wide text-fg-subtle uppercase';

/** Which pane gets which number, row by row. */

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
            <Dialog.Title className="text-md font-semibold">{text().title}</Dialog.Title>
            <Dialog.Close aria-label={text().close} className={`ml-auto ${BUTTON_ICON}`}>
              <X aria-hidden className="size-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="-mt-2 text-sm text-fg-muted">
            {text().about}
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
  /** «Добавить» in the viewer: pick 1+ more, the panes shown are not offered. */
  adding?: AddingPanes;
  onDone: () => void;
}

function TilePicker({ overview, index, startGroupId, adding, onDone }: TilePickerProps) {
  const layouts = useLiveQuery(loadLayouts) ?? [];
  const [pages, setPages] = useState<BrowserTab[]>([]);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [save, setSave] = useState(false);
  const [name, setName] = useState<string>();
  const offered = (url: string) => !adding?.shownUrls.has(url);
  const groups = pickerGroups(overview, index, query)
    .map((item) => ({ ...item, tabs: item.tabs.filter((tab) => offered(tab.url)) }))
    .filter((item) => item.tabs.length > 0);
  const shownPages = openPages(pages, query).filter((tab) => offered(tab.url));
  const items = pickedItems(overview, pages, picked);
  const before = adding?.shownCount ?? 0;
  const limit = MAX_TILES - before;
  const full = picked.length >= limit;
  const total = before + picked.length;
  const minimum = adding ? 1 : MIN_TILES;

  // Open tabs outside TabFlow, as they are when the dialog opens.
  useEffect(() => {
    listOpenTabs()
      .then(setPages)
      .catch(() => setPages([]));
  }, []);

  // From the menu of a tile: the list starts at that group.
  const startRef = useRef<HTMLDivElement>(null);
  // Braces: Chrome's `scrollIntoView` now returns a Promise, which React would take for a cleanup.
  useEffect(() => {
    void startRef.current?.scrollIntoView({ block: 'start' });
  }, []);

  function row(key: string, url: string, title: string) {
    const at = picked.indexOf(key);
    return (
      <PickRow
        key={key}
        url={url}
        title={title}
        at={at < 0 ? at : before + at}
        disabled={at < 0 && full}
        onToggle={() => setPicked((current) => togglePick(current, key, limit))}
      />
    );
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (items.length < minimum) return;
    if (adding) {
      const access = askSiteAccess(items.map((item) => item.url));
      onDone();
      sleepPicked(items);
      void access.finally(() => adding.onAdd(items));
      return;
    }
    showSideBySide(
      { view: 'side', items: items.map((item) => item.key) },
      items.map((item) => item.url),
      async () => {
        if (save) {
          try {
            await repositories.layouts.create(
              name?.trim() || defaultLayoutName(items),
              toLayoutLinks(items),
            );
          } catch {
            useUi.getState().showToast(text().notSaved);
            return false;
          }
        }
        onDone();
        sleepPicked(items);
        return true;
      },
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-col gap-4">
      {!adding && layouts.length > 0 && query === '' && (
        <section aria-label={text().savedLayouts} className="flex flex-col gap-1">
          <h2 className={SECTION_TITLE}>{text().layouts}</h2>
          <ul className="flex flex-col">
            {layouts.map((layout) => (
              <LayoutRow key={layout.id} layout={layout} onOpen={onDone} />
            ))}
          </ul>
        </section>
      )}

      <section aria-label={text().linksAndTabs} className="flex min-h-0 flex-col gap-2">
        <label className="relative block">
          <span className="sr-only">{text().find}</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={text().findPlaceholder}
            className={`${INPUT} pl-9`}
          />
        </label>
        <div className="max-h-[42vh] min-h-24 overflow-y-auto pr-1">
          {groups.length === 0 && shownPages.length === 0 && (
            <p className="py-6 text-center text-sm text-fg-muted">
              {query ? text().nothingFound : text().nothingYet}
            </p>
          )}
          {shownPages.length > 0 && (
            <div className="flex flex-col pb-2">
              <h3 className={`${SECTION_TITLE} px-1 py-1.5`}>{text().openTabs}</h3>
              {shownPages.map((tab) => row(pageKey(tab.url), tab.url, tab.title))}
            </div>
          )}
          {groups.map(({ group, space, tabs }) => (
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
                <span className="truncate font-semibold">{group.title || untitled()}</span>
                <span className="truncate text-fg-subtle">· {space.name}</span>
              </div>
              {tabs.map((tab) => row(tab.id, tab.url, tab.title))}
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <LayoutScheme count={Math.max(total, MIN_TILES)} active={total} />
        <p className="min-w-40 flex-1 text-sm text-fg-muted" aria-live="polite">
          {adding
            ? text().addingNow(before, picked.length, limit)
            : picked.length < MIN_TILES
              ? text().pickMore(picked.length, MAX_TILES)
              : `${text().panes(picked.length)}. ${text().layoutHint[picked.length] ?? ''}`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {!adding && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={save}
              onChange={(event) => setSave(event.target.checked)}
              className="size-4 accent-(--color-accent)"
            />
            {text().saveLayout}
          </label>
        )}
        {!adding && save && (
          <input
            aria-label={text().layoutName}
            value={name ?? defaultLayoutName(items)}
            onChange={(event) => setName(event.target.value)}
            placeholder={text().name}
            maxLength={80}
            className={`${INPUT} min-w-40 flex-1`}
          />
        )}
        <div className="ml-auto flex gap-2">
          <Dialog.Close type="button" className={BUTTON_SECONDARY}>
            {text().cancel}
          </Dialog.Close>
          <button type="submit" disabled={items.length < minimum} className={BUTTON_PRIMARY}>
            {adding ? (
              <>
                <Plus aria-hidden className="size-4" />
                {text().add}
              </>
            ) : (
              <>
                <Columns2 aria-hidden className="size-4" />
                {text().open}
              </>
            )}
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
      .catch(() => useUi.getState().showToast(text().renameFailed));
  }

  async function remove() {
    const { showToast } = useUi.getState();
    try {
      const removed = await repositories.layouts.remove(layout.id);
      showToast(text().deleted(words().quote(layout.name)), () => {
        void repositories.layouts.restore(removed).then(() => showToast(text().undone));
      });
    } catch {
      showToast(text().notDeleted);
    }
  }

  if (renaming) {
    return (
      <li>
        <form onSubmit={rename} className="flex items-center gap-2 py-1">
          <input
            aria-label={text().layoutName}
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
              sleepShown(
                layout.links.flatMap((link) => (link.tabId === undefined ? [] : [link.tabId])),
              );
              return true;
            },
          );
        }}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-(--duration-fast) hover:bg-surface-raised"
      >
        <LayoutScheme count={linkCount} active={linkCount} />
        <span className="min-w-0 flex-1 truncate font-semibold">{layout.name || untitled()}</span>
        <span className="shrink-0 font-mono text-xs text-fg-subtle">
          {linkCount} {text().linkNoun(linkCount)}
        </span>
      </button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label={text().layoutActions(words().quote(layout.name))}
          className={BUTTON_ICON}
        >
          <Ellipsis aria-hidden className="size-4" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={4} className={MENU_CONTENT}>
            <DropdownMenu.Item className={MENU_ITEM} onSelect={() => setRenaming(true)}>
              <Pencil aria-hidden /> {text().rename}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={`${MENU_ITEM} text-danger data-highlighted:text-danger`}
              onSelect={() => void remove()}
            >
              <Trash aria-hidden /> {text().delete}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </li>
  );
}

const SCHEME = { left: 0, top: 0, width: 60, height: 36 };

/** A small picture of the panes: numbered cells, the first `active` ones filled. */
function LayoutScheme({ count: cells, active }: { count: number; active: number }) {
  // Up to nine cells: the numbers get smaller in the grids of three rows and four columns.
  const size = cells > 6 ? 'text-[8px]' : 'text-[9px]';
  return (
    <span aria-hidden className="relative block h-9 w-15 shrink-0">
      {tileRects(cells, SCHEME).map((rect, i) => (
        <span
          key={i}
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width - 2,
            height: rect.height - 2,
          }}
          className={`absolute flex items-center justify-center rounded-xs border font-mono leading-none ${size} ${
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

interface PickRowProps {
  url: string;
  title: string;
  /** Place in the picked order, -1 — not picked. */
  at: number;
  disabled: boolean;
  onToggle: () => void;
}

/** A link or an open tab to pick: the number shows its pane. */
function PickRow({ url, title, at, disabled, onToggle }: PickRowProps) {
  const on = at >= 0;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      className={`flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors duration-(--duration-fast) disabled:opacity-50 ${
        on ? 'bg-accent-soft text-fg' : 'hover:bg-surface-raised'
      }`}
    >
      <span
        aria-hidden
        className={`flex size-5 shrink-0 items-center justify-center rounded-sm border font-mono text-xs ${
          on ? 'border-accent bg-accent font-semibold text-on-accent' : 'border-border-control'
        }`}
      >
        {on ? at + 1 : ''}
      </span>
      <img alt="" src={faviconUrl(url, 16)} className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{title || url}</span>
      <span className="shrink-0 text-xs text-fg-subtle">{displayHost(url)}</span>
    </button>
  );
}
