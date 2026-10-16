import { test, expect } from '@playwright/test';
import { login, seedPassword, USERS } from './helpers';

// The technician's On Hold and Escalated tabs list only what is assigned to
// them, which is narrower than their server scope — a technician's
// `scoped_ticket_qs` returns their whole (campus, trade) pool.
//
// That narrowing is load-bearing rather than cosmetic. `TicketStatusView`
// lets a technician change status only on tickets assigned to *them*, so a
// Resume button on a section-mate's held job would answer 403. A spec that only
// checked the tab rendered would pass on the broken version, so these assert
// the request itself.

test('the On Hold tab lists only the technician\'s own held jobs', async ({ page }) => {
  // Explicit width: the Resume assertion below is a claim about layout.
  await page.setViewportSize({ width: 1600, height: 1000 });
  await login(page, USERS.technician);

  // `page_size=100` pins this to the tab's list request, not the counts.
  const listRequest = page.waitForRequest(
    (r) =>
      r.url().includes('/tickets/') &&
      r.url().includes('status=pending') &&
      r.url().includes('page_size=100'),
  );
  await page.getByRole('tab', { name: /^On Hold/ }).click();
  await expect(page).toHaveURL(/\/tech\/pending$/);
  await expect(page.locator('header h1')).toHaveText('My Jobs');

  const url = new URL((await listRequest).url());
  expect(
    url.searchParams.get('assigned_to'),
    'the technician list must be narrowed to the signed-in user, not their whole trade',
  ).toBeTruthy();

  // Wait for one outcome first: counting rows before the list has loaded reads zero.
  const rows = page.locator('tbody tr');
  const empty = page.getByText('Nothing is on hold').first();
  await expect(rows.first().or(empty)).toBeVisible({ timeout: 20_000 });

  // The tab's count is what a technician reads before opening it. Zero shows none.
  const tab = page.getByRole('tab', { name: /^On Hold/ });
  if (await empty.isVisible()) {
    await expect(tab).toHaveText('On Hold');
    return;
  }
  await expect(tab).toHaveText(`On Hold${await rows.count()}`);
  await expect(rows.first().getByRole('button', { name: 'Resume' })).toBeInViewport();
});

test('the Escalated tab lists only the technician\'s own late jobs', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await login(page, USERS.technician);

  const listRequest = page.waitForRequest(
    (r) =>
      r.url().includes('/tickets/') &&
      r.url().includes('escalated=1') &&
      r.url().includes('page_size=100'),
  );
  await page.getByRole('tab', { name: /^Escalated/ }).click();
  await expect(page).toHaveURL(/\/tech\/escalated$/);

  const url = new URL((await listRequest).url());
  expect(
    url.searchParams.get('assigned_to'),
    'escalated is scoped to what the technician holds, not the whole trade',
  ).toBeTruthy();

  const rows = page.locator('tbody tr');
  const empty = page.getByText('Nothing has escalated').first();
  await expect(rows.first().or(empty)).toBeVisible({ timeout: 20_000 });
  if (await empty.isVisible()) return;

  // Every row is theirs, so the Assigned To column is left out altogether.
  await expect(page.locator('table thead th').filter({ hasText: 'Assigned To' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /^Escalated/ })).toHaveText(`Escalated${await rows.count()}`);
});

test('My Jobs is the landing page, and Active holds only the technician\'s live work', async ({ page }) => {
  await login(page, USERS.technician);
  await expect(page).toHaveURL(/\/tech$/);
  await expect(page.locator('header h1')).toHaveText('My Jobs');
  await expect(page.getByRole('tab', { name: /^Active/ })).toHaveAttribute('aria-selected', 'true');

  const cards = page.getByRole('tabpanel').getByRole('article');
  const empty = page.getByText('No active jobs');
  await expect(cards.first().or(empty)).toBeVisible({ timeout: 20_000 });
  for (const card of await cards.all()) {
    // Active means assigned or in progress, and each card offers its next step.
    const status = (await card.innerText()).includes('In Progress') ? 'In Progress' : 'Assigned';
    await expect(card).toContainText(status);
    await expect(card.getByRole('button', { name: status === 'Assigned' ? 'Start work' : 'Update status' }))
      .toBeVisible();
  }
});

test('every My Jobs tab keeps My Jobs current in the sidebar and the header', async ({ page }) => {
  await login(page, USERS.technician);
  const myJobs = page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'My Jobs' });
  for (const path of ['/tech', '/tech/available', '/tech/pending', '/tech/escalated', '/tech/assigned']) {
    await page.goto(path);
    await expect(page.locator('header h1')).toHaveText('My Jobs');
    await expect(myJobs).toHaveAttribute('aria-current', 'page');
  }
  await page.goto('/tech/section');
  await expect(myJobs).not.toHaveAttribute('aria-current', 'page');
});

test('Section Tickets asks for live work by default', async ({ page }) => {
  await login(page, USERS.technician);
  const listRequest = page.waitForRequest(
    (r) => r.url().includes('/tickets/') && r.url().includes('status=active'),
  );
  await page.getByRole('link', { name: 'Section Tickets' }).click();
  await expect(page).toHaveURL(/\/tech\/section$/);
  await listRequest;
  for (const row of await page.locator('tbody tr').all()) {
    await expect(row).not.toContainText(/Resolved|Closed/);
  }
});

test('Start work on a card moves the job on, and the card then offers Update status', async ({ page, request }) => {
  const API = 'http://localhost:8000/api/v1';
  const token = async (email: string) => {
    const res = await request.post(`${API}/auth/login/`, { data: { email, password: seedPassword() } });
    return { Authorization: `Bearer ${(await res.json()).accessToken}` };
  };
  // Set up: the HOS assigns one open plumbing job to the technician.
  const techAuth = await token(USERS.technician);
  const hosAuth = await token(USERS.hos);
  const open = await (await request.get(`${API}/tickets/`, {
    headers: techAuth, params: { status: 'open', page_size: 50 },
  })).json();
  test.skip(!open.results.length, 'nothing open in the technician\'s trades to assign');
  const job = open.results[0];
  const me = await (await request.get(`${API}/auth/me/`, { headers: techAuth })).json();
  const assigned = await request.post(`${API}/tickets/${job.id}/assign/`, {
    headers: hosAuth, data: { assigned_to: me.id },
  });
  expect(assigned.ok()).toBeTruthy();

  await login(page, USERS.technician);
  const card = page.getByRole('article', { name: new RegExp(job.ticket_no) });
  await expect(card.getByRole('button', { name: 'Start work' })).toBeVisible({ timeout: 20_000 });

  const started = page.waitForResponse((r) => r.url().includes(`/tickets/${job.id}/status/`));
  await card.getByRole('button', { name: 'Start work' }).click();
  expect((await started).status()).toBe(200);
  await expect(card.getByRole('button', { name: 'Update status' })).toBeVisible();
  await expect(card).toContainText('In Progress');
});
