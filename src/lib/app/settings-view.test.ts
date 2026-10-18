import { describe, expect, it } from 'vitest';
import { describeBackup, hotkeyRows, siteAccessRows, sitePatternLabel } from './settings-view';

describe('settings page', () => {
  it('lists shortcuts in manifest order with the keys Chrome has', () => {
    const rows = hotkeyRows([
      { name: 'open-app', shortcut: 'Alt+Shift+M' },
      { name: 'collapse-all', shortcut: 'Ctrl+Shift+S' },
    ]);

    expect(rows[0]).toEqual({
      name: 'collapse-all',
      description: 'Свернуть всё',
      shortcut: 'Ctrl+Shift+S',
    });
    expect(rows.find((row) => row.name === 'open-queue')?.shortcut).toBe('');
    expect(rows.map((row) => row.name)).toContain('_execute_action');
  });

  it.each([
    ['*://*.youtube.com/*', 'youtube.com'],
    ['https://www.example.com/*', 'www.example.com'],
    ['*://*/*', 'Все сайты'],
    ['<all_urls>', 'Все сайты'],
    ['file:///*', 'Локальные файлы'],
    ['*://192.168.0.1/*', '192.168.0.1'],
  ])('names the site of %s', (pattern, label) => {
    expect(sitePatternLabel(pattern)).toBe(label);
  });

  it('sorts sites by name without repeats', () => {
    expect(
      siteAccessRows(['*://*.youtube.com/*', '*://*.vk.com/*', '*://*.youtube.com/*']).map(
        (row) => row.label,
      ),
    ).toEqual(['vk.com', 'youtube.com']);
  });

  it('describes a backup before the import', () => {
    const now = new Date(2026, 9, 19).getTime();
    expect(
      describeBackup(
        { spaces: 2, groups: 12, tabs: 140, videos: 8, layouts: 1, exportedAt: now },
        now,
      ),
    ).toBe('Копия от 19 окт: 2 пространства · 12 групп · 140 ссылок · 8 видео · 1 раскладка.');
    expect(
      describeBackup({ spaces: 0, groups: 1, tabs: 1, videos: 0, layouts: 0, exportedAt: 0 }, now),
    ).toBe('Копия: 1 группа · 1 ссылка.');
  });
});
