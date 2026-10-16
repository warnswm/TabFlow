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

  it('accepts the stage 3 commands', () => {
    expect(isCommand({ type: 'editGroup', groupId: 'g1', title: 'Учёба' })).toBe(true);
    expect(isCommand({ type: 'editGroup', groupId: 'g1', color: 'blue' })).toBe(true);
    expect(isCommand({ type: 'deleteGroup', groupId: 'g1' })).toBe(true);
    expect(isCommand({ type: 'deleteSpace', spaceId: 's1' })).toBe(true);
    expect(isCommand({ type: 'deleteTab', tabId: 't1' })).toBe(true);
    expect(isCommand({ type: 'openTab', tabId: 't1' })).toBe(true);
    expect(isCommand({ type: 'restoreDeleted', kind: 'space', id: 's1' })).toBe(true);
    expect(
      isCommand({ type: 'restoreDeleted', kind: 'group', id: 'g1', reopenGroupIds: ['g1'] }),
    ).toBe(true);
  });

  it('rejects malformed stage 3 commands', () => {
    expect(isCommand({ type: 'editGroup', groupId: 'g1', color: 'teal' })).toBe(false);
    expect(isCommand({ type: 'editGroup', groupId: 'g1', title: 7 })).toBe(false);
    expect(isCommand({ type: 'deleteSpace', groupId: 'g1' })).toBe(false);
    expect(isCommand({ type: 'restoreDeleted', kind: 'queue', id: 'q1' })).toBe(false);
    expect(isCommand({ type: 'restoreDeleted', kind: 'tab', id: 't1', reopenGroupIds: [1] })).toBe(
      false,
    );
    expect(isCommand({ type: 'toString' })).toBe(false);
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
