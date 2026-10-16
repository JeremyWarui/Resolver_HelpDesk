import { test, expect } from '@playwright/test';
import { login, loginAsAdmin, uniqueSuffix, USERS } from './helpers';

// System feedback: anyone but the admin sends it from the sidebar, and the
// admin reads it, with who sent it and from which page, and marks it reviewed.

test.describe.configure({ mode: 'serial' });

const message = `E2E feedback ${uniqueSuffix()}: the wizard should remember my last building`;

test('a requester sends feedback from the sidebar, tagged with the page they were on', async ({ page }) => {
  await login(page, USERS.requester);
  await page.getByRole('link', { name: 'My Tickets' }).click();
  await expect(page).toHaveURL(/\/user\/tickets$/);

  await page.getByRole('button', { name: 'Send feedback' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Send feedback').first()).toBeVisible();

  // Too short to send.
  const send = dialog.getByRole('button', { name: 'Send feedback' });
  await dialog.getByLabel('Your feedback').fill('hi');
  await expect(send).toBeDisabled();

  await dialog.getByRole('radio', { name: 'Idea' }).click();
  await expect(dialog.getByRole('radio', { name: 'Idea' })).toHaveAttribute('aria-checked', 'true');
  await dialog.getByLabel('Your feedback').fill(message);
  await expect(dialog.getByText('/user/tickets')).toBeVisible();
  await send.click();

  await expect(page.getByText('Your feedback was sent').first()).toBeVisible();
  await expect(dialog).toBeHidden();
});

test('the admin reads it under New, marks it reviewed, and finds it under Reviewed', async ({ page }) => {
  await loginAsAdmin(page);
  // The admin is who reads it, so the admin has nothing to send.
  await expect(page.getByRole('button', { name: 'Send feedback' })).toHaveCount(0);

  await page.getByRole('link', { name: /System Feedback/ }).click();
  await expect(page.locator('header h1')).toHaveText('System Feedback');

  const entry = page.getByRole('listitem').filter({ hasText: message });
  await expect(entry).toBeVisible();
  await expect(entry).toContainText('Caroline Wafula');
  await expect(entry).toContainText('/user/tickets');
  await expect(entry).toContainText('Idea');

  await entry.getByRole('button', { name: 'Mark reviewed' }).click();
  await expect(entry).toHaveCount(0);

  await page.getByRole('button', { name: 'Reviewed', exact: true }).click();
  await expect(page.getByRole('listitem').filter({ hasText: message })).toBeVisible();
});

test('nobody but the admin has the System Feedback page', async ({ page }) => {
  await login(page, USERS.hos);
  await expect(page.getByRole('link', { name: /System Feedback/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Send feedback' })).toBeVisible();
});
