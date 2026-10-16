import { test, expect } from '@playwright/test';
import { latestResetLink } from './helpers';

// Forgot password, end to end: ask on the sign-in page, open the emailed link,
// set a new password, sign in with it. Loise is a seeded requester no other
// spec signs in as, so her new password breaks nothing else.
const EMAIL = 'loise.wanjala@ksg.ac.ke';
const NEW = 'e2e-a-sturdy-new-passphrase-42';

test('a forgotten password is reset from the emailed link, which then stops working', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await page.getByLabel('Email Address').fill(EMAIL);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();

  await expect.poll(() => latestResetLink(EMAIL)).not.toBeNull();
  const link = latestResetLink(EMAIL)!;
  await page.goto(link);
  await expect(page).toHaveURL(/\/reset-password$/);

  await page.getByLabel('New password').fill('12345678');
  await page.getByLabel('Type it again').fill('12345678');
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page.getByText(/entirely numeric|too common/)).toBeVisible();

  await page.getByLabel('New password').fill(NEW);
  await page.getByLabel('Type it again').fill(NEW);
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(NEW);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/user/);

  await page.goto(link);
  await page.getByLabel('New password').fill(NEW);
  await page.getByLabel('Type it again').fill(NEW);
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page.getByText('This link no longer works')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Send a new link' })).toBeVisible();
});

test('an address with no account is answered the same, and nothing is sent', async ({ page }) => {
  await page.goto('/forgot-password');
  await page.getByLabel('Email Address').fill('nobody.here@ksg.ac.ke');
  await page.getByRole('button', { name: 'Send reset link' }).click();

  await expect(page.getByText('Check your email')).toBeVisible();
  await expect(page.getByText('If an account uses that address')).toBeVisible();
  expect(latestResetLink('nobody.here@ksg.ac.ke')).toBeNull();
});

test('a link with its token missing says so instead of showing the form', async ({ page }) => {
  await page.goto('/reset-password?uid=MQ');

  await expect(page.getByText('This link no longer works')).toBeVisible();
  await expect(page.getByLabel('New password')).toHaveCount(0);
});
