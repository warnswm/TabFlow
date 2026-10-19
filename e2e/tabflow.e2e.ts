import {
  badgeText,
  type Chrome,
  command,
  expect,
  openSiteTabs,
  SITE,
  tabUrls,
  test,
} from './fixtures';

const siteTabs = async (page: Parameters<typeof tabUrls>[0]) =>
  (await tabUrls(page)).filter((url) => url.startsWith(SITE));

test('«Свернуть всё» убирает вкладки в TabFlow, «Вернуть» открывает группу снова', async ({
  openPage,
}) => {
  const app = await openPage('app.html');
  await openSiteTabs(app, ['/page/1', '/page/2']);

  await app.getByRole('button', { name: 'Свернуть всё' }).click();

  await expect(app.getByText(/^Свёрнуто: 1 группа · 2 вкладки/)).toBeVisible();
  expect(await siteTabs(app)).toEqual([]);
  await expect(app.getByRole('button', { name: 'Вернуть', exact: true })).toBeVisible();

  await app.getByRole('button', { name: 'Вернуть', exact: true }).click();

  await expect(app.getByText(/восстановлена — 2 вкладки/)).toBeVisible();
  const groups = await app.evaluate(async () => {
    const chrome = (globalThis as unknown as { chrome: Chrome }).chrome;
    const [group, ...rest] = await chrome.tabGroups.query({});
    const tabs = group ? await chrome.tabs.query({ groupId: group.id }) : [];
    return { count: rest.length + (group ? 1 : 0), tabs: tabs.length };
  });
  expect(groups).toEqual({ count: 1, tabs: 2 });
});

test('видео из очереди видно в боковой панели и на значке', async ({ openPage }) => {
  const app = await openPage('app.html');

  await command(app, { type: 'queueLink', url: `${SITE}/video/1`, title: 'Видео 1' });

  await expect.poll(() => badgeText(app)).toBe('1');
  const panel = await openPage('sidepanel.html');
  await expect(panel.getByText('Видео 1').first()).toBeVisible();
  await expect(app.getByText('Видео 1').first()).toBeVisible();
});

test('настройки: сочетания клавиш и число на значке', async ({ openPage }) => {
  const settings = await openPage('options.html');

  await expect(settings).toHaveURL(/\/app\.html#\/settings$/);
  await expect(settings.getByRole('heading', { name: 'Настройки', level: 1 })).toBeVisible();
  await expect(settings.getByText('Ctrl ⇧ S')).toBeVisible();

  await command(settings, { type: 'queueLink', url: `${SITE}/video/2`, title: 'Видео 2' });
  await expect.poll(() => badgeText(settings)).toBe('1');

  await settings.getByRole('radio', { name: /Убранные группы/ }).check();

  await expect.poll(() => badgeText(settings)).toBe('');
});

test('экспорт в файл и импорт обратно: «Заменить», «Отменить», «Добавить»', async ({
  openPage,
}) => {
  const app = await openPage('app.html');
  await openSiteTabs(app, ['/page/1', '/page/2']);
  await app.getByRole('button', { name: 'Свернуть всё' }).click();
  await expect(app.getByText(/^Свёрнуто/)).toBeVisible();
  await app.getByRole('link', { name: 'Настройки' }).click();

  const download = app.waitForEvent('download');
  await app.getByRole('button', { name: 'Экспорт в файл' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^tabflow-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await file.path();

  // TabFlow is not empty: the dialog asks every time.
  await app.getByLabel('Файл копии TabFlow').setInputFiles(path);
  const dialog = app.getByRole('dialog', { name: 'Импорт копии' });
  await expect(dialog).toContainText('1 группа · 2 ссылки');
  await dialog.getByRole('button', { name: 'Заменить' }).click();
  await expect(
    app.getByText(
      'Импортировано: 1 группа · 2 ссылки. Группы убраны в TabFlow. Прежние данные — в корзине на 30 дней.',
    ),
  ).toBeVisible();

  await app.getByRole('button', { name: 'Отменить' }).click();
  await expect(app.getByText('Отменено.')).toBeVisible();

  await app.getByLabel('Файл копии TabFlow').setInputFiles(path);
  await dialog.getByRole('button', { name: 'Добавить' }).click();
  await expect(app.getByText('Новых данных в копии нет. Уже были в TabFlow: 1.')).toBeVisible();

  await app.getByRole('link', { name: 'Корзина' }).click();
  await expect(app.getByText('Корзина пуста.')).toBeVisible();
});

test('файл не копии TabFlow не меняет данные', async ({ openPage }) => {
  const app = await openPage('app.html#/settings');

  await app.getByLabel('Файл копии TabFlow').setInputFiles({
    name: 'onetab.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('https://example.com | Example'),
  });

  await expect(
    app.getByText('Файл не прочитан — это не копия TabFlow. Данные TabFlow не изменились.'),
  ).toBeVisible();
});

test('язык: English на странице настроек меняет интерфейс, меню и «Входящие»', async ({
  openPage,
}) => {
  const app = await openPage('app.html#/settings');
  await expect(app.getByRole('radio', { name: /Как в Chrome/ })).toBeChecked();
  await expect(app.getByRole('link', { name: 'Входящие' })).toBeVisible();

  await app.getByRole('radio', { name: 'English', exact: true }).check();

  await expect(app.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(app.getByRole('link', { name: 'Inbox' })).toBeVisible();
  await expect(app.getByRole('radio', { name: 'English', exact: true })).toBeChecked();
  await expect
    .poll(() =>
      app.evaluate(async () => {
        const chrome = (globalThis as unknown as { chrome: Chrome }).chrome;
        return chrome.action.getTitle({});
      }),
    )
    .toBe('TabFlow\nQueue is empty');

  // Another page opens in the chosen language too.
  const popup = await openPage('popup.html');
  await expect(popup.getByRole('button', { name: 'Collapse all' })).toBeVisible();

  await app.getByRole('radio', { name: 'Русский', exact: true }).check();
  await expect(app.getByRole('heading', { name: 'Настройки', level: 1 })).toBeVisible();
  await expect(app.getByRole('link', { name: 'Входящие' })).toBeVisible();
});
