import { test, expect, type Page } from '@playwright/test';
import { login, loginAsAdmin, USERS } from './helpers';

// Every page, visited, watching the network. `tsc` is green for a request to a
// route that does not exist, an empty chart and a column of em dashes; a 4xx or
// 5xx on the wire is not.

function watch(page: Page) {
  const failures: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/api/v1/')) {
      failures.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
    }
  });
  page.on('pageerror', (e) => failures.push(`pageerror: ${e.message}`));
  return failures;
}

const PAGES: Record<string, string[]> = {
  admin: [
    '/dashboard',
    '/dashboard/tickets',
    '/dashboard/reports',
    '/dashboard/technicians',
    '/dashboard/facilities',
    '/dashboard/campuses',
    '/dashboard/catalogue',
    '/dashboard/users',
    '/dashboard/sla-rules',
  ],
  hos: [
    '/hos',
    '/hos/tickets',
    '/hos/pending',
    '/hos/escalated',
    '/hos/technicians',
    '/hos/facilities',
    '/hos/reports',
    '/hos/feedback',
  ],
  // Read-only across every campus: the ticket table lists, no ticket opens.
  manager: ['/director', '/director/tickets', '/director/reports', '/director/technicians', '/director/facilities', '/director/campuses', '/director/feedback'],
  technician: ['/tech', '/tech/available', '/tech/pending', '/tech/escalated', '/tech/assigned', '/tech/section', '/tech/reports', '/tech/feedback'],
  requester: ['/user', '/user/tickets'],
};

for (const [role, paths] of Object.entries(PAGES)) {
  test(`${role}: every page loads with no failed request`, async ({ page }) => {
    const failures = watch(page);
    if (role === 'admin') await loginAsAdmin(page);
    else await login(page, USERS[role as keyof typeof USERS]);

    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator('body')).toBeVisible();
      // Long enough for the page's own fetches to land.
      await page.waitForTimeout(1500);
    }

    expect(failures, `${role} hit failing requests`).toEqual([]);
  });
}
