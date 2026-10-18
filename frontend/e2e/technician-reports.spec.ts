import { test, expect } from '@playwright/test';
import { login, USERS, API } from './helpers';

// A technician's report and feedback cover the jobs assigned to them, not
// their whole trade.

test('My Reports covers the technician’s own jobs', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, USERS.technicianOtherTrade);
  const report = page.waitForResponse(
    (r) => r.url().includes('/api/v1/analytics/') && !r.url().includes('group_by') && r.ok(),
  );
  await page.getByRole('link', { name: 'My Reports' }).click();
  const { totals } = await (await report).json();

  await expect(page.locator('header h1')).toHaveText('My Reports');
  await expect(page.getByText('Jobs assigned to you')).toBeVisible();
  // Figures about their own work.
  for (const card of ['Jobs assigned', 'Active now', 'Jobs finished', 'Time to resolve', 'Resolved on time', 'My rating']) {
    await expect(page.getByText(card, { exact: true }).first()).toBeVisible();
  }
  // Not about assigning work, which is the HOS's, and no comparison of colleagues.
  for (const absent of ['Avg Response', 'Response SLA', 'Awaiting assignment', 'Technician Performance']) {
    await expect(page.getByText(absent)).toHaveCount(0);
  }
  await expect(page.getByText('Jobs raised and finished')).toBeVisible();
  await expect(page.getByText('Where my jobs stand')).toBeVisible();

  // Each card shows the figure it names, not a neighbour's.
  const value = (title: string) =>
    page.locator('p', { hasText: new RegExp(`^${title}$`) }).locator('xpath=following-sibling::div[1]/h3');
  await expect(value('Jobs assigned')).toHaveText(String(totals.total));
  await expect(value('Active now')).toHaveText(String(totals.open_backlog));
  await expect(value('Jobs finished')).toHaveText(String(totals.settled));

  // On a wide screen the trend and the status pie share a row.
  const charts = page.getByTestId('report-charts').locator(':scope > *');
  const [trend, pie] = [await charts.nth(0).boundingBox(), await charts.nth(1).boundingBox()];
  expect(trend!.y).toBe(pie!.y);
  expect(pie!.x).toBeGreaterThan(trend!.x + trend!.width);
});

test('My Feedback lists only ratings on jobs assigned to the technician', async ({ page }) => {
  await login(page, USERS.technicianOtherTrade);
  const token = await page.evaluate(() => localStorage.getItem('authToken'));
  const headers = { Authorization: `Bearer ${token}` };
  const me = await (await page.request.get(`${API}/auth/me/`, { headers })).json();

  const feed = await page.request.get(`${API}/tickets/feedback/`, { headers });
  expect(feed.status()).toBe(200);
  const rows = (await feed.json()).results as { assigned_to: { id: number } | null }[];
  expect(rows.length, 'the seed rated some of this technician’s jobs').toBeGreaterThan(0);
  expect(rows.every((r) => r.assigned_to?.id === me.id)).toBe(true);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('link', { name: 'My Feedback' }).click();
  await expect(page.getByText('What requesters said about the jobs assigned to you')).toBeVisible();

  // The score on the left, what requesters wrote on the right.
  const ratings = page.getByLabel('Ratings', { exact: true });
  const comments = page.getByLabel('Comments', { exact: true });
  await expect(comments.getByRole('listitem')).toHaveCount(rows.length);
  const [left, right] = [await ratings.boundingBox(), await comments.boundingBox()];
  expect(left!.y).toBe(right!.y);
  expect(right!.x).toBeGreaterThan(left!.x + left!.width);
});
