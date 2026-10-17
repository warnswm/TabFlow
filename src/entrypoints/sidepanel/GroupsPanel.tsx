import { Archive, Minimize2, Moon } from 'lucide-react';
import { loadOverview } from '@/lib/app/overview';
import { count, TABS } from '@/lib/command-messages';
import { repositories } from '@/lib/db';
import type { GroupView } from '@/lib/app/overview';
import { useLiveQuery } from '@/lib/use-live-query';
import { runCommand } from '../app/commands';
import { useUi } from '../app/store';
import { BUTTON_LINK, GROUP_DOT, UNTITLED } from '../app/ui';

const load = () => loadOverview(repositories);

/** All groups by space, with what can be done right here: show, wake or bring back. */
export function GroupsPanel() {
  const overview = useLiveQuery(load);
  if (!overview) return null;
  const spaces = overview.spaces.filter((view) => view.groups.length > 0);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2 pb-3">
        {spaces.length === 0 && (
          <p className="mx-2 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted">
            Здесь появятся группы. Нажмите «Свернуть всё» или Ctrl+Shift+S.
          </p>
        )}
        {spaces.map((view) => (
          <section key={view.space.id} aria-label={view.space.name}>
            <h2 className="px-2 pt-1 pb-1.5 text-[13px] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
              {view.space.name}
            </h2>
            <ul className="flex flex-col gap-0.5">
              {view.groups.map((item) => (
                <GroupRow key={item.group.id} view={item} />
              ))}
            </ul>
          </section>
        ))}
      </div>
      <footer className="border-t border-border px-4 pt-3 pb-4">
        <button
          type="button"
          onClick={() => void runCommand({ type: 'collapseAll' })}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-accent text-sm font-semibold text-on-accent transition-colors duration-(--duration-fast) hover:bg-accent-hover active:bg-accent-pressed"
        >
          <Minimize2 aria-hidden className="size-4" strokeWidth={2.2} />
          Свернуть всё
        </button>
      </footer>
    </>
  );
}

function GroupRow({ view: { group, tabs } }: { view: GroupView }) {
  const restoreMode = useUi((state) => state.restoreMode);
  const name = group.title || UNTITLED;
  const first = tabs[0];

  const restore = () =>
    runCommand(
      { type: 'restoreGroup', groupId: group.id, mode: restoreMode },
      { name: group.title, quiet: group.state !== 'stowed' },
    );
  const action =
    group.state === 'stowed'
      ? { label: 'Вернуть', run: restore }
      : group.state === 'asleep'
        ? { label: 'Разбудить', run: restore }
        : first && {
            label: 'Показать',
            run: () => runCommand({ type: 'openTab', tabId: first.id }, { quiet: true }),
          };

  return (
    <li
      className={`flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-surface-raised ${
        group.state === 'stowed' ? 'opacity-90' : ''
      }`}
    >
      <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${GROUP_DOT[group.color]}`} />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
      <span className="font-mono text-xs text-fg-muted" title={count(tabs.length, TABS)}>
        {tabs.length}
      </span>
      {group.state === 'asleep' && (
        <Moon aria-label="спит" className="size-3.5 shrink-0 text-fg-muted" />
      )}
      {group.state === 'stowed' && (
        <Archive aria-label="убрана" className="size-3.5 shrink-0 text-fg-muted" />
      )}
      {action && (
        <button
          type="button"
          onClick={() => void action.run()}
          aria-label={`${action.label} «${name}»`}
          className={`${BUTTON_LINK} w-20 shrink-0 text-right text-[13px]`}
        >
          {action.label}
        </button>
      )}
    </li>
  );
}
