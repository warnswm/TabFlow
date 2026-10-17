import { describe, expect, it } from 'vitest';
import { formatShortcut, HOTKEYS, hotkeyCommand } from './hotkeys';
import { isCommand } from './messages';

describe('keyboard shortcuts', () => {
  it('suggests at most 4 keys, as Chrome allows', () => {
    const suggested = Object.values(HOTKEYS).filter((hotkey) => 'suggested_key' in hotkey);
    expect(suggested).toHaveLength(4);
    expect(HOTKEYS['collapse-all'].suggested_key.default).toBe('Ctrl+Shift+S');
  });

  it('runs a command for every shortcut except the popup and the side panel', () => {
    for (const name of Object.keys(HOTKEYS)) {
      const command = hotkeyCommand(name, 7);
      if (name === '_execute_action' || name === 'open-queue') expect(command).toBeUndefined();
      else expect(isCommand(command)).toBe(true);
    }
    expect(hotkeyCommand('stow-current', 7)).toEqual({ type: 'stowCurrent', chromeTabId: 7 });
    expect(hotkeyCommand('sleep-current')).toEqual({ type: 'sleepCurrent' });
    expect(hotkeyCommand('queue-current', 7)).toEqual({ type: 'queueTab', chromeTabId: 7 });
    expect(hotkeyCommand('unknown')).toBeUndefined();
  });

  it('formats a shortcut like the mockup', () => {
    expect(formatShortcut('Ctrl+Shift+S')).toBe('Ctrl ⇧ S');
    expect(formatShortcut('Alt+Shift+Z')).toBe('Alt ⇧ Z');
    expect(formatShortcut('⇧⌘S')).toBe('⇧⌘S');
    expect(formatShortcut('')).toBe('');
  });
});
