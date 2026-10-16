import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    // In-memory IndexedDB for Dexie tests.
    setupFiles: ['fake-indexeddb/auto'],
  },
});
