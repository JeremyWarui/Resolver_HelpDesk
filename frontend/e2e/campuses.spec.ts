import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueSuffix } from './helpers';

// The campus register, end to end against the real backend. Each campus is a
// card read from /campus-roster/, so it names its head of section and counts
// its technicians.

test('each campus card names its head of section and counts its technicians', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/dashboard/campuses');

  const nairobi = page.getByRole('region', { name: 'Nairobi', exact: true });
  await expect(nairobi).toBeVisible({ timeout: 20_000 });
  // The seed makes Peter Kimani the Nairobi HOS.
  await expect(nairobi.getByText('Peter Kimani')).toBeVisible();
  await expect(nairobi.getByText('Technicians')).toBeVisible();
  await expect(page.locator('main').getByRole('region')).toHaveCount(5);
});

// Self-cleaning: the campus is new, so nothing points at it and it deletes.
test('campus CRUD: add, edit, delete', async ({ page }) => {
  const suffix = uniqueSuffix();
  const name = `E2E Campus ${suffix}`;
  const code = `E${suffix.slice(-5)}`.toUpperCase();

  await loginAsAdmin(page);
  await page.goto('/dashboard/campuses');

  await page.getByRole('button', { name: 'Add Campus' }).click();
  const addDialog = page.getByRole('dialog');
  await addDialog.getByPlaceholder('Campus name').fill(name);
  await addDialog.getByPlaceholder('e.g. MAIN').fill(code);
  await addDialog.getByPlaceholder('Physical location').fill('Old town');
  await addDialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(addDialog).toBeHidden();

  // A new campus has nobody behind it yet.
  const card = page.getByRole('region', { name, exact: true });
  await expect(card.getByText('Old town')).toBeVisible();
  await expect(card.getByText('Vacant')).toBeVisible();
  await expect(card.getByText('0', { exact: true })).toBeVisible();

  await card.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  const editDialog = page.getByRole('dialog');
  await editDialog.getByPlaceholder('Physical location').fill('New town');
  await editDialog.getByRole('button', { name: 'Update' }).click();
  await expect(editDialog).toBeHidden();
  await expect(card.getByText('New town')).toBeVisible();

  await card.getByRole('button', { name: `Delete ${name}`, exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('region', { name, exact: true })).toHaveCount(0);
});
