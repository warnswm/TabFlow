import { Folder } from 'lucide-react';
import type { ReactNode } from 'react';
import { daysLeft, timeAgo } from '@/lib/app/time-format';
import { loadTrashView, type TrashEntry } from '@/lib/app/trash-view';
import { faviconUrl } from '@/lib/browser-api';
import { count, GROUPS, TABS } from '@/lib/command-messages';
import { repositories } from '@/lib/db';
import type { TrashKind } from '@/lib/messages';
import { useLiveQuery } from '@/lib/use-live-query';
import { runCommand } from '../commands';
import { useNow } from '../hooks';
import { BUTTON_SECONDARY, GROUP_DOT, UNTITLED } from '../ui';

const loadTrash = () => loadTrashView(repositories);

/** Long lists of closed tabs are cut; the rest are still kept for 30 days. */
const TAB_ROWS_SHOWN = 200;

export function TrashView() {
  const trash = useLiveQuery(loadTrash);
  const now = useNow();
  if (!trash) return null;

  const meta = (item: TrashEntry<unknown>) =>
    `удалено ${timeAgo(item.deletedAt, now)} · исчезнет через ${daysLeft(item.expiresAt, now)} дн.`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-[-0.02em]">Корзина</h1>
        <p className="text-sm text-fg-muted">
          Удалённое хранится 30 дней. Восстановленная группа возвращается убранной в своё
          пространство или во «Входящие».
        </p>
      </header>

      {trash.isEmpty && (
        <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-fg-muted">
          Корзина пуста.
        </p>
      )}

      {trash.spaces.length > 0 && (
        <TrashSection title="Пространства">
          {trash.spaces.map((item) => (
            <TrashRow
              key={item.record.id}
              kind="space"
              id={item.record.id}
              icon={<Folder aria-hidden className="size-4 text-fg-muted" />}
              title={item.record.name}
              detail={`${count(item.groups, GROUPS)} · ${count(item.tabs, TABS)}`}
              meta={meta(item)}
            />
          ))}
        </TrashSection>
      )}

      {trash.groups.length > 0 && (
        <TrashSection title="Группы">
          {trash.groups.map((item) => (
            <TrashRow
              key={item.record.id}
              kind="group"
              id={item.record.id}
              icon={
                <span
                  aria-hidden
                  className={`size-2.5 rounded-full ${GROUP_DOT[item.record.color]}`}
                />
              }
              title={item.record.title || UNTITLED}
              detail={count(item.tabs, TABS)}
              meta={meta(item)}
            />
          ))}
        </TrashSection>
      )}

      {trash.tabs.length > 0 && (
        <TrashSection title="Ссылки">
          {trash.tabs.slice(0, TAB_ROWS_SHOWN).map((item) => (
            <TrashRow
              key={item.record.id}
              kind="tab"
              id={item.record.id}
              icon={<img src={faviconUrl(item.record.url, 16)} alt="" className="size-4" />}
              title={item.record.title || item.record.url}
              detail={`из «${item.groupTitle || UNTITLED}»`}
              meta={meta(item)}
            />
          ))}
          {trash.tabs.length > TAB_ROWS_SHOWN && (
            <li className="px-3 py-2 text-sm text-fg-subtle">
              И ещё {count(trash.tabs.length - TAB_ROWS_SHOWN, ['ссылка', 'ссылки', 'ссылок'])}.
            </li>
          )}
        </TrashSection>
      )}
    </div>
  );
}

function TrashSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-md font-semibold">{title}</h2>
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
        {children}
      </ul>
    </section>
  );
}

interface TrashRowProps {
  kind: TrashKind;
  id: string;
  icon: ReactNode;
  title: string;
  detail: string;
  meta: string;
}

function TrashRow({ kind, id, icon, title, detail, meta }: TrashRowProps) {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span className="flex size-5 shrink-0 items-center justify-center">{icon}</span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{title}</span>
        <span className="truncate text-xs text-fg-subtle">
          {detail} · {meta}
        </span>
      </div>
      <button
        type="button"
        onClick={() => runCommand({ type: 'restoreDeleted', kind, id })}
        className={BUTTON_SECONDARY}
      >
        Восстановить
      </button>
    </li>
  );
}
