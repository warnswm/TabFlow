import { DropdownMenu } from 'radix-ui';
import { ListFilter } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { QueueSort } from '@/lib/queue/plan';
import { loadRestoreMode } from '@/lib/settings';
import { Toaster } from '../app/components/Toaster';
import { useUi } from '../app/store';
import { BUTTON_ICON, MENU_CONTENT, MENU_ITEM } from '../app/ui';
import { GroupsPanel } from './GroupsPanel';
import { QueuePanel } from './QueuePanel';

/**
 * Side panel (`chrome.sidePanel`): the video queue «на потом» and the groups, always at hand.
 * Reads the database live; everything else goes through background commands, with the toast
 * and «Отменить» of the main page.
 */

type Section = 'queue' | 'groups';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'queue', label: 'Очередь' },
  { id: 'groups', label: 'Группы' },
];

const SORT_LABEL: Record<QueueSort, string> = {
  priority: 'По приоритету',
  short: 'Сначала короткие',
};

export default function App() {
  const [section, setSection] = useState<Section>('queue');
  const [sort, setSort] = useState<QueueSort>('priority');

  useEffect(() => {
    void loadRestoreMode().then((mode) => useUi.getState().setRestoreMode(mode, false));
  }, []);

  return (
    <div className="flex h-screen flex-col bg-bg text-fg">
      <header className="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-accent text-on-accent">
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="4" width="7" height="7" rx="1.5" />
            <rect x="14" y="4" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <path d="M14 17.5h7" />
          </svg>
        </span>
        <div
          role="tablist"
          aria-label="Разделы панели"
          className="flex rounded-md border border-border bg-surface p-0.5"
        >
          {SECTIONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={section === id}
              aria-controls={`panel-${id}`}
              onClick={() => setSection(id)}
              className={`h-7 rounded-[6px] px-3 text-[13px] transition-colors duration-(--duration-fast) ${
                section === id
                  ? 'bg-accent-soft font-semibold text-accent'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {section === 'queue' && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              aria-label={`Сортировка: ${SORT_LABEL[sort]}`}
              title={`Сортировка: ${SORT_LABEL[sort]}`}
              className={`ml-auto ${BUTTON_ICON} ${sort === 'priority' ? '' : 'text-accent'}`}
            >
              <ListFilter aria-hidden className="size-4" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={4} className={MENU_CONTENT}>
                <DropdownMenu.Label className="px-2 py-1.5 text-xs text-fg-subtle">
                  Сортировка
                </DropdownMenu.Label>
                <DropdownMenu.RadioGroup
                  value={sort}
                  onValueChange={(value) => setSort(value as QueueSort)}
                >
                  {(Object.keys(SORT_LABEL) as QueueSort[]).map((value) => (
                    <DropdownMenu.RadioItem
                      key={value}
                      value={value}
                      className={`${MENU_ITEM} relative pl-7`}
                    >
                      <DropdownMenu.ItemIndicator className="absolute left-2 flex">
                        <span aria-hidden className="size-2 rounded-full bg-current" />
                      </DropdownMenu.ItemIndicator>
                      {SORT_LABEL[value]}
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </header>

      <div
        role="tabpanel"
        id={`panel-${section}`}
        aria-labelledby={`tab-${section}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        {section === 'queue' ? <QueuePanel sort={sort} /> : <GroupsPanel />}
      </div>
      <Toaster />
    </div>
  );
}
