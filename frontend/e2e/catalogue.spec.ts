import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueSuffix } from './helpers';

// Smoke test for the Service Catalogue admin page — the safety net for the
// CataloguePage decomposition. Exercises every CRUD dialog end-to-end against
// the real backend, self-cleaning: the section type created here is deleted at
// the end, which cascades to the category and item created under it.
test('catalogue CRUD: section type → category → item, edit, cascade delete', async ({ page }) => {
  const suffix = uniqueSuffix();
  const typeName = `E2E Type ${suffix}`;
  const typeNameEdited = `${typeName} v2`;
  const categoryName = `E2E Category ${suffix}`;
  const itemName = `E2E Item ${suffix}`;

  await loginAsAdmin(page);
  await page.goto('/dashboard/catalogue');

  // First department auto-selects; the page is ready when the CTA renders.
  await expect(page.getByRole('button', { name: 'Add Section Type' })).toBeVisible();

  // ── Create section type (department is preset from the active tab) ────────
  await page.getByRole('button', { name: 'Add Section Type' }).click();
  const stDialog = page.getByRole('dialog');
  await expect(stDialog.getByText('New Section Type')).toBeVisible();
  await stDialog.getByPlaceholder('e.g. Software Support').fill(typeName);
  await stDialog.getByPlaceholder('e.g. SW').fill(`E${suffix.slice(-4)}`);
  await stDialog.getByRole('button', { name: 'Create Section Type' }).click();
  await expect(stDialog).toBeHidden();

  const typeRow = page.locator('div.group', { hasText: typeName });
  await expect(typeRow).toBeVisible();

  // ── Select it and create a category under it ──────────────────────────────
  await typeRow.getByRole('button', { name: typeName }).click();
  await page.getByRole('button', { name: 'New Service Category' }).click();
  const catDialog = page.getByRole('dialog');
  await catDialog.getByPlaceholder('e.g. Plumbing Services').fill(categoryName);
  // Default Priority is preset to the first priority — no interaction needed.
  await catDialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(catDialog).toBeHidden();

  const categoryCard = page.locator('div.border.rounded-lg', { hasText: categoryName });
  await expect(categoryCard.getByRole('heading', { name: categoryName })).toBeVisible();

  // ── Create an item inside the category ────────────────────────────────────
  await categoryCard.getByRole('button', { name: `Add Service Item to ${categoryName}` }).click();
  const itemDialog = page.getByRole('dialog');
  await itemDialog.getByPlaceholder('e.g. Pipe Installation').fill(itemName);
  await itemDialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(itemDialog).toBeHidden();
  await expect(categoryCard.getByText(itemName)).toBeVisible();

  // ── Edit the section type (hover reveals the row actions) ─────────────────
  await typeRow.hover();
  await typeRow.locator('button').nth(1).click(); // pencil
  const editDialog = page.getByRole('dialog');
  await expect(editDialog.getByText('Edit Section Type')).toBeVisible();
  await editDialog.getByPlaceholder('e.g. Software Support').fill(typeNameEdited);
  await editDialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(editDialog).toBeHidden();

  const editedRow = page.locator('div.group', { hasText: typeNameEdited });
  await expect(editedRow).toBeVisible();

  // ── Delete the section type — cascades to category + item (cleanup) ───────
  await editedRow.hover();
  await editedRow.locator('button').nth(2).click(); // trash
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByText(`Delete "${typeNameEdited}"?`)).toBeVisible();
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('div.group', { hasText: typeNameEdited })).toHaveCount(0);
});
