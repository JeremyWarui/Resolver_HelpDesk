import { test, expect } from '@playwright/test';
import { login, loginAsAdmin, USERS } from './helpers';

// Two defects that `tsc` and `npm run build` were both perfectly happy with,
// because neither is a type error — one is a TanStack contract, the other is a
// string built from the wrong fields.

// FacilitiesTable passed a literal `pagination: { pageIndex: 0, pageSize: 10 }`
// into `state` with no `onPaginationChange`. A controlled slice with no setter
// makes TanStack drop every internal update, so `table.nextPage()` did nothing
// while `getCanNextPage()` still returned true: Next looked enabled, the page
// counter said "Page 1 of 4", and clicking it changed nothing. 27 of the 37
// seeded facilities had no route to them at all, and "Rows per page" was dead
// for the same reason.
//
// The assertion is deliberately on the rows and not just the counter — the
// counter was already correct while the table underneath it was frozen.
test('facilities pagination actually turns the page', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/dashboard/facilities');

  const pageCounter = page.getByText(/^Page \d+ of \d+$/);
  await expect(pageCounter).toBeVisible();

  // The seed creates 37 facilities at a default page size of 10. If this ever
  // fails the fixture shrank, not the feature.
  const [, totalPages] = (await pageCounter.innerText()).match(/of (\d+)/) ?? [];
  expect(
    Number(totalPages),
    'this spec needs more than one page of facilities to mean anything',
  ).toBeGreaterThan(1);

  const firstRowOnPageOne = await page.locator('tbody tr').first().innerText();

  const next = page.getByRole('button', { name: 'Next' });
  await expect(next).toBeEnabled();
  await next.click();

  await expect(pageCounter).toHaveText(/^Page 2 of/);
  await expect(page.locator('tbody tr').first()).not.toHaveText(firstRowOnPageOne);

  // And back, so the failure mode "Next works, Previous doesn't" is covered too.
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(pageCounter).toHaveText(/^Page 1 of/);
  await expect(page.locator('tbody tr').first()).toHaveText(firstRowOnPageOne);
});

// `useTicketTable` built its hidden `searchField` from `ticket_no` and
// `description` only. The Title column renders `service_item.name` — a ticket
// has no title field — so typing a service name that is plainly visible in the
// table matched no row and emptied it. `TicketTable` already built the field
// correctly, which is why the admin Tickets page searched fine and the
// technician's did not.
//
// Reading the term off a visible row rather than hardcoding one keeps this
// independent of which items the seed happened to deal out.
test('searching a service name shown in the table finds its row', async ({ page }) => {
  await login(page, USERS.technician);
  await page.goto('/technician/assigned');

  const firstRow = page.locator('tbody tr').first();
  await expect(firstRow).toBeVisible({ timeout: 20_000 });

  // Title is the second cell; the first is the ticket number.
  const serviceName = (await firstRow.locator('td').nth(1).innerText()).trim();
  expect(serviceName.length, 'need a service name to search for').toBeGreaterThan(0);

  await page.getByPlaceholder('Search by ID or title...').fill(serviceName);

  const matches = page.locator('tbody tr');
  await expect(matches.first()).toBeVisible();
  await expect(matches.first().locator('td').nth(1)).toHaveText(serviceName);
});
