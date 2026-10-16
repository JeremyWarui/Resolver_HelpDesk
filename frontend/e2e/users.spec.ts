import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueSuffix, USERS } from './helpers';

// The Users admin page: create, edit, delete, self-cleaning.
//
// The email is the whole identity — nothing here types a name or a username —
// and the edit step proves that changing the address renames the account.
test('users: create, search, edit, deactivate', async ({ page }) => {
  const suffix = uniqueSuffix();
  const email = `e2e.${suffix}@example.test`;
  const username = `e2e.${suffix}`;
  const emailEdited = `e2e.${suffix}.renamed@example.test`;
  const usernameEdited = `e2e.${suffix}.renamed`;

  await loginAsAdmin(page);
  await page.goto('/dashboard/users');

  // The register has loaded when the seeded admin's row shows.
  await expect(page.getByRole('listitem', { name: 'System Administrator' })).toBeVisible();

  // ── Create ─────────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Add User' }).click();
  const form = page.getByRole('dialog');
  await expect(form.getByText('Add user')).toBeVisible();
  await form.getByPlaceholder('you@ksg.ac.ke').fill(email);
  await form.getByText('Select campus').click();
  await page.getByRole('option').first().click();
  await form.getByPlaceholder('Minimum 8 characters').fill('E2ePlaywright123!');
  await form.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(form).toBeHidden({ timeout: 20_000 });

  // ── Search finds the new user, by the username derived from the email ──────
  await page.getByPlaceholder('Search users…').fill(username);
  const row = page.getByRole('listitem').filter({ hasText: email });
  await expect(row).toBeVisible();

  // ── Edit: a new address renames the account ────────────────────────────────
  await row.getByRole('button', { name: /^Edit / }).click();
  const editForm = page.getByRole('dialog');
  await expect(editForm.getByText('Edit user')).toBeVisible();
  await editForm.getByPlaceholder('you@ksg.ac.ke').fill(emailEdited);
  await editForm.getByRole('button', { name: 'Save changes' }).click();
  await expect(editForm).toBeHidden({ timeout: 20_000 });
  await page.getByPlaceholder('Search users…').fill(usernameEdited);
  const rowAfterEdit = page.getByRole('listitem').filter({ hasText: emailEdited });
  await expect(rowAfterEdit).toBeVisible();

  // ── Deactivate, never delete: the account leaves the list for Deactivated ──
  await rowAfterEdit.getByRole('button', { name: /^Deactivate / }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByText('Deactivate this account?')).toBeVisible();
  await confirm.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await expect(page.getByRole('listitem').filter({ hasText: emailEdited })).toHaveCount(0, {
    timeout: 20_000,
  });

  await page.getByRole('button', { name: /^Deactivated/ }).click();
  const archived = page.getByRole('listitem').filter({ hasText: emailEdited });
  await expect(archived).toBeVisible();
  await expect(archived.getByRole('button', { name: /^Restore / })).toBeVisible();
});

test('Needs fixing lists the accounts the server flags, each with its fix', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/dashboard/users');
  const users = await page.evaluate(async () => {
    const r = await fetch('http://localhost:8000/api/v1/users/?page_size=100', {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
    });
    return (await r.json()).results as { email: string; is_active: boolean; problems: { label: string }[] }[];
  });
  const flagged = users.filter((u) => u.is_active && u.problems.length);

  await page.getByRole('button', { name: /^Needs fixing/ }).click();
  const list = page.getByRole('list', { name: 'Accounts that need fixing' });
  if (flagged.length) {
    await expect(list.getByRole('listitem')).toHaveCount(flagged.length);
    for (const u of flagged) {
      await expect(list.getByRole('listitem').filter({ hasText: u.email })).toContainText(u.problems[0].label);
    }
  } else {
    await expect(page.getByText('Every account works')).toBeVisible();
  }
});

// A person has one campus: the one they chose when they registered. A role
// assignment also resolves to a campus, and for every scoped role the two
// agree — but a plain requester's role carries no campus at all, so the row
// and the filter must read the home campus, not the role's.
test('the campus on the row and the filter are the campus a requester chose', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/dashboard/users');

  const requesterUsername = USERS.requester.split('@')[0];
  const row = page.getByRole('listitem').filter({ hasText: USERS.requester });

  await page.getByPlaceholder('Search users…').fill(requesterUsername);
  await expect(row).toBeVisible();

  // The seed puts this requester at Nairobi, and the row must say so
  // rather than the em dash a null campus renders.
  await expect(row).toContainText('Nairobi');

  // Filtering by that campus must keep them, not drop every requester.
  await page.getByRole('combobox', { name: 'Campus' }).click();
  await page.getByRole('option', { name: 'Nairobi', exact: true }).click();
  await expect(row).toBeVisible();
});

// The rail filters by role and counts what it filters: the seed has one Head
// of Section per campus.
test('the role rail narrows the register to one role', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/dashboard/users');
  await expect(page.getByRole('listitem', { name: 'System Administrator' })).toBeVisible();

  await page.getByRole('button', { name: /^Head of Section/ }).click();
  await expect(page.locator('main h2')).toHaveText('Head of Section');
  await expect(page.locator('main').getByRole('region')).toHaveCount(1);
  await expect(page.locator('main').getByRole('listitem')).toHaveCount(5);
  await expect(page.getByRole('listitem', { name: 'Peter Kimani' })).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'System Administrator' })).toHaveCount(0);
});
