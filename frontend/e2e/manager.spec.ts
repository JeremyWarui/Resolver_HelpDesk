import { test, expect, type Page } from '@playwright/test';
import { login, USERS, API } from './helpers';

// The manager reads the whole organisation: the admin's sections, read-only,
// without the configuration screens. The ticket table lists every campus;
// no ticket opens.

function ticketDetailRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname;
    if (/\/api\/v1\/tickets\/\d+\//.test(path)) seen.push(`${r.method()} ${path}`);
  });
  return seen;
}

test('the manager has the admin sections bar the configuration ones', async ({ page }) => {
  await login(page, USERS.manager);
  const nav = page.getByRole('navigation', { name: 'Sections' });

  await expect(nav.getByRole('link')).toHaveText([
    'Dashboard', 'Tickets', 'Reports', 'Technicians', 'Facilities', 'Campuses', 'Feedback',
    // An unread count rides after the label.
    /^Notifications/,
  ]);
});

test('the manager lists every campus’s tickets but cannot open one', async ({ page }) => {
  const opened = ticketDetailRequests(page);
  await login(page, USERS.manager);
  await page.getByRole('link', { name: 'Tickets', exact: true }).click();

  const rows = page.locator('tbody tr');
  await expect(rows.first()).toBeVisible({ timeout: 20_000 });

  // The list the table reads holds tickets from every campus. Asked per campus,
  // because the first page is newest-first and other specs keep adding Nairobi
  // tickets to it.
  const token = await page.evaluate(() => localStorage.getItem('authToken'));
  const headers = { Authorization: `Bearer ${token}` };
  const campusList = await (await page.request.get(`${API}/campuses/`, { headers })).json();
  const campuses: { id: number; code: string }[] = campusList.results ?? campusList;
  expect(campuses.length).toBe(5);
  for (const campus of campuses) {
    const res = await page.request.get(`${API}/tickets/?campus=${campus.id}&page_size=1`, { headers });
    expect((await res.json()).count, `the manager lists ${campus.code} tickets`).toBeGreaterThan(0);
  }

  await rows.first().click();
  await page.waitForTimeout(1000);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(opened, 'no ticket was fetched').toEqual([]);
});

test('the manager reads campuses without the controls to change them', async ({ page }) => {
  await login(page, USERS.manager);
  await page.getByRole('link', { name: 'Campuses', exact: true }).click();

  await expect(page.locator('main').getByRole('region')).toHaveCount(5, { timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Add Campus' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Edit|Delete) / })).toHaveCount(0);
});

test('the manager reports lead with the period against the one before, then campuses and trades', async ({ page }) => {
  await login(page, USERS.manager);
  await page.getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(page.locator('header h1')).toHaveText('Reports');

  await expect(page.getByText('Resolved on time', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Time to resolve', { exact: true }).first()).toBeVisible();
  for (const section of ['Needs your attention', 'Facility Health', 'Campuses', 'Trades', 'Trades by campus']) {
    await expect(page.getByLabel(section, { exact: true })).toBeVisible();
  }
});

test('the server refuses the manager a ticket that is not their own', async ({ page }) => {
  await login(page, USERS.manager);
  const token = await page.evaluate(() => localStorage.getItem('authToken'));
  const headers = { Authorization: `Bearer ${token}` };

  const list = await page.request.get(`${API}/tickets/`, { headers });
  expect(list.status()).toBe(200);
  const first = (await list.json()).results[0];
  expect(first, 'the list is not empty').toBeTruthy();

  const detail = await page.request.get(`${API}/tickets/${first.id}/`, {
    headers,
  });
  expect(detail.status()).toBe(403);
});
