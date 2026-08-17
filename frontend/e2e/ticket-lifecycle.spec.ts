import { test, expect, type Page } from '@playwright/test';
import {
  login,
  uniqueSuffix,
  USERS,
  PLUMBING,
  NRB_OFFICE_BLOCK,
} from './helpers';

// The path the whole product exists to serve, and the one with no coverage
// until now: a requester raises a ticket through the wizard, the technician it
// routes to claims it and works it, and it comes back resolved.
//
// Worth driving in a browser rather than trusting types, because every step
// here is a place where the frontend and backend agree only by convention:
// the wizard posts a `location` shape that `TYPE_SPECS` validates server-side,
// claim depends on `open` implying unassigned, and the status modal's
// `VALID_NEXT` is a hand-maintained mirror of `ALLOWED` in lifecycle.py.
//
// Serial: each step needs the ticket the previous one left behind. Tickets are
// append-only (TicketLog is immutable), so this leaves its ticket in place —
// the `E2E` marker in the description is how you find them.

test.describe.configure({ mode: 'serial' });

const suffix = uniqueSuffix();
const DESCRIPTION = `E2E ${suffix} — tap dripping continuously in the wash room`;

/** Set by the first test, read by the rest. */
let ticketNo = '';

/**
 * The ticket-table search box. Its placeholder differs by page — "Search..."
 * on the shared table, "Search by ID or title..." on the technician queue — so
 * match the accessible name loosely rather than pinning one page's copy.
 */
const searchBox = (page: Page) => page.getByRole('textbox', { name: /search/i }).first();

/** Open the ticket by number from a list page and wait for the detail sheet. */
async function openTicket(page: Page): Promise<void> {
  await searchBox(page).fill(ticketNo);
  const row = page.getByText(ticketNo, { exact: false }).first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole('dialog').getByText(ticketNo)).toBeVisible();
}

test('a requester raises a plumbing ticket with an office-block location', async ({ page }) => {
  await login(page, USERS.requester);

  await page.getByRole('button', { name: 'New Ticket' }).first().click();
  const wizard = page.getByRole('dialog');

  // ── Step 1: trade, then service item ──────────────────────────────────────
  await wizard.getByRole('button', { name: PLUMBING.trade }).click();
  await wizard.getByRole('button', { name: PLUMBING.item }).click();
  await wizard.getByRole('button', { name: 'Next' }).click();

  // ── Step 2: description and location ──────────────────────────────────────
  // Location is unconditional now — it used to appear only when the service
  // category asked for it, and every category asks for it.
  await wizard.getByPlaceholder('Describe the fault — what is wrong, and since when…').fill(DESCRIPTION);
  await wizard.getByPlaceholder('0712 345 678').fill('0712 345 678');

  await wizard.getByRole('button', { name: 'Office' }).click();
  // office_block needs a facility plus floor and room (area is optional).
  await wizard.getByRole('combobox').last().click();
  await page.getByRole('option', { name: NRB_OFFICE_BLOCK }).click();
  await wizard.getByPlaceholder('e.g. Ground, 1st').fill('2nd');
  await wizard.getByPlaceholder('e.g. Room 14').fill(`Room ${suffix.slice(-3)}`);
  await wizard.getByRole('button', { name: 'Next' }).click();

  // ── Step 3: review and submit ─────────────────────────────────────────────
  await expect(wizard.getByText(PLUMBING.item)).toBeVisible();

  const created = page.waitForResponse(
    (r) => r.url().includes('/tickets/') && r.request().method() === 'POST' && r.ok(),
  );
  await wizard.getByRole('button', { name: 'Submit request' }).click();
  const body = await (await created).json();

  // Create answers `{id, ticket_no}` and nothing else — deliberately, so the
  // caller refetches through the scoped read path rather than trusting a
  // write response. That the ticket opens unassigned is asserted in the next
  // test, where the Claim button only renders for `open` + no assignee.
  ticketNo = body.ticket_no;
  expect(ticketNo, 'the backend must allocate a ticket number').toBeTruthy();

  await expect(wizard.getByText('Request submitted')).toBeVisible();
});

test('the ticket reaches the plumbing technician at that campus', async ({ page }) => {
  // Scope is pairwise (campus AND trade), so this asserts more than "a list
  // rendered": Esther Wairimu is linked to (Nairobi, Plumbing) and the ticket
  // routed to exactly that pair.
  await login(page, USERS.technician);
  await openTicket(page);

  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText(DESCRIPTION)).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Claim' })).toBeVisible();
});

test('claiming drives it from open straight to in progress', async ({ page }) => {
  // Claim is two hops in one action — open → assigned → in_progress — both
  // logged. The technician should not have to press twice to start work they
  // just volunteered for.
  await login(page, USERS.technician);
  await openTicket(page);

  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Claim' }).click();

  await expect(sheet.getByRole('button', { name: 'Claim' })).toBeHidden();
  await expect(sheet.getByText('In Progress', { exact: false }).first()).toBeVisible();
});

test('the assignee resolves it, and the requester sees it resolved', async ({ page }) => {
  await login(page, USERS.technician);
  await openTicket(page);

  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Update Status' }).click();

  const modal = page.getByRole('dialog').filter({ hasText: 'Update ticket status' });
  // The next statuses are radio cards, not a select. Only the transitions
  // `VALID_NEXT` allows are rendered, so this also asserts that in_progress →
  // resolved is offered at all.
  await modal.getByRole('button', { name: 'Resolved', exact: true }).click();
  await modal.getByPlaceholder('Describe what was done or what changed…')
    .fill('Replaced the washer and tested the tap.');
  await modal.getByRole('button', { name: 'Save update' }).click();
  await expect(modal).toBeHidden();

  // And the requester sees the result — the half that matters to them. Read it
  // off the list row rather than opening the ticket: resolved work waiting on
  // the requester raises a "Rate resolution" prompt, which intercepts the
  // click on the dashboard.
  await login(page, USERS.requester);
  await page.getByRole('link', { name: 'My Tickets', exact: true }).click();
  await searchBox(page).fill(ticketNo);
  const row = page.getByRole('row').filter({ hasText: ticketNo });
  await expect(row).toBeVisible();
  await expect(row.getByText('Resolved')).toBeVisible();
});

test('a technician in the same section but a different trade cannot see it', async ({ page }) => {
  // The sharp negative. Anthony Gitau is at Nairobi like the assignee, but
  // linked to Carpentry and Painting — never Plumbing. Scope is pairwise
  // (campus AND trade) via Exists on SectionTechnician; the plausible
  // regression is scoping by campus alone, and this is the case that would
  // catch it from the UI. `scoped_ticket_qs` fails closed, so an unscoped
  // ticket is not merely hidden from the table — it is not in the response.
  await login(page, USERS.technicianOtherTrade);
  await searchBox(page).fill(ticketNo);
  await expect(page.getByText(ticketNo, { exact: false })).toHaveCount(0);
});
