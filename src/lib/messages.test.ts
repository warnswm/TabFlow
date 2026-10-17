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

  it('accepts the stage 5 commands and rejects malformed ones', () => {
    expect(isCommand({ type: 'stowCurrent' })).toBe(true);
    expect(isCommand({ type: 'stowCurrent', chromeTabId: 12 })).toBe(true);
    expect(isCommand({ type: 'sleepCurrent', chromeTabId: 0 })).toBe(true);
    expect(isCommand({ type: 'sleepInactive' })).toBe(true);
    expect(isCommand({ type: 'stowSelected' })).toBe(true);
    expect(isCommand({ type: 'saveToGroup', chromeTabId: 12, groupId: 'g1' })).toBe(true);
    expect(isCommand({ type: 'saveLink', url: 'https://a.example/' })).toBe(true);
    expect(isCommand({ type: 'saveLink', url: 'https://a.example/', groupId: 'g1' })).toBe(true);
    expect(isCommand({ type: 'openApp' })).toBe(true);

    expect(isCommand({ type: 'stowCurrent', chromeTabId: -1 })).toBe(false);
    expect(isCommand({ type: 'stowCurrent', chromeTabId: '12' })).toBe(false);
    expect(isCommand({ type: 'saveToGroup', groupId: 'g1' })).toBe(false);
    expect(isCommand({ type: 'saveLink', url: '' })).toBe(false);
    expect(isCommand({ type: 'saveLink', url: 'https://a.example/', groupId: 3 })).toBe(false);
  });

  it('rejects unknown restore modes', () => {
    expect(isCommand({ type: 'restoreGroup', groupId: 'g1', mode: 'teleport' })).toBe(false);
    expect(isCommand({ type: 'stowGroup', groupId: 'g1', mode: 'placeholder' })).toBe(false);
  });

  it('accepts the queue commands and video reports, rejects malformed ones', () => {
    expect(isCommand({ type: 'queueTab' })).toBe(true);
    expect(isCommand({ type: 'queueLink', url: 'https://a.example/v' })).toBe(true);
    expect(isCommand({ type: 'moveVideo', itemId: 'v1', index: 0 })).toBe(true);
    expect(isCommand({ type: 'setWatched', itemId: 'v1', watched: true })).toBe(true);
    expect(isCommand({ type: 'setWatched', itemId: 'v1' })).toBe(false);
    expect(isCommand({ type: 'moveVideo', itemId: 'v1', index: -1 })).toBe(false);
    expect(isCommand({ type: 'queueLink', url: '' })).toBe(false);

    const report = { type: 'videoProgress', positionSec: 12, durationSec: 600 };
    expect(isCommand(report)).toBe(true);
    expect(isCommand({ ...report, loaded: true, title: 'Видео', channel: 'Канал' })).toBe(true);
    expect(isCommand({ ...report, playerOrigins: ['https://player.vimeo.com'] })).toBe(true);
    expect(isCommand({ ...report, positionSec: Number.NaN })).toBe(false);
    expect(isCommand({ ...report, durationSec: 0 })).toBe(false);
    expect(isCommand({ ...report, playerOrigins: ['javascript:alert(1)'] })).toBe(false);
    expect(isCommand({ ...report, title: 'x'.repeat(501) })).toBe(false);
    expect(isCommand({ ...report, tabId: 5 })).toBe(false);
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
