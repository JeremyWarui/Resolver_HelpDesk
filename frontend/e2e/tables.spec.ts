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

  // The seed creates 37 facilities and the page size is 10, so four pages.
  // Asserting the exact count catches the second half of this bug: the client
  // fetched only the server's first page of 20 (ConfigListPagination), so even
  // with working controls the register stopped at "Page 2 of 2" and 17
  // buildings were never on the client at all.
  await expect(pageCounter).toHaveText('Page 1 of 4');

  // Identify rows by the Name cell, not by whole-row text: the ticket-count
  // columns beside it settle a beat later than the name does, so a row's
  // innerText is not stable even once the row itself is.
  const firstName = () => page.locator('tbody tr').first().locator('td').nth(1);
  await expect(firstName()).not.toBeEmpty();
  const nameOnPageOne = (await firstName().innerText()).trim();

  const next = page.getByRole('button', { name: 'Next' });
  await expect(next).toBeEnabled();
  await next.click();

  await expect(pageCounter).toHaveText(/^Page 2 of/);
  await expect(firstName()).not.toHaveText(nameOnPageOne);

  // And back, so the failure mode "Next works, Previous doesn't" is covered too.
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(pageCounter).toHaveText(/^Page 1 of/);
  await expect(firstName()).toHaveText(nameOnPageOne);
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
