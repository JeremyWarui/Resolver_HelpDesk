import { defineConfig, devices } from '@playwright/test';

// E2E smoke tests. Both servers start automatically and are reused when already
// running.
//
// The backend command used to point at `../../django_resolver` — the reference
// repo this project was ported out of. Running the suite therefore booted the
// *enterprise* Service Desk and tested it instead of this app, which is why the
// catalogue spec still described a three-level Department → SectionType →
// Category browser that no longer exists here.
//
// The backend writes to whatever database `backend/.env` points at, so specs
// must be self-cleaning: create → verify → delete. Tickets are the exception —
// they are append-only by design (TicketLog is immutable), so the lifecycle
// spec labels everything it creates with an `E2E` prefix and leaves it.
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000, // a remote Neon DB makes cold requests slow
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
      command: '../.venv/bin/python manage.py runserver 8000',
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
