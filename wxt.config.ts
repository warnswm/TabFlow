import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

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
    action: {
      default_title: 'TabFlow',
    },
  },
});
