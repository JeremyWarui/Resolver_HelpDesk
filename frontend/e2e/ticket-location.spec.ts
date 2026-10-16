import { test, expect } from '@playwright/test';
import { login, PLUMBING, USERS } from './helpers';

// Every location is a facility off the register plus one line saying where in
// it. The line is required: Next stays disabled until it is filled.
test('a location needs a facility and where in it', async ({ page }) => {
  await login(page, USERS.requester);

  await page.getByRole('button', { name: 'New Ticket' }).first().click();
  const wizard = page.getByRole('dialog');

  await wizard.getByRole('button', { name: PLUMBING.trade }).click();
  await wizard.getByRole('button', { name: PLUMBING.item }).click();
  await wizard.getByRole('button', { name: 'Next' }).click();

  await wizard
    .getByPlaceholder('Describe the fault — what is wrong, and since when…')
    .fill('E2E equipment fault — standby generator will not start');

  await wizard.getByRole('button', { name: 'Equipment' }).click();
  await wizard.getByRole('combobox').last().click();
  await page.getByRole('option').first().click();

  const next = wizard.getByRole('button', { name: 'Next' });
  await expect(next).toBeDisabled();
  await wizard.getByLabel('Where in it').fill('Generator house, east side');
  await expect(next).toBeEnabled();
  await next.click();

  await expect(wizard.getByText('Generator house, east side')).toBeVisible();

  const created = page.waitForResponse(
    (r) =>
      /\/tickets\/$/.test(new URL(r.url()).pathname) &&
      r.request().method() === 'POST' &&
      r.ok(),
  );
  await wizard.getByRole('button', { name: 'Submit request' }).click();

  const body = await (await created).json();
  expect(body.ticket_no, 'the ticket must actually be created').toBeTruthy();
});
