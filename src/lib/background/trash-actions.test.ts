import { beforeEach, describe, expect, it } from 'vitest';
import { FAKE_APP_PAGE_URL } from '../testing/fake-tabs-api';
import {
  type BackgroundTestContext,
  expectOk,
  setupBackground,
  single,
} from '../testing/background';

const YT = (n: number) => `https://www.youtube.com/watch?v=${n}`;

describe('delete and restore', () => {
  let t: BackgroundTestContext;

  beforeEach(async () => {
    t = setupBackground();
    await t.bg.start();
  });

  /** A native group next to an ungrouped tab, mirrored into the database. */
  async function openGroup(title = 'Покупки', urls = [YT(1), YT(2), YT(3)]) {
    const other = t.api.addTab({ url: 'https://example.com/' });
    const chrome = t.api.addGroup(
      title,
      'pink',
      urls.map((url) => ({ url })),
    );
    await t.settle();
    const group = single((await t.groups.listAll()).filter((g) => g.title === title));
    return { group, other, ...chrome };
  }

  async function stowedGroup(title = 'Статьи', urls = [YT(1), YT(2)]) {
    const { group } = await openGroup(title, urls);
    expectOk(await t.command({ type: 'stowGroup', groupId: group.id }));
    return group;
  }

  describe('deleteGroup', () => {
    it('moves a stowed group with its links to the trash', async () => {
      const group = await stowedGroup();

      const result = expectOk(await t.command({ type: 'deleteGroup', groupId: group.id }));

      expect(result).toMatchObject({ groups: 1, tabs: 2, closedGroupIds: [] });
      expect(await t.groups.listAll()).toEqual([]);
      const trash = await t.trash.list();
      expect(trash.groups.map((g) => g.id)).toEqual([group.id]);
      expect(trash.tabs).toHaveLength(2);
    });

    it('saves an open group to the trash first, then closes its tabs', async () => {
      const { group, groupId, other } = await openGroup();

      const result = expectOk(await t.command({ type: 'deleteGroup', groupId: group.id }));

      expect(result).toMatchObject({ groups: 1, tabs: 3, closedGroupIds: [group.id] });
      expect(await t.api.getGroup(groupId)).toBeUndefined();
      expect(t.api.allTabs().map((tab) => tab.id)).toEqual([other.id]);
      // The mirror neither brings it back nor creates a new group for the closed tabs.
      expect(await t.groups.listAll()).toEqual([]);
      const trashed = single((await t.trash.list()).groups);
      expect(trashed).toMatchObject({ id: group.id, state: 'stowed' });
      expect(trashed.chromeGroupId).toBeUndefined();
      expect((await t.trash.list()).tabs.map((tab) => tab.url).sort()).toEqual(
        [YT(1), YT(2), YT(3)].sort(),
      );
    });

    it('undo puts a closed group back on the tab strip', async () => {
      const { group } = await openGroup();
      const deleted = expectOk(await t.command({ type: 'deleteGroup', groupId: group.id }));

      expectOk(
        await t.command({
          type: 'restoreDeleted',
          kind: 'group',
          id: group.id,
          reopenGroupIds: deleted.closedGroupIds,
        }),
      );

      const restored = single(await t.groups.listAll());
      expect(restored).toMatchObject({ id: group.id, state: 'active', title: 'Покупки' });
      expect(await t.api.getGroup(restored.chromeGroupId ?? -1)).toMatchObject({
        title: 'Покупки',
        color: 'pink',
      });
      expect(await t.tabs.listByGroup(group.id)).toHaveLength(3);
      expect((await t.trash.list()).tabs).toEqual([]);
    });
  });

  describe('deleteSpace', () => {
    it('never deletes «Входящие»', async () => {
      const inbox = await t.spaces.ensureDefault();

      const response = await t.command({ type: 'deleteSpace', spaceId: inbox.id });

      expect(response).toMatchObject({ ok: false, code: 'space-protected' });
      expect(await t.spaces.get(inbox.id)).toBeDefined();
    });

    it('moves the space with all its groups to the trash and closes the open ones', async () => {
      const work = await t.spaces.create('Работа');
      const stowed = await stowedGroup('Статьи', [YT(5)]);
      const { group: open, other } = await openGroup('Покупки', [YT(1), YT(2)]);
      await t.groups.move(stowed.id, work.id);
      await t.groups.move(open.id, work.id);

      const result = expectOk(await t.command({ type: 'deleteSpace', spaceId: work.id }));

      expect(result).toMatchObject({ groups: 2, tabs: 3, closedGroupIds: [open.id] });
      expect(await t.spaces.get(work.id)).toBeUndefined();
      expect(await t.groups.listAll()).toEqual([]);
      expect(t.api.allGroups()).toEqual([]);
      expect(t.api.allTabs().map((tab) => tab.id)).toContain(other.id);
      // One deletedAt for the whole space, so restoring it brings everything back.
      const trash = await t.trash.list();
      expect(new Set([...trash.spaces, ...trash.groups].map((r) => r.deletedAt)).size).toBe(1);
    });

    it('undo restores the space and reopens the groups it closed', async () => {
      const work = await t.spaces.create('Работа');
      const stowed = await stowedGroup('Статьи', [YT(5)]);
      const { group: open } = await openGroup('Покупки', [YT(1), YT(2)]);
      await t.groups.move(stowed.id, work.id);
      await t.groups.move(open.id, work.id);
      const deleted = expectOk(await t.command({ type: 'deleteSpace', spaceId: work.id }));

      expectOk(
        await t.command({
          type: 'restoreDeleted',
          kind: 'space',
          id: work.id,
          reopenGroupIds: deleted.closedGroupIds,
        }),
      );

      expect(await t.spaces.get(work.id)).toBeDefined();
      const groups = await t.groups.listBySpace(work.id);
      expect(groups.map((g) => [g.title, g.state])).toEqual([
        ['Статьи', 'stowed'],
        ['Покупки', 'active'],
      ]);
      expect(single(t.api.allGroups()).title).toBe('Покупки');
    });
  });

  describe('deleteTab', () => {
    it('moves a link of a stowed group to the trash and restores it', async () => {
      const group = await stowedGroup();
      const [first] = await t.tabs.listByGroup(group.id);

      expectOk(await t.command({ type: 'deleteTab', tabId: first?.id ?? '' }));
      expect((await t.tabs.listByGroup(group.id)).map((tab) => tab.url)).toEqual([YT(2)]);

      expectOk(await t.command({ type: 'restoreDeleted', kind: 'tab', id: first?.id ?? '' }));
      expect((await t.tabs.listByGroup(group.id)).map((tab) => tab.url)).toEqual([YT(2), YT(1)]);
    });

    it('the last link takes its group along', async () => {
      const group = await stowedGroup('Одна', [YT(1)]);
      const tab = single(await t.tabs.listByGroup(group.id));

      const result = expectOk(await t.command({ type: 'deleteTab', tabId: tab.id }));

      expect(result.groups).toBe(1);
      expect(await t.groups.listAll()).toEqual([]);
      expect(single((await t.trash.list()).groups).id).toBe(group.id);
    });

    it('undo of the last link of an open group puts the group back on the strip', async () => {
      const { group } = await openGroup('Одна', [YT(1)]);
      const tab = single(await t.tabs.listByGroup(group.id));
      const deleted = expectOk(await t.command({ type: 'deleteTab', tabId: tab.id }));
      expect(deleted.closedGroupIds).toEqual([group.id]);

      expectOk(
        await t.command({
          type: 'restoreDeleted',
          kind: 'tab',
          id: tab.id,
          reopenGroupIds: deleted.closedGroupIds,
        }),
      );

      expect(single(await t.groups.listAll())).toMatchObject({ id: group.id, state: 'active' });
      expect(single(t.api.allGroups()).title).toBe('Одна');
    });

    it('closes the tab of an open group; restoring opens it in the group again', async () => {
      const { group, groupId, tabs } = await openGroup();
      const saved = await t.tabs.listByGroup(group.id);
      const second = saved[1];
      if (!second) throw new Error('expected three saved tabs');

      expectOk(await t.command({ type: 'deleteTab', tabId: second.id }));

      expect((await t.api.queryTabs({ groupId })).map((tab) => tab.url)).toEqual([YT(1), YT(3)]);
      expect(await t.api.getTab(tabs[1]?.id ?? -1)).toBeUndefined();
      expect((await t.tabs.listByGroup(group.id)).map((tab) => tab.url)).toEqual([YT(1), YT(3)]);

      expectOk(await t.command({ type: 'restoreDeleted', kind: 'tab', id: second.id }));

      // The link is open in the group and stays saved after the mirror syncs.
      expect((await t.api.queryTabs({ groupId })).map((tab) => tab.url)).toEqual([
        YT(1),
        YT(3),
        YT(2),
      ]);
      expect((await t.tabs.listByGroup(group.id)).map((tab) => tab.url)).toEqual([
        YT(1),
        YT(3),
        YT(2),
      ]);
      expect((await t.trash.list()).tabs).toEqual([]);
    });
  });

  it('refuses to restore what is not in the trash', async () => {
    const group = await stowedGroup();

    const response = await t.command({ type: 'restoreDeleted', kind: 'group', id: group.id });

    expect(response).toMatchObject({ ok: false, code: 'not-in-trash' });
  });

  describe('editGroup', () => {
    it('renames and recolors an open group in Chrome too', async () => {
      const { group, groupId } = await openGroup();

      expectOk(
        await t.command({ type: 'editGroup', groupId: group.id, title: ' Подарки ', color: 'red' }),
      );

      expect(await t.api.getGroup(groupId)).toMatchObject({ title: 'Подарки', color: 'red' });
      expect(await t.groups.get(group.id)).toMatchObject({ title: 'Подарки', color: 'red' });
    });

    it('changes only the record of a stowed group', async () => {
      const group = await stowedGroup();

      expectOk(await t.command({ type: 'editGroup', groupId: group.id, color: 'green' }));

      expect(await t.groups.get(group.id)).toMatchObject({ title: 'Статьи', color: 'green' });
    });
  });

  describe('openTab', () => {
    it('shows the open tab of a group on the tab strip', async () => {
      const { group, tabs } = await openGroup();
      const [, second] = await t.tabs.listByGroup(group.id);

      expectOk(await t.command({ type: 'openTab', tabId: second?.id ?? '' }));

      expect(t.api.allTabs().find((tab) => tab.active)?.id).toBe(tabs[1]?.id);
    });

    it('opens a link of a stowed group in a new tab, the group stays stowed', async () => {
      const group = await stowedGroup();
      const [first] = await t.tabs.listByGroup(group.id);

      expectOk(await t.command({ type: 'openTab', tabId: first?.id ?? '' }));

      const opened = t.api.allTabs().filter((tab) => tab.url !== FAKE_APP_PAGE_URL);
      expect(opened.map((tab) => tab.url)).toContain(YT(1));
      expect((await t.groups.get(group.id))?.state).toBe('stowed');
    });
  });
});
