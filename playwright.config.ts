import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3000);
export const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './test/e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },

  // Same constraint as the API suite: one SQLite file and one in-memory recorder,
  // both reset by POST /test/reset. Parallel workers would reset each other's
  // state mid-test, so the suite runs serially.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // CI gets inline PR annotations (github) and a machine-readable result
  // (junit) for any reporting integration; local runs stay terse.
  reporter: process.env.CI
    ? [
        ['github'],
        ['junit', { outputFile: 'playwright-report/results.xml' }],
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
      ]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Unlike the API suite, the browser needs a real listening port, so Playwright
  // starts the app itself. reuseExistingServer keeps a dev server already on 3000
  // from being fought over locally, while CI always starts clean.
  webServer: {
    command: 'npm start',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
