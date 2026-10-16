import { describe, expect, it } from 'vitest';
import { isCommand } from './messages';

describe('isCommand', () => {
  it('accepts known commands', () => {
    expect(isCommand({ type: 'collapseAll' })).toBe(true);
    expect(isCommand({ type: 'sleepGroup', groupId: 'g1' })).toBe(true);
    expect(isCommand({ type: 'stowGroup', groupId: 'g1' })).toBe(true);
    expect(isCommand({ type: 'restoreGroup', groupId: 'g1' })).toBe(true);
    expect(isCommand({ type: 'restoreGroup', groupId: 'g1', mode: 'placeholder' })).toBe(true);
    expect(isCommand({ type: 'restoreGroup', groupId: 'g1', mode: 'background' })).toBe(true);
  });

  it('rejects unknown restore modes', () => {
    expect(isCommand({ type: 'restoreGroup', groupId: 'g1', mode: 'teleport' })).toBe(false);
    expect(isCommand({ type: 'stowGroup', groupId: 'g1', mode: 'placeholder' })).toBe(false);
  });

  it('rejects anything else', () => {
    expect(isCommand(null)).toBe(false);
    expect(isCommand('collapseAll')).toBe(false);
    expect(isCommand({ type: 'deleteEverything' })).toBe(false);
    expect(isCommand({ type: 'sleepGroup' })).toBe(false);
    expect(isCommand({ type: 'stowGroup', groupId: 42 })).toBe(false);
    expect(isCommand({ type: 'restoreGroup', groupId: '' })).toBe(false);
  });
});
