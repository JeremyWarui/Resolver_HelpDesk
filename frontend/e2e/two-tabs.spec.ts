import { test, expect, type Route } from '@playwright/test';
import { loginAsAdmin } from './helpers';

// Two tabs share one refresh cookie, and the server rotates it on every
// refresh. When both refresh at once, the second is refused because the first
// already used the cookie. The refused tab must pick up the token the other
// tab stored, not sign both tabs out.
test('two tabs refreshing at once both stay signed in', async ({ context }) => {
  const first = await context.newPage();
  await loginAsAdmin(first);
  const second = await context.newPage();
  await second.goto('/dashboard');
  await expect(second).toHaveURL(/\/dashboard/);

  // Hold both refreshes until both have arrived, then answer them in turn:
  // the second goes to the server with the cookie the first just used up.
  const held: Route[] = [];
  let bothArrived!: () => void;
  const arrived = new Promise<void>((resolve) => { bothArrived = resolve; });
  await context.route('**/api/v1/auth/refresh/', async (route) => {
    held.push(route);
    if (held.length === 2) bothArrived();
  });

  // An expired access token, as each tab's next request sees it.
  for (const page of [first, second]) {
    await page.route('**/api/v1/auth/me/', (route) => route.fulfill({ status: 401, body: '{}' }), { times: 1 });
  }
  await Promise.all([first.reload(), second.reload()]);
  await arrived;

  const winner = await held[0].fetch();
  expect(winner.status()).toBe(200);
  await held[0].fulfill({ response: winner });
  const loser = await held[1].fetch();
  expect(loser.status(), 'the cookie was already used').toBe(401);
  await held[1].fulfill({ response: loser });
  await context.unroute('**/api/v1/auth/refresh/');

  for (const page of [first, second]) {
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/dashboard/);
    expect(await page.evaluate(() => localStorage.getItem('authToken'))).toBeTruthy();
  }
});
