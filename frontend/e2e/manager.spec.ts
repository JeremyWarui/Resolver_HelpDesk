import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers';

// Manager was the one supervisory role that ignored RoleTicketsPage and wired
// DataTable by hand — the older of the two ticket-table stacks. The visible
// cost was the FilterPills row, so managers had no Overdue filter while admin,
// HOD and HOS did, and RoleTicketsPage already held a complete, unreachable
// `manager` config.
//
// tsc cannot see any of that: both stacks compile. This asserts the page still
// renders after the swap, and that the pill it was missing is now there and
// narrows rather than widens.
test('the manager tickets page renders and has the Overdue filter', async ({ page }) => {
  await login(page, USERS.manager);
  await page.getByRole('link', { name: 'Tickets', exact: true }).click();

  await expect(page.getByText('Tickets across your department')).toBeVisible();
  const rows = page.getByRole('row');
  await expect(rows.first()).toBeVisible();
  const allCount = await rows.count();

  const overdue = page.getByRole('button', { name: 'Overdue' });
  await expect(overdue).toBeVisible();

  const filtered = page.waitForResponse(
    (r) => r.url().includes('overdue=1') && r.ok(),
  );
  await overdue.click();
  await filtered;

  // Narrows, never widens — the pill used to be dead state that set status to
  // "all" alongside it, which listed more rows than before it was clicked.
  await expect(async () => {
    expect(await page.getByRole('row').count()).toBeLessThanOrEqual(allCount);
  }).toPass({ timeout: 15_000 });
});
