import { test, expect } from '@playwright/test';
import { login, loginAsAdmin, USERS } from './helpers';

// My Profile sits inside the same shell as every other page, so the sidebar
// stays and every way out of it works.

test('the profile opens inside the shell, and My Requests leaves it for the workspace', async ({ page }) => {
  await loginAsAdmin(page);
  await page.getByRole('link', { name: 'My Profile' }).click();

  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.locator('header h1')).toHaveText('My Profile');
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'System Administrator' })).toBeVisible();
  await expect(page.getByText(USERS.admin).first()).toBeVisible();

  // Off the workspace there is nothing to toggle in place.
  await page.getByRole('button', { name: 'My Requests' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator('header h1')).toHaveText('My Requests');
});

test('a requester\'s profile names their campus', async ({ page }) => {
  await login(page, USERS.requester);
  await page.getByRole('link', { name: 'My Profile' }).click();

  await expect(page.locator('header h1')).toHaveText('My Profile');
  await expect(page.getByRole('heading', { name: 'Caroline Wafula' })).toBeVisible();
  await expect(page.getByText('Based at')).toBeVisible();
  await expect(page.getByText('Nairobi', { exact: true })).toBeVisible();
});
