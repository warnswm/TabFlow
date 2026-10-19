import { afterEach, describe, expect, it } from 'vitest';
import { emptyFilterText, STATE_FILTERS } from '../app/filters';
import { describeBackup, hotkeyRows, sitePatternLabel } from '../app/settings-view';
import { shortDate, timeAgo } from '../app/time-format';
import { collapsedGroupTitle } from '../background/collapse';
import { dayGroupTitle } from '../background/quick-actions';
import { describeResponse } from '../command-messages';
import { buildMenu } from '../menus';
import type { CommandResponse } from '../messages';
import { FREE_TIME_SLOTS, formatMinutes, priorityList } from '../queue/plan';
import { badge, badgeModeLabel } from '../summary';
import {
  getLanguage,
  localized,
  onLanguageChange,
  parseLanguageSetting,
  resolveLanguage,
  setLanguage,
} from './index';
import { pluralEn, words } from './words';

const ok = (groups: number, tabs: number, failed = 0): CommandResponse => ({
  ok: true,
  result: { groups, tabs, failed, closedGroupIds: [] },
});

afterEach(() => setLanguage('ru'));

describe('interface language', () => {
  it('follows Chrome for «Как в Chrome»: Russian for Russian, English for the rest', () => {
    expect(resolveLanguage('auto', 'ru')).toBe('ru');
    expect(resolveLanguage('auto', 'ru-RU')).toBe('ru');
    expect(resolveLanguage('auto', 'en-US')).toBe('en');
    expect(resolveLanguage('auto', 'de')).toBe('en');
    expect(resolveLanguage('en', 'ru')).toBe('en');
    expect(resolveLanguage('ru', 'en-GB')).toBe('ru');
  });

  it('reads the stored setting, anything else is «Как в Chrome»', () => {
    expect(parseLanguageSetting('en')).toBe('en');
    expect(parseLanguageSetting('ru')).toBe('ru');
    expect(parseLanguageSetting('fr')).toBe('auto');
    expect(parseLanguageSetting(undefined)).toBe('auto');
  });

  it('switches the texts and tells the listeners once per change', () => {
    const text = localized({ ru: { hello: 'Привет' }, en: { hello: 'Hello' } });
    let calls = 0;
    const stop = onLanguageChange(() => calls++);

    setLanguage('en');
    setLanguage('en');

    expect(getLanguage()).toBe('en');
    expect(text().hello).toBe('Hello');
    expect(calls).toBe(1);
    stop();
    setLanguage('ru');
    expect(text().hello).toBe('Привет');
    expect(calls).toBe(1);
  });

  it('counts in English', () => {
    expect([0, 1, 2, 21].map((n) => pluralEn(n, ['tab', 'tabs']))).toEqual([
      'tabs',
      'tab',
      'tabs',
      'tabs',
    ]);
    setLanguage('en');
    expect(words().tabs(1)).toBe('1 tab');
    expect(words().videos(3)).toBe('3 videos');
    expect(words().quote('Study')).toBe('“Study”');
  });
});

describe('English texts', () => {
  it('describes command results in the brand voice', () => {
    setLanguage('en');
    expect(describeResponse('collapseAll', ok(2, 14))).toBe(
      'Collapsed: 2 groups · 14 tabs. Links are saved in Inbox.',
    );
    expect(describeResponse('stowGroup', ok(1, 12), 'Study')).toBe(
      '“Study” moved to TabFlow. 12 tabs saved.',
    );
    expect(describeResponse('sleepGroup', ok(1, 1), 'Study')).toBe(
      '“Study” is asleep — 1 tab. Tabs stay where they are.',
    );
    expect(describeResponse('restoreGroup', ok(1, 3, 2), 'Study')).toBe(
      '“Study” restored — 3 tabs. Couldn’t: 2 tabs — links are saved.',
    );
    expect(
      describeResponse('deleteGroup', { ok: false, code: 'space-protected', message: '' }),
    ).toBe('Inbox stays — collapsed tabs go there.');
  });

  it('names dates, times and groups', () => {
    const now = new Date(2026, 9, 19, 12, 0).getTime();
    setLanguage('en');
    expect(shortDate(new Date(2026, 9, 16).getTime(), now)).toBe('Oct 16');
    expect(shortDate(new Date(2025, 9, 16).getTime(), now)).toBe('Oct 16, 2025');
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(timeAgo(new Date(2026, 9, 16).getTime(), now)).toBe('3 days ago');
    expect(collapsedGroupTitle(new Date(2026, 9, 16, 9, 5).getTime())).toBe('Oct 16, 09:05');
    expect(dayGroupTitle(new Date(2026, 9, 17).getTime())).toBe('Oct 17 · saved for later');
  });

  it('shows the queue, the badge and the menu', () => {
    setLanguage('en');
    expect(formatMinutes(47 * 60)).toBe('47 min');
    expect(formatMinutes(220 * 60)).toBe('3 h 40 min');
    expect(priorityList([1, 2, 4])).toBe('#1, #2 and #4');
    expect(FREE_TIME_SLOTS.map((slot) => slot.label)).toEqual([
      '10 min',
      '20 min',
      '40 min',
      '1 h+',
    ]);
    expect(badge('today', [], 2)).toEqual({
      text: '',
      title: 'TabFlow\nQueue is empty\nStowed in TabFlow: 2 groups',
    });
    expect(badgeModeLabel('stowed')).toBe('Stowed groups');
    expect(buildMenu([], []).map((item) => item.title)).toEqual([
      'Stow in TabFlow',
      'Put group to sleep',
      'Add to watch-later queue',
      'Save link to TabFlow',
      'Add to watch-later queue',
      'Collapse all',
      'Open queue',
      'Open TabFlow',
    ]);
  });

  it('labels the filters and the settings page', () => {
    setLanguage('en');
    expect(STATE_FILTERS.map((chip) => chip.label)).toEqual(['All', 'Active', 'Asleep', 'Stowed']);
    expect(emptyFilterText('asleep', '')).toBe('No groups asleep.');
    expect(emptyFilterText('all', 'react')).toBe('Nothing found for “react”.');
    expect(hotkeyRows([])[0]?.description).toBe('Collapse all');
    expect(sitePatternLabel('*://*/*')).toBe('All sites');
    expect(
      describeBackup(
        { spaces: 1, groups: 2, tabs: 5, videos: 1, layouts: 0, exportedAt: 0 },
        Date.now(),
      ),
    ).toBe('Backup: 1 space · 2 groups · 5 links · 1 video.');
  });

  it('has the same words in both languages', () => {
    const ru = Object.keys(words()).sort();
    setLanguage('en');
    expect(Object.keys(words()).sort()).toEqual(ru);
  });
});
