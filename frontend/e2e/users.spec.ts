import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueSuffix } from './helpers';

// Smoke test for the Users admin page — the safety net for the UsersPage
// decomposition. Creates a user, edits them, deletes them (self-cleaning).
//
// The email is the whole identity: nothing here types a name or a username,
// and the edit step proves that changing the address renames the account,
// which is the one behaviour a hand-set name would quietly break.
test('users CRUD: create, search, edit, delete', async ({ page }) => {
  const suffix = uniqueSuffix();
  const email = `e2e.${suffix}@example.test`;
  const username = `e2e.${suffix}`;
  const emailEdited = `e2e.${suffix}.renamed@example.test`;
  const usernameEdited = `e2e.${suffix}.renamed`;

  await loginAsAdmin(page);
  await page.goto('/dashboard/users');

  // Table has loaded when the seeded admin account shows.
  await expect(page.getByText('@system.administrator', { exact: true })).toBeVisible();

  // ── Create ─────────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Add User' }).click();
  const form = page.getByRole('dialog');
  await expect(form.getByText('Add User')).toBeVisible();
  await form.getByPlaceholder('you@ksg.ac.ke').fill(email);
  await form.getByText('Select campus').click();
  await page.getByRole('option').first().click();
  await form.getByPlaceholder('Minimum 8 characters').fill('E2ePlaywright123!');
  await form.getByRole('button', { name: 'Create User' }).click();
  await expect(form).toBeHidden({ timeout: 20_000 });

  // ── Search finds the new user, under the derived username ──────────────────
  await page.getByPlaceholder('Search...').fill(username);
  const row = page.getByRole('row', { name: new RegExp(username) });
  await expect(row).toBeVisible();

  // ── Edit: a new address renames the account ────────────────────────────────
  await row.getByTitle('Edit user').click();
  const editForm = page.getByRole('dialog');
  await expect(editForm.getByText('Edit User')).toBeVisible();
  await editForm.getByPlaceholder('you@ksg.ac.ke').fill(emailEdited);
  await editForm.getByRole('button', { name: 'Update' }).click();
  await expect(editForm).toBeHidden({ timeout: 20_000 });
  await page.getByPlaceholder('Search...').fill(usernameEdited);
  await expect(page.getByRole('row', { name: new RegExp(usernameEdited) })).toBeVisible();

  // ── Delete (cleanup) ───────────────────────────────────────────────────────
  const rowAfterEdit = page.getByRole('row', { name: new RegExp(usernameEdited) });
  await rowAfterEdit.getByTitle('Delete user').click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByText('Delete User?')).toBeVisible();
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('row', { name: new RegExp(usernameEdited) })).toHaveCount(0, {
    timeout: 20_000,
  });
});
