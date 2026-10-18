import { test, expect } from '@playwright/test';

// Every field on the sign-in and register pages is named by its label, so a
// screen reader announces it and clicking the label puts the cursor in it.

test('each sign-in label names its field, and clicking it focuses the field', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByLabel('Email Address')).toHaveAttribute('type', 'email');
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');

  await page.getByText('Password', { exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
});

test('each register label names exactly one field', async ({ page }) => {
  await page.goto('/register');

  await expect(page.getByLabel('Email Address')).toHaveAttribute('type', 'email');
  await expect(page.getByLabel('Campus', { exact: true })).toHaveRole('combobox');
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  await expect(page.getByLabel('Confirm Password', { exact: true })).toHaveAttribute('type', 'password');
});
