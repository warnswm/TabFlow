import { describe, expect, it } from 'vitest';
import { type BrowserTab, NO_GROUP } from '../browser-api';
import type { SavedTab, TabGroup } from '../db/models';
import { findDuplicates } from './duplicates';

const NOW = Date.UTC(2026, 9, 20, 12);
const MIN = 60_000;

function tab(id: number, patch: Partial<BrowserTab> = {}): BrowserTab {
  return {
    id,
    windowId: 1,
    index: id,
    url: `https://site${id}.example/`,
    committed: true,
    loaded: true,
    hasIcon: true,
    placeholder: false,
    title: `Tab ${id}`,
    pinned: false,
    active: false,
    highlighted: false,
    discarded: false,
    groupId: NO_GROUP,
    lastAccessed: NOW - 60 * MIN,
    audible: false,
    autoDiscardable: true,
    ...patch,
  };
}

function group(id: string, patch: Partial<TabGroup> = {}): TabGroup {
  return {
    id,
    spaceId: 'inbox',
    title: id,
    color: 'blue',
    state: 'active',
    order: 1,
    createdAt: NOW - 600 * MIN,
    updatedAt: NOW - 600 * MIN,
    ...patch,
  };
}

function link(id: string, groupId: string, url: string, patch: Partial<SavedTab> = {}): SavedTab {
  return {
    id,
    groupId,
    url,
    title: id,
    order: 1,
    pinned: false,
    createdAt: NOW - 100 * MIN,
    updatedAt: NOW - 100 * MIN,
    ...patch,
  };
}

describe('duplicates of a group protected from deletion', () => {
  it('keeps tabs and links of a group protected from deletion', () => {
    const groups = [
      group('locked', { chromeGroupId: 10, locked: true }),
      group('a', { state: 'stowed' }),
      group('safe', { state: 'stowed', locked: true }),
    ];
    const links = [
      link('l-tab', 'locked', 'https://t.example/', { chromeTabId: 2 }),
      link('x-old', 'a', 'https://x.example/', { createdAt: NOW - 500 * MIN }),
      link('x-safe', 'safe', 'https://x.example/'),
      link('y-safe', 'safe', 'https://y.example/'),
      link('y-safe-2', 'safe', 'https://y.example/#2'),
    ];
    const tabs = [
      tab(1, { url: 'https://t.example/', lastAccessed: NOW }),
      tab(2, { url: 'https://t.example/', groupId: 10 }),
      tab(3, { url: 'https://t.example/', groupId: 10 }),
    ];
    const found = findDuplicates(tabs, groups, links);

    // The loose tab goes; the tab of the protected group stays, the other one is not its link.
    expect(found.tabs[0]?.keep).toMatchObject({ chromeTabId: 2 });
    expect(found.tabs[0]?.extras.map((item) => item.kind === 'tab' && item.chromeTabId)).toEqual([
      1, 3,
    ]);
    // The protected link stays, the other copy goes; two protected copies both stay.
    expect(
      found.links.map((set) => [
        set.keep.kind === 'link' && set.keep.linkId,
        set.extras.map((item) => item.kind === 'link' && item.linkId),
      ]),
    ).toEqual([['x-safe', ['x-old']]]);
  });
});
