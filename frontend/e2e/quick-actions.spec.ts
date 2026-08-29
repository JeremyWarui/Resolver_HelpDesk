import { test, expect } from '@playwright/test';
import { login, PLUMBING, USERS } from './helpers';

// The requester's dashboard cards name a trade and nothing else. Clicking one
// must open the wizard already on that trade's fault list — step 1, sub-step
// "item" — not on the trade tiles and not on an empty list.
//
// The empty-list case is the one worth guarding. The wizard resolves the
// pre-filled trade out of the cached catalogue, and `useQuery` hands back the
// same array on every render once it is cached: a resolver that waits for that
// array's identity to change only fires on a refetch, leaving the list empty
// until the round trip lands. `tsc` has no opinion about any of it.

test('a service card opens the wizard on that trade\'s service items', async ({ page }) => {
  await login(page, USERS.requester);

  const card = page.getByRole('button', { name: `${PLUMBING.trade} Services` });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.click();

  const wizard = page.getByRole('dialog');
  await expect(wizard).toBeVisible();

  // The breadcrumb says which trade we are inside, so this asserts the
  // pre-fill resolved rather than merely that a list rendered.
  await expect(wizard.getByText(PLUMBING.trade, { exact: true })).toBeVisible();

  // The trade's own items, not "No services listed under this trade."
  await expect(wizard.getByRole('button', { name: PLUMBING.item })).toBeVisible();
});

// Opening a second time with a different trade must resolve that trade too.
// The first open populates the wizard's idea of the catalogue; if resolution
// depends on that changing, every later open shows an empty list.
test('a second card, opened after the first, resolves its own trade', async ({ page }) => {
  await login(page, USERS.requester);

  const plumbing = page.getByRole('button', { name: `${PLUMBING.trade} Services` });
  await expect(plumbing).toBeVisible({ timeout: 20_000 });
  await plumbing.click();

  const wizard = page.getByRole('dialog');
  await expect(wizard.getByRole('button', { name: PLUMBING.item })).toBeVisible();

  // Close, then open a different trade.
  await page.keyboard.press('Escape');
  await expect(wizard).toBeHidden();

  const carpentry = page.getByRole('button', { name: 'Carpentry Services' });
  await carpentry.click();

  await expect(wizard).toBeVisible();
  await expect(wizard.getByText('Carpentry', { exact: true })).toBeVisible();
  await expect(
    wizard.getByText('No services listed under this trade.'),
    'the second open must resolve its trade, not fall back to an empty list',
  ).toBeHidden();
});
