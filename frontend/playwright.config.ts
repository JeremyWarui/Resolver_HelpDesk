import { defineConfig, devices } from '@playwright/test';

// E2E smoke tests. Both servers start automatically and are reused when already
// running.
//
// The backend writes to whatever database `backend/.env` points at, so specs
// must be self-cleaning: create, verify, delete. Tickets are the exception —
// TicketLog is append-only — so the lifecycle spec prefixes everything it
// creates with `E2E` and leaves it.
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
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
      command: '../venv/Scripts/python manage.py runserver 8000',
      cwd: '../backend',
      // Not /admin/login/ (Django's admin is not routed here) and not
      // /auth/login/ (GET returns 405, which Playwright does not accept as
      // "up"). An unauthenticated GET here answers 401, which it does.
      url: 'http://localhost:8000/api/v1/tickets/',
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
