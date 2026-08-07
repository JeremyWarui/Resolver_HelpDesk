import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueSuffix } from './helpers';

// Smoke test for the Users admin page — the safety net for the UsersPage
// decomposition. Creates a user, edits them, deletes them (self-cleaning).
test('users CRUD: create, search, edit, delete', async ({ page }) => {
  const suffix = uniqueSuffix();
  const email = `e2e.${suffix}@example.test`;
  const username = `e2e_${suffix}`;
  const lastNameEdited = `Playwright-${suffix}-v2`;

  await loginAsAdmin(page);
  await page.goto('/dashboard/users');

  // Table has loaded when the seeded admin account shows.
  await expect(page.getByText('@admin', { exact: true })).toBeVisible();

  // ── Create ─────────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Add User' }).click();
  const form = page.getByRole('dialog');
  await expect(form.getByText('Add User')).toBeVisible();
  await form.getByPlaceholder('First name').fill('E2E');
  await form.getByPlaceholder('Last name').fill(`Playwright-${suffix}`);
  await form.getByPlaceholder('user@example.com').fill(email);
  await form.getByText('Select campus').click();
  await page.getByRole('option').first().click();
  await form.getByPlaceholder('e.g. john.doe').fill(username);
  await form.getByPlaceholder('Minimum 8 characters').fill('E2ePlaywright123!');
  await form.getByRole('button', { name: 'Create User' }).click();
  await expect(form).toBeHidden({ timeout: 20_000 });

  // ── Search finds the new user ──────────────────────────────────────────────
  await page.getByPlaceholder('Search...').fill(username);
  const row = page.getByRole('row', { name: new RegExp(username) });
  await expect(row).toBeVisible();

  // ── Edit ───────────────────────────────────────────────────────────────────
  await row.getByTitle('Edit user').click();
  const editForm = page.getByRole('dialog');
  await expect(editForm.getByText('Edit User')).toBeVisible();
  await editForm.getByPlaceholder('Last name').fill(lastNameEdited);
  await editForm.getByRole('button', { name: 'Update' }).click();
  await expect(editForm).toBeHidden({ timeout: 20_000 });
  await expect(page.getByRole('row', { name: new RegExp(lastNameEdited) })).toBeVisible();

  // ── Delete (cleanup) ───────────────────────────────────────────────────────
  const rowAfterEdit = page.getByRole('row', { name: new RegExp(username) });
  await rowAfterEdit.getByTitle('Delete user').click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByText('Delete User?')).toBeVisible();
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('row', { name: new RegExp(username) })).toHaveCount(0, {
    timeout: 20_000,
  });
});
