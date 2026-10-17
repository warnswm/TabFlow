import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';
import { HOTKEYS } from './src/lib/hotkeys';

// https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  // Explicit imports only: every symbol is imported where it is used.
  imports: false,
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'TabFlow',
    description: 'Менеджер вкладок: группы на виду, но не в памяти.',
    // tabs — адреса и заголовки вкладок; tabGroups — нативные группы; storage — метка сессии браузера;
    // favicon — иконки сайтов из кэша Chrome (заглушки, плитки); contextMenus — меню «TabFlow ▸»;
    // sidePanel — очередь в боковой панели; scripting — content script видеосайтов
    // (всё без предупреждения при установке).
    permissions: [
      'tabs',
      'tabGroups',
      'storage',
      'favicon',
      'contextMenus',
      'sidePanel',
      'scripting',
    ],
    // Доступа к сайтам при установке нет: когда в очередь попадает видео нового сайта, Chrome
    // спрашивает доступ к этому сайту (длительность и позиция видео — `queue/site-access.ts`).
    optional_host_permissions: ['*://*/*'],
    action: {
      default_title: 'TabFlow',
    },
    commands: HOTKEYS,
  },
});
