import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  login,
  seedPassword,
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
// the wizard posts a `location` shape the create serializer validates,
// claim depends on `open` implying unassigned, and the status modal's
// `VALID_NEXT` is a hand-maintained mirror of `ALLOWED` in lifecycle.py.
//
// Serial: each step needs the ticket the previous one left behind. Tickets are
// append-only (TicketLog is immutable), so this leaves its ticket in place —
// the `E2E` marker in the description is how you find them.

test.describe.configure({ mode: 'serial' });

const suffix = uniqueSuffix();
const DESCRIPTION = `E2E ${suffix} — tap dripping continuously in the wash room`;
const COMMENT = `Washer is worn through; replacing it today (${suffix}).`;

/** Set by the first test, read by the rest. */
let ticketNo = '';
let ticketId = 0;

const API = 'http://localhost:8000/api/v1';

async function authAs(request: APIRequestContext, email: string) {
  const res = await request.post(`${API}/auth/login/`, { data: { email, password: seedPassword() } });
  expect(res.ok(), `login as ${email}`).toBeTruthy();
  return { Authorization: `Bearer ${(await res.json()).accessToken}` };
}

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

/** Open the ticket from the technician's My Jobs, on the tab it sits under. */
async function openJob(page: Page, tab: 'Available' | 'Active'): Promise<void> {
  await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
  // The card's title is the button that opens it; Claim is the other one.
  const card = page.getByRole('article', { name: new RegExp(`${ticketNo}$`) });
  await card.getByRole('button', { name: PLUMBING.item, exact: true }).click();
  await expect(page.getByRole('dialog').getByText(ticketNo)).toBeVisible();
}

const EVIDENCE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const EVIDENCE_NAME = 'evidence.png';

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

  // The uploader stages the file; the request goes out after the ticket exists.
  // This shipped as a mock — a timer filled a progress bar and nothing was ever
  // sent — so the assertion that matters is the POST below, not the file row.
  await wizard.locator('input[type="file"]').setInputFiles({
    name: EVIDENCE_NAME,
    mimeType: 'image/png',
    buffer: EVIDENCE_PNG,
  });
  await expect(wizard.getByText(EVIDENCE_NAME)).toBeVisible();

  await wizard.getByRole('button', { name: 'Office' }).click();
  // A location is a facility off the register plus where in it.
  await wizard.getByRole('combobox').last().click();
  await page.getByRole('option', { name: NRB_OFFICE_BLOCK }).click();
  await wizard.getByLabel('Where in it').fill(`Floor 2, Room ${suffix.slice(-3)}`);
  await wizard.getByRole('button', { name: 'Next' }).click();

  // ── Step 3: review and submit ─────────────────────────────────────────────
  await expect(wizard.getByText(PLUMBING.item)).toBeVisible();

  const created = page.waitForResponse(
    (r) =>
      /\/tickets\/$/.test(new URL(r.url()).pathname) &&
      r.request().method() === 'POST' &&
      r.ok(),
  );
  const uploaded = page.waitForResponse(
    (r) =>
      r.url().includes('/attachments/') && r.request().method() === 'POST' && r.ok(),
  );
  await wizard.getByRole('button', { name: 'Submit request' }).click();
  const body = await (await created).json();
  expect((await uploaded).status(), 'the staged file must actually be uploaded').toBe(201);

  // Create answers `{id, ticket_no}` and nothing else — deliberately, so the
  // caller refetches through the scoped read path rather than trusting a
  // write response. That the ticket opens unassigned is asserted in the next
  // test, where the Claim button only renders for `open` + no assignee.
  ticketNo = body.ticket_no;
  ticketId = body.id;
  expect(ticketNo, 'the backend must allocate a ticket number').toBeTruthy();

  await expect(wizard.getByText('Request submitted')).toBeVisible();
});

test('the ticket reaches the plumbing technician at that campus', async ({ page }) => {
  // Scope is pairwise (campus AND trade), so this asserts more than "a list
  // rendered": Esther Wairimu is linked to (Nairobi, Plumbing) and the ticket
  // routed to exactly that pair. It waits under Available for someone to claim.
  await login(page, USERS.technician);
  await openJob(page, 'Available');

  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText(DESCRIPTION)).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Claim' })).toBeVisible();
  // The photo the requester attached has to reach the person doing the work —
  // uploading it and never rendering it would be the same bug in a new place.
  await expect(sheet.getByText(EVIDENCE_NAME)).toBeVisible();
});

test('claiming drives it from open straight to in progress', async ({ page }) => {
  // Claim is two hops in one action — open → assigned → in_progress — both
  // logged. The technician should not have to press twice to start work they
  // just volunteered for.
  await login(page, USERS.technician);
  await openJob(page, 'Available');

  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Claim' }).click();

  await expect(sheet.getByRole('button', { name: 'Claim' })).toBeHidden();
  await expect(sheet.getByRole('list', { name: 'Progress' }).locator('[aria-current="step"]')).toHaveText(/In Progress$/);

  // The assignee logs what they found.
  await sheet.getByPlaceholder('Add a comment…').fill(COMMENT);
  await sheet.getByRole('button', { name: 'Send' }).click();
  await expect(sheet.getByText(COMMENT)).toBeVisible();
});

test('while it is in progress the requester sees the trail but not the comments', async ({ page }) => {
  await login(page, USERS.requester);
  await page.getByRole('link', { name: 'My Tickets', exact: true }).click();
  await openTicket(page);

  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('Activity')).toBeVisible();
  await expect(sheet.getByText(COMMENT)).toHaveCount(0);
  await expect(sheet.getByText('Notes from the maintenance team')).toHaveCount(0);
});

test('the assignee resolves it, and the requester sees it resolved', async ({ page }) => {
  await login(page, USERS.technician);
  await openJob(page, 'Active');

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

  // Resolved, the requester can read what the technician wrote, but not reply.
  await row.getByText(ticketNo).click();
  const detail = page.getByRole('dialog');
  await expect(detail.getByText('Notes from the maintenance team')).toBeVisible();
  await expect(detail.getByText(COMMENT)).toBeVisible();
  await expect(detail.getByPlaceholder('Add a comment…')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(detail).toBeHidden();

  // Rating is the requester's half of the lifecycle: feedback, then close.
  // The Actions cell keys on `has_feedback` now — it read `ticket.feedback`,
  // which only the detail serializer sends, so the test was always undefined.
  // That is invisible in this path (rating closes the ticket, so the row stops
  // being `resolved` either way) and bites only when the close after the
  // feedback fails: the ticket stays resolved *and* rated, and the old code
  // offered "Rate & close" a second time, which answers 409.
  await expect(row.getByRole('button', { name: 'Rate & close' })).toBeVisible();
  await row.getByRole('button', { name: 'Rate & close' }).click();

  const rating = page.getByRole('dialog').filter({ hasText: 'Rate resolution' });
  await rating.getByLabel('4 stars').click();
  await rating.getByRole('button', { name: 'Submit & close ticket' }).click();
  await expect(rating).toBeHidden({ timeout: 20_000 });

  const ratedRow = page.getByRole('row').filter({ hasText: ticketNo });
  await expect(ratedRow.getByText('Closed')).toBeVisible({ timeout: 20_000 });
  await expect(ratedRow.getByRole('button', { name: 'Rate & close' })).toHaveCount(0);
});

test('a technician at the same campus but a different trade cannot see it', async ({ request }) => {
  // The sharp negative. Anthony Gitau is at Nairobi like the assignee, but
  // linked to Carpentry and Painting — never Plumbing. Scope is pairwise
  // (campus AND trade) via Exists on SectionTechnician; the plausible
  // regression is scoping by campus alone, and this is the case that would
  // catch it from the UI. `scoped_ticket_qs` fails closed, so an unscoped
  // ticket is not merely hidden from a list — the server refuses it.
  const read = (auth: Record<string, string>) => request.get(`${API}/tickets/${ticketId}/`, { headers: auth });
  expect((await read(await authAs(request, USERS.technician))).status(), 'the plumber reads it').toBe(200);
  expect((await read(await authAs(request, USERS.technicianOtherTrade))).status()).toBe(403);
});
