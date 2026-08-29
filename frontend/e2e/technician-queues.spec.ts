import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers';

// The technician's Pending Work and Escalated pages both list only what is
// assigned to them, which is narrower than their server scope — a technician's
// `scoped_ticket_qs` returns their whole (campus, trade) pool.
//
// That narrowing is load-bearing rather than cosmetic. `TicketStatusUpdateView`
// lets a technician change status only on tickets assigned to *them* ("section
// scope alone gives view-only"), so a Resume button on a section-mate's held
// job would answer 403. A spec that only checked the page rendered would pass
// on the broken version, so these assert the request itself.

test('pending work lists only the technician\'s own held jobs', async ({ page }) => {
  // Explicit width: the Resume assertion below is a claim about layout, and a
  // nine-column table overflows at the 1280 default no matter what — as every
  // other table in this app does. 1600 is the width the width-cap fix was
  // measured against.
  await page.setViewportSize({ width: 1600, height: 1000 });
  await login(page, USERS.technician);

  // Reached the way a technician reaches it, so a missing sidebar entry or an
  // unrouted section fails here rather than silently 404ing later.
  // `page_size=200` pins this to the *page's* list request. The sidebar badge
  // fires its own `status=pending&page_size=1`, narrowed by the same rule in
  // useNavCounts — matching on `status=pending` alone caught that one instead
  // and passed even with the page's narrowing removed.
  const listRequest = page.waitForRequest(
    (r) =>
      r.url().includes('/tickets/') &&
      r.url().includes('status=pending') &&
      r.url().includes('page_size=200'),
  );
  await page.getByRole('link', { name: 'Pending Work' }).click();
  await expect(page).toHaveURL(/\/tech\/pending$/);
  await expect(page.locator('header h1')).toHaveText('Pending Work');

  const url = new URL((await listRequest).url());
  expect(
    url.searchParams.get('assigned_to'),
    'the technician list must be narrowed to the signed-in user, not their whole trade',
  ).toBeTruthy();

  // The rest is about what the page shows, so it needs the seed to have dealt
  // this technician a hold. The scope assertion above is the load-bearing one
  // and always runs.
  const rows = page.locator('tbody tr');
  test.skip((await rows.count()) === 0, 'the seed dealt this technician no held jobs');

  // The sidebar badge counts the same thing the page lists — it is the number a
  // technician reads before deciding whether to open the page at all.
  const badge = page.locator('a', { hasText: 'Pending Work' }).locator('span').last();
  await expect(badge).toHaveText(String(await rows.count()));

  // Resume is the point of the page, and the Actions column has to be reachable
  // at this width.
  await expect(rows.first().getByRole('button', { name: 'Resume' })).toBeInViewport();
});

test('escalated lists only the technician\'s own late jobs', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await login(page, USERS.technician);

  const listRequest = page.waitForRequest(
    (r) =>
      r.url().includes('/tickets/') &&
      r.url().includes('escalated=1') &&
      r.url().includes('page_size=200'),
  );
  await page.getByRole('link', { name: 'Escalated' }).click();
  await expect(page).toHaveURL(/\/tech\/escalated$/);

  const url = new URL((await listRequest).url());
  expect(
    url.searchParams.get('assigned_to'),
    'escalated is scoped to what the technician holds, not the whole trade',
  ).toBeTruthy();

  // Every row is theirs — an unassigned escalated job in the same trade must
  // not appear here, which is exactly what the un-narrowed version showed.
  await expect(page.locator('tbody tr').first()).toBeVisible();

  // The assignee column's position is not fixed: a technician also sees
  // Priority (priority-column.spec.ts holds that rule), which shifts every
  // column after it. Read the header row for the index rather than assuming.
  const headers = await page.locator('table thead th').allInnerTexts();
  const assigneeColumn = headers.findIndex((h) => h.trim() === 'Assigned To');
  expect(assigneeColumn, 'the queue table must have an Assigned To column').toBeGreaterThan(-1);

  const assignees = await page
    .locator(`tbody tr td:nth-child(${assigneeColumn + 1})`)
    .allInnerTexts();
  expect(assignees.length).toBeGreaterThan(0);
  for (const name of assignees) {
    expect(name.trim()).toBe('Esther Wairimu');
  }
});
