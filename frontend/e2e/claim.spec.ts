import { test, expect, type Page } from '@playwright/test';
import { login, PLUMBING, NRB_OFFICE_BLOCK, USERS, uniqueSuffix } from './helpers';

// Claiming is the technician half of assignment: nobody hands the ticket over,
// they take it. It is two hops in one action — open → assigned → in_progress —
// so the person who volunteered does not have to press start afterwards.
//
// The case that matters is two technicians claiming at once. The server takes a
// row lock and the loser gets a 409, which no amount of UI testing reaches
// unless a second claim is actually fired at the same ticket.

const suffix = uniqueSuffix();
let ticketNo = '';
let ticketId = 0;

/** The access token this signed-in page is using, for the raced second claim. */
async function bearer(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem('authToken'));
  expect(token, 'the signed-in page must hold an access token').toBeTruthy();
  return token as string;
}

test.describe.configure({ mode: 'serial' });

test('a requester raises a plumbing ticket, which opens unassigned', async ({ page }) => {
  await login(page, USERS.requester);
  await page.getByRole('button', { name: 'New Ticket' }).first().click();

  const wizard = page.getByRole('dialog');
  await wizard.getByRole('button', { name: PLUMBING.trade }).click();
  await wizard.getByRole('button', { name: PLUMBING.item }).click();
  await wizard.getByRole('button', { name: 'Next' }).click();
  await wizard
    .getByPlaceholder('Describe the fault — what is wrong, and since when…')
    .fill(`CLAIM ${suffix} — washroom tap will not shut off`);
  await wizard.getByRole('button', { name: 'Office' }).click();
  await wizard.getByRole('combobox').last().click();
  await page.getByRole('option', { name: NRB_OFFICE_BLOCK }).click();
  await wizard.getByLabel('Where in it').fill(`Floor 2, Room ${suffix.slice(-3)}`);
  await wizard.getByRole('button', { name: 'Next' }).click();

  const created = page.waitForResponse(
    (r) => /\/tickets\/$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST' && r.ok(),
  );
  await wizard.getByRole('button', { name: 'Submit request' }).click();
  const body = await (await created).json();
  ticketNo = body.ticket_no;
  ticketId = body.id;
  expect(ticketNo).toBeTruthy();
});

test('it lands in the claimable pool of the matching trade, not the others', async ({ page }) => {
  // Esther is plumbing at Nairobi, so the ticket is hers to take.
  await login(page, USERS.technician);
  await page.goto('/tech/available');
  await expect(page.getByText(ticketNo, { exact: false }).first()).toBeVisible({ timeout: 20_000 });

  // Anthony is carpentry at the same campus. Scope is the (campus, trade) pair,
  // so a shared campus must not be enough to see it.
  await login(page, USERS.technicianOtherTrade);
  await page.goto('/tech/available');
  // The tab has loaded, either way, before its absence means anything.
  const panel = page.getByRole('tabpanel');
  await expect(panel.getByRole('article').first().or(panel.getByText('Nothing to claim'))).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(ticketNo, { exact: false })).toHaveCount(0);
});

test('an out-of-trade technician is refused the claim outright', async ({ page }) => {
  await login(page, USERS.technicianOtherTrade);
  const token = await bearer(page);

  const res = await page.request.post(`http://localhost:8001/api/v1/tickets/${ticketId}/claim/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // The pk is client-supplied, so scope is re-checked on the action itself and
  // not merely on the list that led here.
  expect(res.status(), 'a carpenter must not claim a plumbing ticket').toBe(403);
});

test('the HOS is not offered a claim — supervisors assign, they do not take', async ({ page }) => {
  await login(page, USERS.hos);
  const token = await bearer(page);

  const res = await page.request.post(`http://localhost:8001/api/v1/tickets/${ticketId}/claim/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status(), 'only technicians may claim').toBe(403);

  await page.goto('/hos/tickets');
  await page.getByPlaceholder(/Search/i).first().fill(ticketNo);
  await page.getByText(ticketNo, { exact: false }).first().click();
  const sheet = page.getByRole('dialog').first();
  await expect(sheet.getByRole('button', { name: 'Assign', exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(sheet.getByRole('button', { name: 'Claim' })).toHaveCount(0);
});

test('the technician claims it from its card, and one action carries it to in progress', async ({ page }) => {
  await login(page, USERS.technician);
  await page.goto('/tech/available');
  const card = page.getByRole('article', { name: new RegExp(ticketNo) });
  await expect(card).toBeVisible({ timeout: 20_000 });

  const claimed = page.waitForResponse(
    (r) => r.url().includes('/claim/') && r.request().method() === 'POST',
  );
  await card.getByRole('button', { name: 'Claim' }).click();
  expect((await claimed).status(), 'the claim must be accepted').toBe(200);

  // Taken, it leaves Available for Active, offering the next step there.
  await expect(card).toHaveCount(0);
  await page.getByRole('tab', { name: /^Active/ }).click();
  const mine = page.getByRole('article', { name: new RegExp(ticketNo) });
  await expect(mine.getByRole('button', { name: 'Update status' })).toBeVisible();

  // One press, two hops: it is theirs and it is already started.
  // The card's title is its link.
  await mine.getByRole('button').first().click();
  const sheet = page.getByRole('dialog').first();
  await expect(sheet.getByRole('button', { name: 'Claim' })).toHaveCount(0);
  await expect(sheet.getByRole('list', { name: 'Progress' }).locator('[aria-current="step"]')).toHaveText(/In Progress$/);
  await expect(sheet.getByText('Esther', { exact: false }).first()).toBeVisible();
});

test('the trail records both hops, not just the one the technician pressed', async ({ page }) => {
  await login(page, USERS.technician);
  await page.goto('/tech/assigned');
  await page.getByText(ticketNo, { exact: false }).first().click();

  const sheet = page.getByRole('dialog').first();
  await expect(sheet.getByRole('list', { name: 'Progress' }).locator('[aria-current="step"]')).toHaveText(/In Progress$/, { timeout: 20_000 });
  // open → assigned → in_progress, both logged, so the trail reads the same as
  // two moves made by hand.
  await expect(sheet.getByText(/^· to Esther/).first()).toBeVisible();
  await expect(sheet.getByText('Assigned → In Progress').first()).toBeVisible();
});

test('a second claim on the same ticket loses, with a 409', async ({ page }) => {
  await login(page, USERS.technician);
  const token = await bearer(page);

  const res = await page.request.post(`http://localhost:8001/api/v1/tickets/${ticketId}/claim/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status(), 'an already-claimed ticket must be refused').toBe(409);
  expect((await res.json()).detail).toMatch(/already been claimed or assigned/i);
});
