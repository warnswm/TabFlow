import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n';
import {
  type BackgroundTestContext,
  expectOk,
  setupBackground,
  single,
} from '../testing/background';

describe('interface language in the background', () => {
  let t: BackgroundTestContext;

  beforeEach(async () => {
    t = setupBackground();
    await t.bg.start();
  });

  afterEach(() => setLanguage('ru'));

  it('names «Входящие», the menu and new groups in the chosen language', async () => {
    await t.spaces.ensureDefault();
    t.settings.lang = 'en';

    await t.bg.followLanguage();

    expect(single(await t.spaces.list()).name).toBe('Inbox');
    expect(t.ui.menu.map((item) => item.title)).toContain('Collapse all');
    expect(t.ui.badge.title).toBe('TabFlow\nQueue is empty');

    t.api.addTab({ url: 'https://example.com/a' });
    t.api.addTab({ url: 'https://example.com/b' });
    await t.settle();
    const result = expectOk(await t.command({ type: 'collapseAll' }));
    expect(result.groups).toBe(1);
    expect(single(await t.groups.listAll()).title).toMatch(/^[A-Z][a-z]{2} \d+, \d\d:\d\d$/);
  });

  it('starts in the stored language and switches back', async () => {
    t.settings.lang = 'en';
    await t.restartBrowser();
    await t.spaces.ensureDefault();
    expect(single(await t.spaces.list()).name).toBe('Inbox');

    t.settings.lang = 'ru';
    await t.bg.followLanguage();

    expect(single(await t.spaces.list()).name).toBe('Входящие');
    expect(t.ui.menu.map((item) => item.title)).toContain('Свернуть всё');
  });

  it('keeps a renamed default space as it is', async () => {
    const inbox = await t.spaces.ensureDefault();
    await t.spaces.rename(inbox.id, 'Разное');
    t.settings.lang = 'en';

    await t.bg.followLanguage();

    expect(single(await t.spaces.list()).name).toBe('Разное');
  });
});
