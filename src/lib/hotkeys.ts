/**
 * Keyboard shortcuts (`commands` in the manifest — `wxt.config.ts` takes them from here).
 * Chrome accepts at most 4 suggested keys; the author can change them at
 * chrome://extensions/shortcuts. The popup and the queue have no key by default.
 * No runtime imports: the WXT config loads this file.
 */
import type { Command } from './messages';

export const HOTKEYS = {
  'collapse-all': {
    suggested_key: { default: 'Ctrl+Shift+S', mac: 'Command+Shift+S' },
    description: 'Свернуть всё',
  },
  'stow-current': {
    suggested_key: { default: 'Alt+Shift+S' },
    description: 'Убрать текущую группу или вкладку в TabFlow',
  },
  'sleep-current': {
    suggested_key: { default: 'Alt+Shift+Z' },
    description: 'Усыпить текущую группу',
  },
  'open-app': {
    suggested_key: { default: 'Alt+Shift+M' },
    description: 'Открыть TabFlow',
  },
  'queue-current': { description: 'Добавить текущую вкладку в очередь «на потом»' },
  'open-queue': { description: 'Открыть очередь в боковой панели' },
  _execute_action: { description: 'Открыть окно TabFlow на панели расширений' },
};

export type HotkeyName = keyof typeof HOTKEYS;

/** The command a shortcut runs; `tabId` — the active tab Chrome passes along. */
export function hotkeyCommand(name: string, tabId?: number): Command | undefined {
  const onTab = tabId !== undefined && tabId >= 0 ? { chromeTabId: tabId } : {};
  switch (name) {
    case 'collapse-all':
      return { type: 'collapseAll' };
    case 'stow-current':
      return { type: 'stowCurrent', ...onTab };
    case 'sleep-current':
      return { type: 'sleepCurrent', ...onTab };
    case 'open-app':
      return { type: 'openApp' };
    case 'queue-current':
      return { type: 'queueTab', ...onTab };
    default:
      // `_execute_action` is handled by Chrome; `open-queue` opens the side panel in the handler.
      return undefined;
  }
}

/** «Ctrl+Shift+S» → «Ctrl ⇧ S», as in the popup mockup. Mac shortcuts («⇧⌘S») stay as they are. */
export function formatShortcut(shortcut: string): string {
  if (!shortcut.includes('+')) return shortcut;
  return shortcut
    .split('+')
    .map((key) => (key === 'Shift' ? '⇧' : key))
    .join(' ');
}
