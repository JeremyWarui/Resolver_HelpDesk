import type { Page } from '@playwright/test';

// Credentials for the admin account seeded by django_resolver's `manage.py seed_full`.
// The password is never committed — export it before running the suite:
//   E2E_ADMIN_PASSWORD=<seed password> npm run test:e2e
export const ADMIN = {
  username: process.env.E2E_ADMIN_USERNAME ?? 'admin',
  get password(): string {
    const password = process.env.E2E_ADMIN_PASSWORD;
    if (!password) {
      throw new Error(
        'E2E_ADMIN_PASSWORD is not set. Export the seeded admin password ' +
          "(the SEED_DEFAULT_PASSWORD used for django_resolver's seed_full) before running e2e tests.",
      );
    }
    return password;
  },
};

export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[name="username"]').fill(ADMIN.username);
  await page.locator('input[name="password"]').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  // Admin lands on /dashboard via window.location.assign (full page load).
  await page.waitForURL('**/dashboard**', { timeout: 45_000 });
}

/** Unique suffix so a failed earlier run's leftovers never collide. */
export function uniqueSuffix(): string {
  return Date.now().toString(36);
}
