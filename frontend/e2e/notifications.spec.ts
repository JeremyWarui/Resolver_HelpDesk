import { test, expect, type APIRequestContext } from '@playwright/test';
import { login, seedPassword, USERS } from './helpers';

// The Notifications page: every role has it in the sidebar with an unread
// count, it filters server-side, and a row opens its ticket.

const API = 'http://localhost:8001/api/v1';

async function token(request: APIRequestContext, email: string): Promise<string> {
  const res = await request.post(`${API}/auth/login/`, { data: { email, password: seedPassword() } });
  expect(res.ok(), `login as ${email}`).toBeTruthy();
  return (await res.json()).accessToken;
}

test('an assignment reaches the requester, unread, and opens its ticket', async ({ page, request }) => {
  // Set up: the HOS assigns one of the requester's open tickets.
  const requesterAuth = { Authorization: `Bearer ${await token(request, USERS.requester)}` };
  const hosAuth = { Authorization: `Bearer ${await token(request, USERS.hos)}` };
  const techAuth = { Authorization: `Bearer ${await token(request, USERS.technician)}` };

  const open = await (await request.get(`${API}/tickets/`, {
    headers: requesterAuth, params: { mine: 1, status: 'open', page_size: 50 },
  })).json();
  const plumbing = open.results.find((t: { trade: { name: string } }) => t.trade.name === 'Plumbing');
  test.skip(!plumbing, 'the requester has no open plumbing ticket to assign');

  // Start from nothing unread, so the one assignment is all the page shows.
  await request.post(`${API}/notifications/read-all/`, { headers: requesterAuth });
  const technician = await (await request.get(`${API}/auth/me/`, { headers: techAuth })).json();
  const assigned = await request.post(`${API}/tickets/${plumbing.id}/assign/`, {
    headers: hosAuth, data: { assigned_to: technician.id },
  });
  expect(assigned.ok(), 'the HOS assigns the ticket').toBeTruthy();

  await login(page, USERS.requester);

  // The sidebar counts it.
  const navItem = page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: /Notifications/ });
  const badge = navItem.getByLabel(/Notifications$/);
  await expect(badge).toBeVisible();
  expect(Number(await badge.innerText())).toBeGreaterThan(0);
  await navItem.click();
  await expect(page).toHaveURL(/\/user\/notifications$/);
  await expect(page.locator('header h1')).toHaveText('Notifications');

  // Unread is a server-side filter, and holds exactly what arrived.
  await page.getByRole('tab', { name: /^Unread/ }).click();
  const row = page.locator('main').getByRole('button', { name: new RegExp(plumbing.ticket_no) });
  await expect(row.first()).toBeVisible();

  // A row opens its ticket and is read from then on. Older messages may name
  // the same ticket, so count rather than assume one.
  const unreadBefore = await row.count();
  await row.first().click();
  await expect(page.getByRole('dialog').getByText(plumbing.ticket_no).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(row).toHaveCount(unreadBefore - 1);
});

test('the header names who is signed in, and the sidebar is the way to notifications', async ({ page }) => {
  await login(page, USERS.technician);
  const me = await page.evaluate(async () => {
    const r = await fetch('http://localhost:8001/api/v1/auth/me/', {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
    });
    return r.json();
  });
  await expect(page.getByTestId('signed-in-as')).toHaveText(`${me.first_name} ${me.last_name}`.trim());
  await expect(page.locator('header').getByRole('button', { name: 'Notifications' })).toHaveCount(0);

  await page.getByRole('link', { name: /Notifications/ }).click();
  await expect(page).toHaveURL(/\/tech\/notifications$/);
  await expect(page.locator('header h1')).toHaveText('Notifications');

  // On a phone the drawer hides the badge, so the menu button says what is unread.
  const unread = await page.evaluate(async () => {
    const r = await fetch('http://localhost:8001/api/v1/notifications/?limit=1', {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
    });
    return (await r.json()).unread_count as number;
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('header').getByRole('button', { name: /^Open menu/ })).toHaveAccessibleName(
    unread > 0 ? `Open menu, ${unread} unread` : 'Open menu',
  );
});

test('the Comments tab holds comments and nothing else', async ({ page, request }) => {
  // Set up: the HOS comments on a job the technician holds, so the tab has one.
  const hosAuth = { Authorization: `Bearer ${await token(request, USERS.hos)}` };
  const techAuth = { Authorization: `Bearer ${await token(request, USERS.technician)}` };
  const technician = await (await request.get(`${API}/auth/me/`, { headers: techAuth })).json();
  const held = await (await request.get(`${API}/tickets/`, {
    headers: techAuth, params: { assigned_to: technician.id, status: 'in_progress', page_size: 1 },
  })).json();
  test.skip(!held.results.length, 'the technician holds no job in progress');
  const comment = `Any update on this one? (${Date.now().toString(36)})`;
  const posted = await request.post(`${API}/tickets/${held.results[0].id}/comments/`, {
    headers: hosAuth, data: { body: comment },
  });
  expect(posted.ok(), 'the HOS comments').toBeTruthy();

  await login(page, USERS.technician);
  await page.getByRole('link', { name: /Notifications/ }).click();
  await page.getByRole('tab', { name: 'Comments' }).click();
  await expect(page.getByRole('tab', { name: 'Comments' })).toHaveAttribute('aria-selected', 'true');

  // The comment arrives as the HOS's message, and the tab holds nothing else.
  await expect(page.locator('main [role="tabpanel"]').getByText(comment)).toBeVisible();
  const titles = await page.locator('main [role="tabpanel"] section > div > *')
    .locator('span.min-w-0 > span.block:first-child').allInnerTexts();
  expect(titles.length).toBeGreaterThan(0);
  for (const title of titles) expect(title).toMatch(/comment/i);
});

test('the page shows about a screenful, and Load more adds the next one', async ({ page, request }) => {
  // The page's own rule: a row is about 80px under a 240px header, 6 to 20 rows.
  const viewportHeight = page.viewportSize()!.height;
  const pageSize = Math.min(20, Math.max(6, Math.floor((viewportHeight - 240) / 80)));

  const requesterAuth = { Authorization: `Bearer ${await token(request, USERS.requester)}` };
  const feed = await (await request.get(`${API}/notifications/`, {
    headers: requesterAuth, params: { limit: pageSize + 1 },
  })).json();
  test.skip(feed.results.length <= pageSize, 'the requester has one page of notifications or fewer');

  await login(page, USERS.requester);
  await page.getByRole('link', { name: /Notifications/ }).click();
  const rows = page.locator('main [role="tabpanel"] section > div > *');
  await expect(rows).toHaveCount(pageSize);

  await page.getByRole('button', { name: 'Load more' }).click();
  await expect(rows.nth(pageSize)).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(pageSize);
});

test('the HOS handover note reaches the technician as a message', async ({ page, request }) => {
  const requesterAuth = { Authorization: `Bearer ${await token(request, USERS.requester)}` };
  const hosAuth = { Authorization: `Bearer ${await token(request, USERS.hos)}` };
  const techAuth = { Authorization: `Bearer ${await token(request, USERS.technician)}` };

  const open = await (await request.get(`${API}/tickets/`, {
    headers: requesterAuth, params: { mine: 1, status: 'open', page_size: 50 },
  })).json();
  const plumbing = open.results.find((t: { trade: { name: string } }) => t.trade.name === 'Plumbing');
  test.skip(!plumbing, 'the requester has no open plumbing ticket to assign');

  const handover = `Shut the mains valve first (${Date.now().toString(36)})`;
  const technician = await (await request.get(`${API}/auth/me/`, { headers: techAuth })).json();
  const assigned = await request.post(`${API}/tickets/${plumbing.id}/assign/`, {
    headers: hosAuth, data: { assigned_to: technician.id, note: handover },
  });
  expect(assigned.ok(), 'the HOS assigns with a handover note').toBeTruthy();

  await login(page, USERS.technician);
  await page.getByRole('link', { name: /Notifications/ }).click();
  const message = page.locator('main [role="tabpanel"]').getByText(handover);
  await expect(message).toBeVisible();
  // It sits on the row that says who assigned it.
  await expect(page.locator('main [role="tabpanel"] section > div > *').filter({ hasText: handover }))
    .toContainText(/assigned you/);
});
