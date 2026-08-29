import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers';

// The manager tickets page renders, and its Overdue pill narrows the list
// server-side rather than filtering the page the client happens to hold.
test('the manager tickets page renders and has the Overdue filter', async ({ page }) => {
  await login(page, USERS.manager);
  await page.getByRole('link', { name: 'Tickets', exact: true }).click();

  await expect(page.getByText('Every campus')).toBeVisible();

  // Count once the unfiltered list has actually landed: a row rendering is not
  // the same as the page being rendered.
  const rows = page.getByRole('row');
  await expect(rows.first()).toBeVisible();
  let seen = -1;
  await expect(async () => {
    const n = await rows.count();
    const settled = n === seen;
    seen = n;
    expect(settled, 'the unfiltered list is still rendering').toBe(true);
  }).toPass({ timeout: 15_000 });
  const allCount = seen;

  const overdue = page.getByRole('button', { name: 'Overdue' });
  await expect(overdue).toBeVisible();

  const filtered = page.waitForResponse(
    (r) => r.url().includes('overdue=1') && r.ok(),
  );
  await overdue.click();
  await filtered;

  // Narrows, never widens.
  await expect(async () => {
    expect(await page.getByRole('row').count()).toBeLessThanOrEqual(allCount);
  }).toPass({ timeout: 15_000 });
});
