import { Folder } from 'lucide-react';
import type { ReactNode } from 'react';
import { daysLeft, timeAgo } from '@/lib/app/time-format';
import { displayHost } from '@/lib/app/overview';
import { groupTrashedTabs, loadTrashView, type TrashEntry } from '@/lib/app/trash-view';
import { faviconUrl } from '@/lib/browser-api';
import { localized } from '@/lib/i18n';
import { words } from '@/lib/i18n/words';
import { type Id, repositories } from '@/lib/db';
import type { TrashKind } from '@/lib/messages';
import { useLiveQuery } from '@/lib/use-live-query';
import { runCommand } from '../commands';
import { useNow } from '../hooks';
import { useUi } from '../store';
import { BUTTON_SECONDARY, GROUP_DOT, untitled } from '../ui';

const loadTrash = () => loadTrashView(repositories);

/** Long lists of closed tabs are cut; the rest are still kept for 30 days. */
const TAB_ROWS_SHOWN = 200;
const text = localized({
  ru: {
    restoredAll: (group: string, n: number) => `В ${group} восстановлено: ${words().links(n)}.`,
    failed: (n: number) => ` Не удалось: ${words().links(n)} — они остались в корзине.`,
    meta: (ago: string, days: number) => `удалено ${ago} · исчезнет через ${days} дн.`,
    title: 'Корзина',
    about:
      'Удалённое хранится 30 дней. Восстановленная группа возвращается убранной в своё пространство или во «Входящие».',
    empty: 'Корзина пуста.',
    spaces: 'Пространства',
    groups: 'Группы',
    links: 'Ссылки',
    linksFrom: (group: string) => `Ссылки из ${group}`,
    from: (group: string) => `из ${group}`,
    restoreAll: 'Восстановить все',
    more: (n: number) => `И ещё ${words().links(n)}.`,
    restore: 'Восстановить',
  },
  en: {
    restoredAll: (group: string, n: number) => `Restored to ${group}: ${words().links(n)}.`,
    failed: (n: number) => ` Couldn\u2019t: ${words().links(n)} — they stay in Trash.`,
    meta: (ago: string, days: number) => `deleted ${ago} · gone in ${days} d`,
    title: 'Trash',
    about:
      'Deleted items are kept for 30 days. A restored group comes back stowed to its space or to Inbox.',
    empty: 'Trash is empty.',
    spaces: 'Spaces',
    groups: 'Groups',
    links: 'Links',
    linksFrom: (group: string) => `Links from ${group}`,
    from: (group: string) => `from ${group}`,
    restoreAll: 'Restore all',
    more: (n: number) => `And ${words().links(n)} more.`,
    restore: 'Restore',
  },
});

/**
 * Brings back every lone link of a group, one command at a time in the group's own order.
 * Links of a group on the tab strip open there as placeholders (or sites, by the restore mode).
 */
async function restoreAll(ids: readonly Id[], groupTitle: string): Promise<void> {
  const { restoreMode, showToast } = useUi.getState();
  let restored = 0;
  for (const id of ids) {
    const response = await runCommand(
      { type: 'restoreDeleted', kind: 'tab', id, mode: restoreMode },
      { quiet: true },
    );
    if (response?.ok) restored++;
  }
  const failed = ids.length - restored;
  showToast(
    text().restoredAll(words().quote(groupTitle || untitled()), restored) +
      (failed > 0 ? text().failed(failed) : ''),
  );
}

export function TrashView() {
  const trash = useLiveQuery(loadTrash);
  const now = useNow();
  if (!trash) return null;

  const meta = (item: TrashEntry<unknown>) =>
    text().meta(timeAgo(item.deletedAt, now), daysLeft(item.expiresAt, now));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-[-0.02em]">{text().title}</h1>
        <p className="text-sm text-fg-muted">{text().about}</p>
      </header>

      {trash.isEmpty && (
        <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-fg-muted">
          {text().empty}
        </p>
      )}

      {trash.spaces.length > 0 && (
        <TrashSection title={text().spaces}>
          {trash.spaces.map((item) => (
            <TrashRow
              key={item.record.id}
              kind="space"
              id={item.record.id}
              icon={<Folder aria-hidden className="size-4 text-fg-muted" />}
              title={item.record.name}
              detail={`${words().groups(item.groups)} · ${words().tabs(item.tabs)}`}
              meta={meta(item)}
            />
          ))}
        </TrashSection>
      )}

      {trash.groups.length > 0 && (
        <TrashSection title={text().groups}>
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
              title={item.record.title || untitled()}
              detail={words().tabs(item.tabs)}
              meta={meta(item)}
            />
          ))}
        </TrashSection>
      )}

      {trash.tabs.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-md font-semibold">{text().links}</h2>
          {groupTrashedTabs(trash.tabs).map((links) => (
            <ul
              key={links.groupId}
              aria-label={text().linksFrom(words().quote(links.groupTitle || untitled()))}
              className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface"
            >
              <li className="flex items-center gap-3 bg-surface-raised px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {text().from(words().quote(links.groupTitle || untitled()))} ·{' '}
                  <span className="font-mono text-xs text-fg-muted">
                    {words().links(links.tabs.length)}
                  </span>
                </span>
                {links.tabs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => void restoreAll(links.restoreOrder, links.groupTitle)}
                    className={BUTTON_SECONDARY}
                  >
                    {text().restoreAll}
                  </button>
                )}
              </li>
              {links.tabs.slice(0, TAB_ROWS_SHOWN).map((item) => (
                <TrashRow
                  key={item.record.id}
                  kind="tab"
                  id={item.record.id}
                  icon={<img src={faviconUrl(item.record.url, 16)} alt="" className="size-4" />}
                  title={item.record.title || item.record.url}
                  detail={displayHost(item.record.url)}
                  meta={meta(item)}
                />
              ))}
              {links.tabs.length > TAB_ROWS_SHOWN && (
                <li className="px-3 py-2 text-sm text-fg-subtle">
                  {text().more(links.tabs.length - TAB_ROWS_SHOWN)}
                </li>
              )}
            </ul>
          ))}
        </section>
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
        onClick={() =>
          runCommand({ type: 'restoreDeleted', kind, id, mode: useUi.getState().restoreMode })
        }
        className={BUTTON_SECONDARY}
      >
        {text().restore}
      </button>
    </li>
  );
}
