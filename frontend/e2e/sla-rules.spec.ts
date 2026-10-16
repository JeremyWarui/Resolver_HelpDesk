import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers';

// SLA Rules: one card per priority, each duration edited in minutes in place.
// Self-cleaning: every value changed here is put back.

test('a priority target is edited in place, and put back', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/dashboard/sla-rules');

  const low = page.getByRole('region', { name: 'Low', exact: true });
  await expect(low).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('main').getByRole('region')).toHaveCount(4);

  const editName = { name: 'Edit Low response', exact: true };
  const edit = low.getByRole('button', editName);
  // The figure beside the pencil.
  const row = low.locator('div', { has: page.getByRole('button', editName) }).last();
  const before = (await row.innerText()).trim();

  await edit.click();
  const input = low.getByRole('spinbutton', { name: 'Response in minutes' });
  const original = await input.inputValue();
  await input.fill(String(Number(original) + 1));
  await low.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Target updated').first()).toBeVisible();
  await expect(input).toHaveCount(0);
  await expect(row).not.toHaveText(before);

  await edit.click();
  await input.fill(original);
  await input.press('Enter');
  await expect(input).toHaveCount(0);
  await expect(row).toHaveText(before);
});

test('a target the server refuses keeps the row open with the reason', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/dashboard/sla-rules');

  // A response target longer than the resolution target is out of order.
  const critical = page.getByRole('region', { name: 'Critical', exact: true });
  await critical.getByRole('button', { name: 'Edit Critical response', exact: true }).click();
  const input = critical.getByRole('spinbutton', { name: 'Response in minutes' });
  await input.fill('999999');
  await input.press('Enter');

  await expect(page.getByText(/Must be at least/).first()).toBeVisible();
  await expect(input).toBeVisible();
  await expect(page.getByText('Target updated')).toHaveCount(0);
  await critical.getByRole('button', { name: 'Cancel' }).click();
  await expect(input).toHaveCount(0);
});
