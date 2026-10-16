import { defineConfig, devices } from '@playwright/test';

// E2E tests on their own servers and their own database. `e2e/backend.mjs`
// migrates and seeds a fresh SQLite file and serves it on 8001; vite runs on
// 5174 and the production preview on 4174, both pointed at it. None of these
// is ever reused, so a developer's servers on 8000 and 5173, and the database
// behind them, are never touched.
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node e2e/backend.mjs',
      // An unauthenticated GET here answers 401, which Playwright takes as up.
      url: 'http://localhost:8001/api/v1/tickets/',
      reuseExistingServer: false,
      timeout: 300_000,
    },
    {
      command: 'npm run dev -- --port 5174 --strictPort',
      url: 'http://localhost:5174',
      env: { VITE_API_URL_DEV: 'http://localhost:8001/api/v1' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // The built bundle, for installable.spec.ts: the service worker and the
      // manifest exist only in a production build.
      command: 'npm run build && npm run preview -- --port 4174 --strictPort',
      url: 'http://localhost:4174',
      env: { PREVIEW_API: 'http://localhost:8001', PREVIEW_ORIGIN: 'http://localhost:4174' },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
