import { test, expect } from '@playwright/test';
import { login, PLUMBING, NRB_OFFICE_BLOCK, USERS, uniqueSuffix } from './helpers';

// Assignment is where routing stops being automatic: the HOS reads the ticket,
// picks who does it, and grades its urgency in the same action — a requester
// never sets priority. This drives that end to end, then checks the technician
// actually receives it.

const suffix = uniqueSuffix();
let ticketNo = '';

test.describe.configure({ mode: 'serial' });

test('a requester raises an unassigned ticket', async ({ page }) => {
  await login(page, USERS.requester);
  await page.getByRole('button', { name: 'New Ticket' }).first().click();

  const wizard = page.getByRole('dialog');
  await wizard.getByRole('button', { name: PLUMBING.trade }).click();
  await wizard.getByRole('button', { name: PLUMBING.item }).click();
  await wizard.getByRole('button', { name: 'Next' }).click();
  await wizard
    .getByPlaceholder('Describe the fault — what is wrong, and since when…')
    .fill(`ASSIGN ${suffix} — cistern running continuously`);
  await wizard.getByRole('button', { name: 'Office' }).click();
  await wizard.getByRole('combobox').last().click();
  await page.getByRole('option', { name: NRB_OFFICE_BLOCK }).click();
  await wizard.getByPlaceholder('e.g. Ground, 1st').fill('3rd');
  await wizard.getByPlaceholder('e.g. Room 14').fill(`Room ${suffix.slice(-3)}`);
  await wizard.getByRole('button', { name: 'Next' }).click();

  const created = page.waitForResponse(
    (r) => /\/tickets\/$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST' && r.ok(),
  );
  await wizard.getByRole('button', { name: 'Submit request' }).click();
  ticketNo = (await (await created).json()).ticket_no;
  expect(ticketNo).toBeTruthy();
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
  await expect(sheet.getByText('Assigned', { exact: false }).first()).toBeVisible({ timeout: 20_000 });
  await expect(sheet.getByText('Esther', { exact: false }).first()).toBeVisible();
});

test('the assignee starts the work the HOS handed them', async ({ page }) => {
  // Assigned is not started. The button that moves it is Start work rather
  // than the status modal, because a technician opening a job they have been
  // given should not have to pick `in_progress` out of a list to begin it.
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
  await expect(sheet.getByText('In Progress', { exact: false }).first()).toBeVisible({
    timeout: 20_000,
  });
});

test('the assignee resolves it, and the requester closes it', async ({ page }) => {
  // The half `assignment.spec.ts` stopped short of: handing a ticket over is
  // only worth testing if the ticket then gets finished by the person it was
  // handed to. Claiming reaches resolved in ticket-lifecycle.spec.ts; this is
  // the same ending reached down the assigned path, where the status modal
  // offers in_progress -> resolved rather than a claim.
  await login(page, USERS.technician);
  await page.goto('/tech/assigned');
  await page.getByPlaceholder(/Search/i).first().fill(ticketNo);
  await page.getByText(ticketNo, { exact: false }).first().click();

  const sheet = page.getByRole('dialog').first();
  await sheet.getByRole('button', { name: 'Update Status' }).click();

  const modal = page.getByRole('dialog').filter({ hasText: 'Update ticket status' });
  await modal.getByRole('button', { name: 'Resolved', exact: true }).click();
  await modal
    .getByPlaceholder('Describe what was done or what changed…')
    .fill('Replaced the cistern inlet valve and tested the flush.');
  await modal.getByRole('button', { name: 'Save update' }).click();
  await expect(modal).toBeHidden();

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

test('the renamed routes resolve, and /tech/mobile still outranks /tech/*', async ({ page }) => {
  await login(page, USERS.hos);
  await page.goto('/hos/reports');
  await expect(page.locator('header h1')).toHaveText('Reports');

  await login(page, USERS.manager);
  await page.goto('/director/reports');
  await expect(page.locator('header h1')).toHaveText('Reports');

  // The static route must win over the splat, or the mobile shell is unreachable.
  await login(page, USERS.technician);
  await page.goto('/tech/mobile');
  await expect(page.locator('aside')).toHaveCount(0);
});
