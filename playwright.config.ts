import { defineConfig } from '@playwright/test';

/**
 * E2E tests with the built extension loaded into Playwright's Chromium (Chrome 155 ignores
 * `--load-extension`). `pnpm e2e` builds first; the sites the tests open come from `e2e/site.mjs`.
 */
export const SITE_PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  // One browser with the extension at a time: the tests share nothing but the machine.
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  webServer: {
    command: `node e2e/site.mjs ${SITE_PORT}`,
    url: `http://127.0.0.1:${SITE_PORT}/page/1`,
    reuseExistingServer: true,
  },
});
