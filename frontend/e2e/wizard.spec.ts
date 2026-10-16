import { test, expect } from '@playwright/test';
import { login, USERS, PLUMBING } from './helpers';

// The wizard's first step: a card per trade saying what it covers, focus that
// follows the pick, and a dialog that fits a short laptop screen.

test.use({ viewport: { width: 1366, height: 650 } });

test('a trade card says what it covers, and picking one by keyboard lands on its faults', async ({ page }) => {
  await login(page, USERS.requester);
  await page.getByRole('button', { name: 'New Ticket' }).first().click();
  const wizard = page.getByRole('dialog');

  const plumbing = wizard.getByRole('button', { name: PLUMBING.trade });
  await expect(plumbing).toHaveCount(1);
  // The hint is the card's description, drawn from the catalogue.
  await expect(plumbing).toHaveAccessibleDescription(/,/);

  await plumbing.focus();
  await page.keyboard.press('Enter');
  // Focus moved to the first fault, not back to the top of the dialog.
  await expect(wizard.getByRole('button', { name: PLUMBING.item })).toBeVisible();
  const focusedText = await page.evaluate(() => document.activeElement?.closest('[data-options]') !== null);
  expect(focusedText, 'focus lands in the fault list').toBe(true);

  await page.keyboard.press('Enter');
  // The footer stays reachable on a 650px-tall screen.
  const next = wizard.getByRole('button', { name: 'Next' });
  await expect(next).toBeInViewport();
  await expect(next).toBeEnabled();

  await wizard.getByRole('button', { name: 'Change' }).click();
  await expect(wizard.getByRole('button', { name: PLUMBING.trade })).toBeVisible();
});
