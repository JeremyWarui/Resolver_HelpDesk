import { defineConfig, devices } from '@playwright/test';

// E2E smoke tests. Both servers are started automatically (and reused when
// already running): the Django backend from the sibling django_resolver repo
// and the vite dev server. The backend talks to the shared dev database, so
// specs must be self-cleaning (create → verify → delete) and run serially.
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000, // remote Neon DB — cold requests can be slow
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: '.venv/bin/python manage.py runserver 8000',
      cwd: '../../django_resolver',
      url: 'http://localhost:8000/admin/login/',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
