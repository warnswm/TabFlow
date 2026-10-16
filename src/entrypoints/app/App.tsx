import { useState } from 'react';
import { describeResponse } from '@/lib/command-messages';
import {
  type GroupColor,
  type GroupState,
  repositories,
  type SavedTab,
  type Space,
  type TabGroup,
} from '@/lib/db';
import { type Command, type RestoreMode, sendCommand } from '@/lib/messages';

// Both ways of restoring are kept; the choice moves to the settings at stage 7.
const RESTORE_MODE_LABEL: Record<RestoreMode, string> = {
  placeholder: 'Заглушки TabFlow',
  background: 'Сайты, выгрузка в фоне',
};
import { useLiveQuery } from '@/lib/use-live-query';

/**
 * Stage 2 test panel: groups from the database and the background commands.
 * Stage 3 replaces it with the tile overview.
 */

interface GroupRow {
  group: TabGroup;
  tabs: SavedTab[];
}

interface SpaceRow {
  space: Space;
  groups: GroupRow[];
}

async function loadOverview(): Promise<SpaceRow[]> {
  const spaces = await repositories.spaces.list();
  return Promise.all(
    spaces.map(async (space) => ({
      space,
      groups: await Promise.all(
        (await repositories.groups.listBySpace(space.id)).map(async (group) => ({
          group,
          tabs: await repositories.tabs.listByGroup(group.id),
        })),
      ),
    })),
  );
}

// Full class names: Tailwind only generates classes it can find in the source.
const DOT_CLASS: Record<GroupColor, string> = {
  grey: 'bg-group-grey',
  blue: 'bg-group-blue',
  red: 'bg-group-red',
  yellow: 'bg-group-yellow',
  green: 'bg-group-green',
  pink: 'bg-group-pink',
  purple: 'bg-group-purple',
  cyan: 'bg-group-cyan',
  orange: 'bg-group-orange',
};

const STATE_LABEL: Record<GroupState, string> = {
  active: 'активна',
  asleep: 'спит',
  stowed: 'убрана в TabFlow',
};

const TILE_CLASS: Record<GroupState, string> = {
  active: 'border-border bg-surface',
  asleep: 'border-border bg-surface',
  stowed: 'border-dashed border-border-control bg-transparent',
};

const BUTTON_PRIMARY =
  'h-9 rounded-md bg-accent px-4 font-semibold text-on-accent transition-colors duration-(--duration-fast) hover:bg-accent-hover active:bg-accent-pressed disabled:opacity-50';
const BUTTON_SECONDARY =
  'h-8 rounded-md border border-border bg-surface-raised px-3 text-sm font-semibold text-fg disabled:opacity-50';

export default function App() {
  const overview = useLiveQuery(loadOverview);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('placeholder');

  async function run(command: Command, groupTitle?: string) {
    setBusy(true);
    try {
      setStatus(describeResponse(command.type, await sendCommand(command), groupTitle));
    } catch {
      setStatus('Фоновая часть TabFlow не ответила. Вкладки и ссылки остались на месте.');
    } finally {
      setBusy(false);
    }
  }

  const empty = overview !== undefined && overview.every((row) => row.groups.length === 0);

  return (
    <div className="min-h-screen bg-bg">
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">TabFlow</h1>
          <p className="text-fg-muted">Всё на виду. Ничего в памяти.</p>
        </header>

        <fieldset className="flex flex-wrap items-center gap-4 text-sm">
          <legend className="mb-2 text-fg-subtle">Как возвращать группу</legend>
          {(Object.keys(RESTORE_MODE_LABEL) as RestoreMode[]).map((mode) => (
            <label key={mode} className="flex items-center gap-2">
              <input
                type="radio"
                name="restore-mode"
                checked={restoreMode === mode}
                onChange={() => setRestoreMode(mode)}
                className="accent-accent"
              />
              {RESTORE_MODE_LABEL[mode]}
            </label>
          ))}
        </fieldset>

        <section className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => run({ type: 'collapseAll' })}
            className={BUTTON_PRIMARY}
          >
            Свернуть всё
          </button>
          <p role="status" aria-live="polite" className="text-sm text-fg-muted">
            {status}
          </p>
        </section>

        {empty && (
          <p className="text-fg-muted">
            Здесь появятся группы. Нажмите «Свернуть всё» или создайте группу вкладок в Chrome.
          </p>
        )}

        {overview?.map(({ space, groups }) =>
          groups.length === 0 ? null : (
            <section
              key={space.id}
              aria-labelledby={`space-${space.id}`}
              className="flex flex-col gap-3"
            >
              <h2 id={`space-${space.id}`} className="text-sm font-medium text-fg-subtle">
                {space.name}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {groups.map(({ group, tabs }) => (
                  <GroupTile
                    key={group.id}
                    group={group}
                    tabs={tabs}
                    busy={busy}
                    onCommand={(type) =>
                      run(
                        type === 'restoreGroup'
                          ? { type, groupId: group.id, mode: restoreMode }
                          : { type, groupId: group.id },
                        group.title,
                      )
                    }
                  />
                ))}
              </ul>
            </section>
          ),
        )}

        <p className="text-sm text-fg-subtle">
          Временная панель этапа 2 — проверка фоновой логики. Плитки появятся на этапе 3.
        </p>
      </main>
    </div>
  );
}

interface GroupTileProps {
  group: TabGroup;
  tabs: SavedTab[];
  busy: boolean;
  onCommand: (type: 'sleepGroup' | 'stowGroup' | 'restoreGroup') => void;
}

function GroupTile({ group, tabs, busy, onCommand }: GroupTileProps) {
  const shown = tabs.slice(0, 6);
  return (
    <li className={`flex flex-col gap-3 rounded-lg border p-3.5 ${TILE_CLASS[group.state]}`}>
      <div className="flex items-center gap-2">
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${DOT_CLASS[group.color]}`} />
        <span className="truncate font-semibold">{group.title || 'Без названия'}</span>
        <span className="ml-auto font-mono text-xs text-fg-muted">{tabs.length}</span>
      </div>

      <div
        aria-hidden
        className={`flex items-center gap-1.5 ${group.state === 'asleep' ? 'opacity-50' : ''}`}
      >
        {shown.map((tab) =>
          tab.favIconUrl ? (
            <img key={tab.id} src={tab.favIconUrl} alt="" className="size-5 rounded-sm" />
          ) : (
            <span key={tab.id} className="size-5 rounded-sm bg-surface-raised" />
          ),
        )}
        {tabs.length > shown.length && (
          <span className="font-mono text-xs text-fg-subtle">+{tabs.length - shown.length}</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-xs text-fg-subtle">{STATE_LABEL[group.state]}</p>
        {group.state === 'active' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onCommand('sleepGroup')}
            className={BUTTON_SECONDARY}
          >
            Усыпить
          </button>
        )}
        {group.state !== 'stowed' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onCommand('stowGroup')}
            className={BUTTON_SECONDARY}
          >
            Убрать в TabFlow
          </button>
        )}
        {group.state === 'stowed' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onCommand('restoreGroup')}
            className={BUTTON_SECONDARY}
          >
            Вернуть
          </button>
        )}
      </div>
    </li>
  );
}
