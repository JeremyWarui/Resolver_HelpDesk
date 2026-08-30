import { test, expect, type Page } from '@playwright/test';
import { login, CARPENTRY, NRB_OFFICE_BLOCK, USERS, uniqueSuffix } from './helpers';

// A job in a trade the usual technician does not work, held part-way through.
//
// Every other spec routes plumbing and checks that the carpenter cannot see it.
// This one runs the mirror, and the mirror is the sharper direction: the
// plumber is the technician the seed gives the most tickets, so a scope bug
// that leaks by campus alone shows up here as Esther seeing a door repair.
// `scoped_ticket_qs` fails closed, so an out-of-scope ticket is absent from the
// response rather than merely unrendered, and the 403 below says which.
//
// The hold is the second half. `pending` is the one status the requester never
// causes and the one that freezes the SLA clock, and it needs a reason from a
// fixed list of six — free text cannot be reported on. Nothing else drives a
// hold end to end: the pending-work spec reads whatever holds the seed dealt
// and skips itself when there are none.
//
// Serial: every test needs the ticket the one before it left behind.

test.describe.configure({ mode: 'serial' });

const suffix = uniqueSuffix();
const DESCRIPTION = `E2E ${suffix} — office door will not latch, frame is split`;
const HOLD_REASON = 'Material not in store';
const HOLD_NOTE = 'Hinge set is out of stock; requisition raised with stores.';

/** Set by the first test, read by the rest. */
let ticketNo = '';
let ticketId = 0;

const searchBox = (page: Page) => page.getByRole('textbox', { name: /search/i }).first();

/** The access token this signed-in page holds, for the direct scope probes. */
async function bearer(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem('authToken'));
  expect(token, 'the signed-in page must hold an access token').toBeTruthy();
  return token as string;
}

/** Open the ticket from whichever list page is showing, and wait for the sheet. */
async function openTicket(page: Page): Promise<void> {
  await searchBox(page).fill(ticketNo);
  const row = page.getByText(ticketNo, { exact: false }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();
  await expect(page.getByRole('dialog').first().getByText(ticketNo)).toBeVisible();
}

test('a requester raises a carpentry ticket, which routes on the item, not on them', async ({ page }) => {
  await login(page, USERS.requester);
  await page.getByRole('button', { name: 'New Ticket' }).first().click();

  const wizard = page.getByRole('dialog');
  await wizard.getByRole('button', { name: CARPENTRY.trade }).click();
  await wizard.getByRole('button', { name: CARPENTRY.item }).click();
  await wizard.getByRole('button', { name: 'Next' }).click();

  await wizard
    .getByPlaceholder('Describe the fault — what is wrong, and since when…')
    .fill(DESCRIPTION);
  await wizard.getByRole('button', { name: 'Office' }).click();
  await wizard.getByRole('combobox').last().click();
  await page.getByRole('option', { name: NRB_OFFICE_BLOCK }).click();
  await wizard.getByPlaceholder('e.g. Ground, 1st').fill('Ground');
  await wizard.getByPlaceholder('e.g. Room 14').fill(`Room ${suffix.slice(-3)}`);
  await wizard.getByRole('button', { name: 'Next' }).click();

  const created = page.waitForResponse(
    (r) => /\/tickets\/$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST' && r.ok(),
  );
  await wizard.getByRole('button', { name: 'Submit request' }).click();
  const body = await (await created).json();
  ticketNo = body.ticket_no;
  ticketId = body.id;
  expect(ticketNo, 'the backend must allocate a ticket number').toBeTruthy();
});

test('the HOS is offered the carpenters and not the plumber, and assigns one', async ({ page }) => {
  await login(page, USERS.hos);
  await page.goto('/hos/tickets');
  await openTicket(page);

  const detail = page.getByRole('dialog').first();
  await detail.getByRole('button', { name: 'Assign', exact: true }).click();

  const modal = page.getByRole('dialog').last();
  await expect(modal.getByText('Assign ticket')).toBeVisible();

  // The list is scoped to the ticket's trade as well as its campus. Esther
  // Wairimu is at Nairobi like Anthony and holds only (Nairobi, Plumbing), so
  // she is the one name that must not appear — offering her would let the HOS
  // build an assignment the server then refuses.
  await expect(modal.getByRole('button', { name: /Anthony/ })).toBeVisible({ timeout: 20_000 });
  await expect(modal.getByRole('button', { name: /Esther/ })).toHaveCount(0);

  // Priority is the HOS's call, never the requester's: it opened at Low.
  await expect(modal.getByText(/Opened at Low/)).toBeVisible();
  await modal.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Medium', exact: true }).click();

  await modal.getByRole('button', { name: /Anthony/ }).first().click();
  const assigned = page.waitForResponse(
    (r) => r.url().includes('/assign/') && r.request().method() === 'POST',
  );
  await modal.getByRole('button', { name: 'Assign', exact: true }).click();
  expect((await assigned).status(), 'assignment must be accepted').toBe(200);
});

test('the plumber cannot see it, and is refused it by id', async ({ page }) => {
  await login(page, USERS.technician);
  const token = await bearer(page);

  // The list first: scope is applied at the queryset, so this is not a hidden
  // row but an absent one.
  await page.goto('/tech');
  await searchBox(page).fill(ticketNo);
  await page.waitForTimeout(2000);
  await expect(page.getByText(ticketNo, { exact: false })).toHaveCount(0);

  // Then by id, because the pk is client-supplied and a list that omits a row
  // proves nothing about the endpoint that takes its number.
  const read = await page.request.get(`http://localhost:8000/api/v1/tickets/${ticketId}/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(read.status(), 'a plumber must not read a carpentry ticket').toBe(403);

  const write = await page.request.post(
    `http://localhost:8000/api/v1/tickets/${ticketId}/status/`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: 'in_progress', note: 'should never land' },
    },
  );
  expect(write.status(), 'nor write to one').toBe(403);
});

test('the carpenter starts work and puts it on hold with a reason from the list', async ({ page }) => {
  await login(page, USERS.technicianOtherTrade);
  await page.goto('/tech/assigned');
  await openTicket(page);

  const sheet = page.getByRole('dialog').first();
  await sheet.getByRole('button', { name: 'Start work' }).click();
  await expect(sheet.getByText('In Progress', { exact: false }).first()).toBeVisible({
    timeout: 20_000,
  });

  await sheet.getByRole('button', { name: 'Update Status' }).click();
  const modal = page.getByRole('dialog').filter({ hasText: 'Update ticket status' });

  // `pending` reads "On Hold" on every surface — the badge in this radio card
  // included. STATUS_LABELS is the one map, and the modal renders through it.
  await modal.getByRole('button', { name: 'On Hold', exact: true }).click();
  await modal
    .getByPlaceholder('Describe what was done or what changed…')
    .fill('Stripped the frame; cannot refit without new hinges.');

  // The reason is a code from PENDING_REASONS, served by /tickets/filter-options/.
  // Free text here would make the hold uncountable, which is why the select is
  // the only way to set one and the button stays disabled without it.
  await expect(modal.getByRole('button', { name: 'Save update' })).toBeDisabled();
  await modal.getByRole('combobox').click();
  await page.getByRole('option', { name: HOLD_REASON }).click();

  const held = page.waitForResponse(
    (r) => r.url().includes(`/tickets/${ticketId}/status/`) && r.request().method() === 'POST',
  );
  await modal.getByRole('button', { name: 'Save update' }).click();
  expect((await held).status(), 'the hold must be accepted').toBe(200);
  await expect(modal).toBeHidden();
});

test('the hold shows why, and reaches the Pending Work queue', async ({ page }) => {
  // Nine columns overflow at the 1280 default, and the Resume button lives in
  // the last one. technician-queues.spec.ts measures the same page at 1600.
  await page.setViewportSize({ width: 1600, height: 1000 });
  await login(page, USERS.technicianOtherTrade);

  await page.getByRole('link', { name: 'Pending Work' }).click();
  await expect(page).toHaveURL(/\/tech\/pending$/);

  const row = page.locator('tbody tr').filter({ hasText: ticketNo }).first();
  await expect(row, 'a job this technician just held must be in their held queue').toBeVisible({
    timeout: 20_000,
  });
  // The reason is the point of the page: "what is stopping this" is what the
  // person chasing it needs, and the status word is the same on every row.
  await expect(row).toContainText(HOLD_REASON);
  await expect(row.getByRole('button', { name: 'Resume' })).toBeInViewport();
});

test('resuming it and resolving it settles the ticket', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await login(page, USERS.technicianOtherTrade);
  await page.goto('/tech/pending');

  const row = page.locator('tbody tr').filter({ hasText: ticketNo }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole('button', { name: 'Resume' }).click();

  const resume = page.getByRole('dialog').filter({ hasText: 'Resume work' });
  await expect(resume.getByText(HOLD_REASON)).toBeVisible();
  await resume
    .getByRole('textbox')
    .last()
    .fill('Hinges collected from stores; refitting now.');
  const resumed = page.waitForResponse(
    (r) => r.url().includes(`/tickets/${ticketId}/status/`) && r.request().method() === 'POST',
  );
  await resume.getByRole('button', { name: 'Resume work' }).click();
  expect((await resumed).status(), 'pending must return to in progress').toBe(200);

  // Off the held queue, because it is no longer held.
  await expect(page.locator('tbody tr').filter({ hasText: ticketNo })).toHaveCount(0, {
    timeout: 20_000,
  });

  await page.goto('/tech/assigned');
  await openTicket(page);
  const sheet = page.getByRole('dialog').first();
  await sheet.getByRole('button', { name: 'Update Status' }).click();

  const modal = page.getByRole('dialog').filter({ hasText: 'Update ticket status' });
  await modal.getByRole('button', { name: 'Resolved', exact: true }).click();
  await modal
    .getByPlaceholder('Describe what was done or what changed…')
    .fill('New hinges fitted, frame packed out, door latches.');
  await modal.getByRole('button', { name: 'Save update' }).click();
  await expect(modal).toBeHidden();
});

test('the requester sees it resolved, and the plumber still cannot', async ({ page }) => {
  await login(page, USERS.requester);
  await page.getByRole('link', { name: 'My Tickets', exact: true }).click();
  await searchBox(page).fill(ticketNo);
  const row = page.getByRole('row').filter({ hasText: ticketNo });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row.getByText('Resolved')).toBeVisible();

  // Settling a ticket does not widen who may read it. The same 403 as before,
  // now against a ticket that has a resolution note worth leaking.
  await login(page, USERS.technician);
  const token = await bearer(page);
  const read = await page.request.get(`http://localhost:8000/api/v1/tickets/${ticketId}/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(read.status(), 'a resolved ticket is not a public one').toBe(403);
});
