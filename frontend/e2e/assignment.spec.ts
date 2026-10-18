import { test, expect } from '@playwright/test';
import { login, PLUMBING, USERS, raiseTicket, resolveFromSheet, uniqueSuffix } from './helpers';

// Assignment is where routing stops being automatic: the HOS reads the ticket,
// picks who does it, and grades its urgency in the same action — a requester
// never sets priority. This drives that end to end, then checks the technician
// actually receives it.

const suffix = uniqueSuffix();
let ticketNo = '';

test.describe.configure({ mode: 'serial' });

test('a requester raises an unassigned ticket', async ({ page }) => {
  await login(page, USERS.requester);
  ({ ticket_no: ticketNo } = await raiseTicket(page, {
    ...PLUMBING,
    description: `ASSIGN ${suffix} — cistern running continuously`,
    where: `Floor 2, Room ${suffix.slice(-3)}`,
  }));
});

test('the HOS assigns it to a technician and sets the priority', async ({ page }) => {
  await login(page, USERS.hos);
  await page.goto('/hos/tickets');

  await page.getByPlaceholder(/Search/i).first().fill(ticketNo);
  await expect(page.getByText(ticketNo, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
  await page.getByText(ticketNo, { exact: false }).first().click();

  // Assign only shows while the ticket is open — a settled one must be reopened
  // first, which is the server's rule too.
  const detail = page.getByRole('dialog').first();
  await detail.getByRole('button', { name: 'Assign', exact: true }).click();

  const modal = page.getByRole('dialog').last();
  await expect(modal.getByText('Assign ticket')).toBeVisible();

  // Priority sits above the technician list on purpose: how urgent this is
  // decides who can realistically take it now. It opened at Low.
  await expect(modal.getByText(/Opened at Low/)).toBeVisible();
  await modal.getByRole('combobox').click();
  await page.getByRole('option', { name: 'High', exact: true }).click();
  await expect(modal.getByText(/re-timed from when the ticket was raised/)).toBeVisible();

  await modal.getByRole('button', { name: /Esther/ }).first().click();

  const assigned = page.waitForResponse(
    (r) => r.url().includes('/assign/') && r.request().method() === 'POST',
  );
  await modal.getByRole('button', { name: 'Assign', exact: true }).click();
  expect((await assigned).status(), 'assignment must be accepted').toBe(200);
});

test('the technician receives it, at the priority the HOS set', async ({ page }) => {
  await login(page, USERS.technician);
  await page.goto('/tech/assigned');

  await expect(page.getByText(ticketNo, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
  const row = page.locator('tbody tr').filter({ hasText: ticketNo }).first();
  await expect(row).toContainText('High');
  await expect(row).toContainText(/Assigned/i);
});

test('the trail records who assigned it, to whom', async ({ page }) => {
  await login(page, USERS.hos);
  await page.goto('/hos/tickets');
  await page.getByPlaceholder(/Search/i).first().fill(ticketNo);
  await page.getByText(ticketNo, { exact: false }).first().click();

  const sheet = page.getByRole('dialog').first();
  await expect(sheet.getByRole('list', { name: 'Progress' }).locator('[aria-current="step"]')).toHaveText(/Assigned$/, { timeout: 20_000 });
  await expect(sheet.getByText('Esther', { exact: false }).first()).toBeVisible();
});

test('the assignee starts the work the HOS handed them', async ({ page }) => {
  // Assigned is not started. Start work moves it on, with no status to pick
  // from a list.
  await login(page, USERS.technician);
  await page.goto('/tech/assigned');
  await page.getByPlaceholder(/Search/i).first().fill(ticketNo);
  await page.getByText(ticketNo, { exact: false }).first().click();

  const sheet = page.getByRole('dialog').first();
  const started = page.waitForResponse(
    (r) => r.url().includes('/status/') && r.request().method() === 'POST',
  );
  await sheet.getByRole('button', { name: 'Start work' }).click();
  expect((await started).status(), 'assigned must move to in progress').toBe(200);
  await expect(sheet.getByRole('list', { name: 'Progress' }).locator('[aria-current="step"]')).toHaveText(/In Progress$/, {
    timeout: 20_000,
  });
});

test('the assignee resolves it, and the requester closes it', async ({ page }) => {
  // A handed-over ticket gets finished by the person it was handed to. Claiming
  // reaches resolved in ticket-lifecycle.spec.ts; this reaches it down the
  // assigned path, where the status modal offers in_progress -> resolved.
  await login(page, USERS.technician);
  await page.goto('/tech/assigned');
  await page.getByPlaceholder(/Search/i).first().fill(ticketNo);
  await page.getByText(ticketNo, { exact: false }).first().click();

  await resolveFromSheet(page, 'Replaced the cistern inlet valve and tested the flush.');

  // Closing is the requester's, not the technician's. Read the row rather than
  // opening the ticket: a resolved job raises the rating prompt over the list.
  await login(page, USERS.requester);
  await page.getByRole('link', { name: 'My Tickets', exact: true }).click();
  await page.getByPlaceholder(/Search/i).first().fill(ticketNo);
  const row = page.getByRole('row').filter({ hasText: ticketNo });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row.getByText('Resolved')).toBeVisible();

  await row.getByRole('button', { name: 'Rate & close' }).click();
  const rating = page.getByRole('dialog').filter({ hasText: 'Rate resolution' });
  await rating.getByLabel('5 stars').click();
  await rating.getByRole('button', { name: 'Submit & close ticket' }).click();
  await expect(rating).toBeHidden({ timeout: 20_000 });

  const closedRow = page.getByRole('row').filter({ hasText: ticketNo });
  await expect(closedRow.getByText('Closed')).toBeVisible({ timeout: 20_000 });
});

test('the role routes resolve, and / lands a signed-in user on their own dashboard', async ({ page }) => {
  await login(page, USERS.hos);
  await page.goto('/hos/reports');
  await expect(page.locator('header h1')).toHaveText('Reports');
  await page.goto('/');
  await expect(page).toHaveURL(/\/hos$/);

  await login(page, USERS.manager);
  await page.goto('/director/reports');
  await expect(page.locator('header h1')).toHaveText('Reports');

  await login(page, USERS.technician);
  await page.goto('/');
  await expect(page).toHaveURL(/\/tech$/);
});
