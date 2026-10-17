import { Command } from 'cmdk';
import { ChevronRight, Search } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { type ReactNode, useState } from 'react';
import type { Overview } from '@/lib/app/overview';
import {
  buildPalette,
  type PaletteAction,
  type PaletteGroup,
  type PaletteTab,
} from '@/lib/app/palette';
import type { SearchIndex } from '@/lib/app/search';
import { faviconUrl } from '@/lib/browser-api';
import { count, TABS } from '@/lib/command-messages';
import type { GroupState, Id } from '@/lib/db';
import { runCommand } from '../commands';
import { navigate } from '../hooks';
import { useUi } from '../store';
import { DIALOG_OVERLAY, GROUP_DOT, UNTITLED } from '../ui';
import { Highlighted } from './Highlighted';

const STATE_LABEL: Record<GroupState, string> = {
  active: 'Активна',
  asleep: 'Спит',
  stowed: 'Убрана',
};

const GROUP_HEADING =
  '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-[0.06em] [&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:uppercase';

const ITEM =
  'flex min-h-9 cursor-default items-center gap-3 rounded-md px-2.5 py-2 text-fg select-none data-[selected=true]:bg-accent-soft';

const KBD = 'rounded-sm border border-border px-1.5 font-mono text-[11px] text-fg-muted';

interface CommandPaletteProps {
  overview: Overview;
  index: SearchIndex;
  currentSpaceId?: Id;
}

/** Ctrl+K: groups and links of all spaces, and commands. */
export function CommandPalette(props: CommandPaletteProps) {
  const open = useUi((state) => state.paletteOpen);
  const setOpen = useUi((state) => state.setPaletteOpen);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={DIALOG_OVERLAY} />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-12 left-1/2 z-50 flex w-[min(620px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-xl bg-surface-raised shadow-popover data-[state=open]:animate-fade-in"
        >
          <Dialog.Title className="sr-only">Командная палитра</Dialog.Title>
          {/* Mounted while open only: the query starts empty every time. */}
          <PaletteBody {...props} close={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PaletteBody({
  overview,
  index,
  currentSpaceId,
  close,
}: CommandPaletteProps & { close: () => void }) {
  const [query, setQuery] = useState('');
  const { groups, tabs, actions, terms } = buildPalette(overview, index, query, currentSpaceId);

  function choose(run: () => void) {
    close();
    run();
  }

  return (
    <Command shouldFilter={false} loop label="Командная палитра">
      <div className="flex h-14 items-center gap-3 border-b border-border px-4.5">
        <Search aria-hidden className="size-[18px] shrink-0 text-fg-muted" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Группа, вкладка или команда"
          aria-label="Команда или поиск"
          className="min-w-0 flex-1 bg-transparent text-md text-fg outline-none placeholder:text-fg-subtle"
        />
        <kbd className={KBD}>Esc</kbd>
      </div>

      <Command.List className="max-h-[min(420px,60vh)] overflow-y-auto p-2">
        <Command.Empty className="px-2.5 py-6 text-center text-sm text-fg-muted">
          Ничего не найдено по запросу «{query.trim()}».
        </Command.Empty>

        {groups.length > 0 && (
          <Command.Group heading="Группы" className={GROUP_HEADING}>
            {groups.map((item) => (
              <GroupItem
                key={item.group.id}
                item={item}
                terms={terms}
                onSelect={() => choose(() => showGroup(item))}
              />
            ))}
          </Command.Group>
        )}

        {tabs.length > 0 && (
          <Command.Group heading="Вкладки" className={GROUP_HEADING}>
            {tabs.map((item) => (
              <TabItem
                key={item.tab.id}
                item={item}
                terms={terms}
                onSelect={() =>
                  choose(
                    () => void runCommand({ type: 'openTab', tabId: item.tab.id }, { quiet: true }),
                  )
                }
              />
            ))}
          </Command.Group>
        )}

        {actions.length > 0 && (
          <Command.Group heading="Действия" className={GROUP_HEADING}>
            {actions.map((item) => (
              <Command.Item
                key={item.id}
                value={item.id}
                onSelect={() => choose(() => runAction(item.action))}
                className={ITEM}
              >
                <span
                  aria-hidden
                  className="flex size-5 shrink-0 items-center justify-center rounded-sm border border-border bg-surface text-fg-muted"
                >
                  <ChevronRight className="size-3.5" />
                </span>
                <span className="min-w-0 truncate">{item.label}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>

      <div className="flex items-center gap-4 border-t border-border bg-surface px-4.5 py-2.5 text-xs text-fg-muted">
        <Hint keys="↑↓">выбрать</Hint>
        <Hint keys="Enter">открыть</Hint>
        <Hint keys="Esc">закрыть</Hint>
      </div>
    </Command>
  );
}

function Hint({ keys, children }: { keys: string; children: ReactNode }) {
  return (
    <span>
      <span className="font-mono">{keys}</span> {children}
    </span>
  );
}

function GroupItem({
  item,
  terms,
  onSelect,
}: {
  item: PaletteGroup;
  terms: readonly string[];
  onSelect: () => void;
}) {
  const { group, space, tabCount } = item;
  return (
    <Command.Item value={`group:${group.id}`} onSelect={onSelect} className={ITEM}>
      <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${GROUP_DOT[group.color]}`} />
      <span className="min-w-0 truncate">
        <Highlighted text={group.title || UNTITLED} terms={terms} />
      </span>
      <span className="ml-auto shrink-0 text-xs text-fg-muted">
        {space.name} · {STATE_LABEL[group.state]} · {count(tabCount, TABS)}
      </span>
    </Command.Item>
  );
}

function TabItem({
  item,
  terms,
  onSelect,
}: {
  item: PaletteTab;
  terms: readonly string[];
  onSelect: () => void;
}) {
  const { tab, group } = item;
  const where = group.state === 'active' ? '' : ` · ${STATE_LABEL[group.state].toLowerCase()}`;
  return (
    <Command.Item value={`tab:${tab.id}`} onSelect={onSelect} className={ITEM}>
      <img src={faviconUrl(tab.url, 16)} alt="" className="size-4 shrink-0" />
      <span className="min-w-0 truncate">
        <Highlighted text={tab.title || tab.url} terms={terms} />
      </span>
      <span className="ml-auto max-w-48 shrink-0 truncate text-xs text-fg-muted">
        {group.title || UNTITLED}
        {where}
      </span>
    </Command.Item>
  );
}

/** Goes to the group's space and outlines its tile. */
function showGroup({ group, space }: PaletteGroup) {
  const ui = useUi.getState();
  ui.resetFilters();
  ui.focusGroup(group.id);
  navigate({ view: 'space', spaceId: space.id });
}

function runAction(action: PaletteAction) {
  const ui = useUi.getState();
  switch (action.type) {
    case 'collapseAll':
      void runCommand({ type: 'collapseAll' });
      break;
    case 'openTrash':
      navigate({ view: 'trash' });
      break;
    case 'newSpace':
      ui.setNewSpaceOpen(true);
      break;
    case 'goToSpace':
      navigate({ view: 'space', spaceId: action.spaceId });
      break;
    case 'sleepGroup':
    case 'stowGroup':
      void runCommand(
        { type: action.type, groupId: action.group.id },
        { name: action.group.title },
      );
      break;
    case 'restoreGroup':
      void runCommand(
        { type: 'restoreGroup', groupId: action.group.id, mode: ui.restoreMode },
        // Waking only switches to the group in Chrome: nothing to report.
        { name: action.group.title, quiet: action.group.state !== 'stowed' },
      );
      break;
  }
}
