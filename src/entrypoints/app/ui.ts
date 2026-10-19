/**
 * Shared class names of the main page (DESIGN.md → «Компоненты»). Full class names only:
 * Tailwind generates classes it can find in the source.
 */
import type { GroupColor } from '@/lib/db';
import { localized } from '@/lib/i18n';
import { words } from '@/lib/i18n/words';

export const BUTTON_PRIMARY =
  'inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3.5 text-sm font-semibold text-on-accent transition-colors duration-(--duration-fast) hover:bg-accent-hover active:bg-accent-pressed disabled:opacity-50';

export const BUTTON_SECONDARY =
  'inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface-raised px-3.5 text-sm font-semibold text-fg transition-colors duration-(--duration-fast) hover:border-border-control disabled:opacity-50';

/** Secondary button for deleting: the danger color is only in the text. */
export const BUTTON_DANGER =
  'inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface-raised px-3.5 text-sm font-semibold text-danger transition-colors duration-(--duration-fast) hover:border-danger disabled:opacity-50';

export const BUTTON_ICON =
  'inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-fg-muted transition-colors duration-(--duration-fast) hover:bg-surface-raised hover:text-fg';

/** A text button that looks like a link («Вернуть», «Разбудить», «Отменить»). */
export const BUTTON_LINK =
  'rounded-sm font-semibold text-accent transition-colors duration-(--duration-fast) hover:text-accent-hover';

export const INPUT =
  'h-9 w-full rounded-md border border-border-control bg-bg px-3 text-fg placeholder:text-fg-subtle';

export const MENU_CONTENT =
  'z-50 min-w-56 rounded-lg bg-surface-raised p-1 text-sm shadow-popover data-[state=open]:animate-fade-in';

export const MENU_ITEM =
  'flex h-8 cursor-default items-center gap-2.5 rounded-md px-2 text-fg outline-none select-none data-disabled:opacity-50 data-highlighted:bg-accent-soft data-highlighted:text-accent [&_svg]:size-4 [&_svg]:shrink-0';

export const MENU_SEPARATOR = 'my-1 h-px bg-border';

export const DIALOG_OVERLAY = 'fixed inset-0 z-40 bg-overlay data-[state=open]:animate-fade-in';

export const DIALOG_CONTENT =
  'fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl bg-surface p-5 shadow-popover data-[state=open]:animate-fade-in';

export const GROUP_DOT: Record<GroupColor, string> = {
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

const colorNames = localized<Record<GroupColor, string>>({
  ru: {
    grey: 'Серый',
    blue: 'Синий',
    red: 'Красный',
    yellow: 'Жёлтый',
    green: 'Зелёный',
    pink: 'Розовый',
    purple: 'Фиолетовый',
    cyan: 'Голубой',
    orange: 'Оранжевый',
  },
  en: {
    grey: 'Grey',
    blue: 'Blue',
    red: 'Red',
    yellow: 'Yellow',
    green: 'Green',
    pink: 'Pink',
    purple: 'Purple',
    cyan: 'Cyan',
    orange: 'Orange',
  },
});

/** Name of a group color in the interface language. */
export const groupColorName = (color: GroupColor) => colorNames()[color];

/** «Без названия» / “Untitled” — a group without a title. */
export const untitled = () => words().untitled;
