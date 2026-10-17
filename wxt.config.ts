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
    // favicon — иконки сайтов из кэша Chrome (заглушки, плитки); contextMenus — меню «TabFlow ▸»
    // (без предупреждения при установке).
    permissions: ['tabs', 'tabGroups', 'storage', 'favicon', 'contextMenus'],
    action: {
      default_title: 'TabFlow',
    },
    commands: HOTKEYS,
  },
});
