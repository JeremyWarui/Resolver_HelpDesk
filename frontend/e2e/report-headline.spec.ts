import { test, expect, type Page } from '@playwright/test';
import { login, loginAsAdmin, USERS, API } from './helpers';

// Every Reports page (admin, manager, HOD and HOS) leads with the same six
// cards from /analytics/overview/, each against the period before.

interface Figures { total: number; settled: number; resolution_sla_pct: number | null; rating_avg: number | null; rating_count: number }

async function figures(page: Page, path: string): Promise<{ now: Figures; before: { total: number; settled: number }; held: number }> {
  const body = await page.evaluate(async (url) => {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });
    return r.json();
  }, `${API}${path}?days=30`);
  const held = (body.bottlenecks as { total: number }[]).reduce((sum, row) => sum + row.total, 0);
  return { now: body.current, before: body.previous, held };
}

function card(page: Page, title: string) {
  return page.getByText(title, { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
}

async function expectHeadline(page: Page, path: string) {
  await page.getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(page.locator('header h1')).toHaveText('Reports');
  const { now, before, held } = await figures(page, path);

  await expect(card(page, 'Raised')).toContainText(`${now.total}${before.total} the period before`);
  await expect(card(page, 'Resolved')).toContainText(`${now.settled}${before.settled} the period before`);
  await expect(card(page, 'On hold now')).toContainText(`${held}Paused right now`);
  await expect(card(page, 'Resolved on time')).toContainText(now.resolution_sla_pct == null ? '—' : `${now.resolution_sla_pct}%`);
  await expect(card(page, 'Time to resolve')).toBeVisible();
  await expect(card(page, 'Rating')).toContainText(`${now.rating_count} ratings`);
  for (const gone of ['Open right now', 'Total Tickets', 'Avg Resolution', 'Resolution SLA', 'Response SLA']) {
    await expect(page.getByText(gone, { exact: true })).toHaveCount(0);
  }
}

test('the admin reads the same six cards as the manager', async ({ page }) => {
  await loginAsAdmin(page);
  await expectHeadline(page, '/analytics/overview/');
  for (const section of ['Needs your attention', 'Facility Health', 'Campuses', 'Trades by campus']) {
    await expect(page.getByLabel(section, { exact: true })).toBeVisible();
  }
});

test('the manager reads Raised, Resolved, On hold now, Resolved on time, Time to resolve and Rating', async ({ page }) => {
  await login(page, USERS.manager);
  await expectHeadline(page, '/analytics/overview/');
});

test('an HOS reads the same cards over their campus', async ({ page }) => {
  await login(page, USERS.hos);
  await expectHeadline(page, '/analytics/overview/');
});
