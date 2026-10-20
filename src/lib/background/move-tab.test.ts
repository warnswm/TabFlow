import { beforeEach, describe, expect, it } from 'vitest';
import { undoCommands } from '../app/undo';
import type { BrowserTab } from '../browser-api';
import type { Command } from '../messages';
import {
  type BackgroundTestContext,
  expectOk,
  setupBackground,
  single,
} from '../testing/background';

const URL = (name: string) => `https://${name}.example/`;

describe('moveTab', () => {
  let t: BackgroundTestContext;

  beforeEach(async () => {
    t = setupBackground();
    await t.bg.start();
  });

  /** A native group mirrored into the database. */
  async function openGroup(title: string, names: string[], windowId?: number) {
    const chrome = t.api.addGroup(
      title,
      'blue',
      names.map((name) => ({ url: URL(name), title: name })),
      windowId,
    );
    await t.settle();
    const group = single((await t.groups.listAll()).filter((g) => g.title === title));
    return { group, ...chrome };
  }

  async function stowedGroup(title: string, names: string[]) {
    const { group } = await openGroup(title, names);
    expectOk(await t.command({ type: 'stowGroup', groupId: group.id }));
    return group;
  }

  async function titles(groupId: string) {
    return (await t.tabs.listByGroup(groupId)).map((tab) => tab.title);
  }

  async function link(groupId: string, title: string) {
    return single((await t.tabs.listByGroup(groupId)).filter((tab) => tab.title === title));
  }

  /** Titles of the Chrome tabs of a native group, in tab strip order. */
  async function chromeTitles(chromeGroupId: number) {
    return (await t.api.queryTabs({ groupId: chromeGroupId })).map((tab: BrowserTab) => tab.title);
  }

  async function run(command: Command) {
    return expectOk(await t.command(command));
  }

  it('reorders the links of a stowed group in the database only', async () => {
    const group = await stowedGroup('Статьи', ['a', 'b', 'c']);
    const c = await link(group.id, 'c');

    await run({ type: 'moveTab', tabId: c.id, groupId: group.id, index: 0 });

    expect(await titles(group.id)).toEqual(['c', 'a', 'b']);
    expect(t.api.allTabs().filter((tab) => tab.url.startsWith('https://'))).toEqual([]);
  });

  it('reorders the tabs of an open group on the tab strip as well', async () => {
    t.api.addTab({ url: 'https://other.example/', title: 'other' });
    const { group, groupId } = await openGroup('Работа', ['a', 'b', 'c', 'd']);

    await run({
      type: 'moveTab',
      tabId: (await link(group.id, 'd')).id,
      groupId: group.id,
      index: 1,
    });
    expect(await titles(group.id)).toEqual(['a', 'd', 'b', 'c']);
    expect(await chromeTitles(groupId)).toEqual(['a', 'd', 'b', 'c']);

    await run({
      type: 'moveTab',
      tabId: (await link(group.id, 'a')).id,
      groupId: group.id,
      index: 3,
    });
    expect(await chromeTitles(groupId)).toEqual(['d', 'b', 'c', 'a']);
    // The mirror agrees with the new order and keeps every link.
    expect(await titles(group.id)).toEqual(['d', 'b', 'c', 'a']);
  });

  it('moves an open tab into another open group, to the place of its link', async () => {
    const from = await openGroup('Из', ['a', 'b']);
    const to = await openGroup('В', ['x', 'y']);
    const a = await link(from.group.id, 'a');

    const result = await run({ type: 'moveTab', tabId: a.id, groupId: to.group.id, index: 1 });

    expect(result.movedFrom).toEqual({
      groupId: from.group.id,
      index: 0,
      groupDeleted: false,
      groupWasOnStrip: true,
    });
    expect(await titles(from.group.id)).toEqual(['b']);
    expect(await titles(to.group.id)).toEqual(['x', 'a', 'y']);
    expect(await chromeTitles(to.groupId)).toEqual(['x', 'a', 'y']);
    expect(await chromeTitles(from.groupId)).toEqual(['b']);
    // Same tab, nothing reopened.
    expect((await link(to.group.id, 'a')).chromeTabId).toBe(a.chromeTabId);
  });

  it('moves a tab into a group of another window', async () => {
    const from = await openGroup('Из', ['a', 'b']);
    const otherWindow = t.api.openWindow();
    const to = await openGroup('В', ['x'], otherWindow);
    const a = await link(from.group.id, 'a');

    await run({ type: 'moveTab', tabId: a.id, groupId: to.group.id, index: 1 });

    const moved = await t.api.getTab(a.chromeTabId ?? -1);
    expect(moved).toMatchObject({ windowId: otherWindow, groupId: to.groupId });
    expect(await chromeTitles(to.groupId)).toEqual(['x', 'a']);
    expect(await titles(to.group.id)).toEqual(['x', 'a']);
  });

  it('closes the tab when the link goes to a stowed group', async () => {
    const from = await openGroup('Из', ['a', 'b']);
    const to = await stowedGroup('Архив', ['x']);
    const a = await link(from.group.id, 'a');

    await run({ type: 'moveTab', tabId: a.id, groupId: to.id, index: 0 });

    expect(await titles(to.id)).toEqual(['a', 'x']);
    expect((await link(to.id, 'a')).chromeTabId).toBeUndefined();
    expect(await t.api.getTab(a.chromeTabId ?? -1)).toBeUndefined();
    expect(await titles(from.group.id)).toEqual(['b']);
    // The mirror does not send the moved link to the trash.
    expect((await t.trash.list()).tabs).toEqual([]);
  });

  it('opens the link in the group when it comes from a stowed group', async () => {
    const from = await stowedGroup('Архив', ['a', 'b']);
    const to = await openGroup('В', ['x', 'y']);
    const a = await link(from.id, 'a');

    const result = await run({ type: 'moveTab', tabId: a.id, groupId: to.group.id, index: 1 });

    expect(result).toMatchObject({ tabs: 1, failed: 0 });
    expect(await chromeTitles(to.groupId)).toEqual(['x', a.url, 'y']);
    await t.settle();
    const moved = await link(to.group.id, 'a');
    expect(moved.chromeTabId).toBeDefined();
    expect(await titles(to.group.id)).toEqual(['x', 'a', 'y']);
  });

  it('leaves the emptied group in the trash; undo brings everything back', async () => {
    const from = await openGroup('Одна', ['a']);
    const to = await openGroup('В', ['x']);
    const a = await link(from.group.id, 'a');
    const command: Command = { type: 'moveTab', tabId: a.id, groupId: to.group.id, index: 1 };

    const result = await run(command);

    expect(result).toMatchObject({ groups: 1, tabs: 1 });
    expect(await t.groups.get(from.group.id)).toBeUndefined();
    expect(single((await t.trash.list()).groups).id).toBe(from.group.id);
    expect(await t.api.getGroup(from.groupId)).toBeUndefined();
    expect(await titles(to.group.id)).toEqual(['x', 'a']);
    // The old native group is not mirrored again as a new group.
    expect((await t.groups.listAll()).map((g) => g.title)).toEqual(['В']);

    for (const undo of undoCommands(command, result, 'background') ?? []) await run(undo);

    const back = await t.groups.get(from.group.id);
    expect(back).toMatchObject({ title: 'Одна', state: 'active' });
    expect(await titles(from.group.id)).toEqual(['a']);
    expect(await titles(to.group.id)).toEqual(['x']);
    expect((await t.trash.list()).groups).toEqual([]);
  });

  it('does not empty a group protected from deletion', async () => {
    const from = await stowedGroup('Одна', ['a']);
    const to = await stowedGroup('В', ['x']);
    await t.groups.update(from.id, { locked: true });
    const a = await link(from.id, 'a');

    const response = await t.command({ type: 'moveTab', tabId: a.id, groupId: to.id, index: 1 });

    expect(response).toMatchObject({ ok: false, code: 'group-locked' });
    expect(await titles(from.id)).toEqual(['a']);
  });

  it('undo of a simple move puts the link back to its place', async () => {
    const from = await stowedGroup('Из', ['a', 'b', 'c']);
    const to = await stowedGroup('В', ['x']);
    const b = await link(from.id, 'b');
    const command: Command = { type: 'moveTab', tabId: b.id, groupId: to.id, index: 0 };

    const undo = undoCommands(command, await run(command), 'placeholder');
    expect(undo).toEqual([{ type: 'moveTab', tabId: b.id, groupId: from.id, index: 1 }]);
    expect(await titles(to.id)).toEqual(['b', 'x']);

    for (const back of undo ?? []) await run(back);
    expect(await titles(from.id)).toEqual(['a', 'b', 'c']);
    expect(await titles(to.id)).toEqual(['x']);
  });

  it('rejects a missing link or group', async () => {
    const group = await stowedGroup('Статьи', ['a']);
    const response = await t.command({
      type: 'moveTab',
      tabId: 'missing',
      groupId: group.id,
      index: 0,
    });
    expect(response).toMatchObject({ ok: false, code: 'tab-not-found' });
    const a = await link(group.id, 'a');
    expect(
      await t.command({ type: 'moveTab', tabId: a.id, groupId: 'missing', index: 0 }),
    ).toMatchObject({ ok: false, code: 'group-not-found' });
  });
});
