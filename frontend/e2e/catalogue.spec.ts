import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueSuffix } from './helpers';

// Service Catalogue CRUD, end to end against the real backend.
//
// The catalogue is still three levels, but the middle one changed in the port:
// Section Type → **Trade** (`org.SubSection`) → Service Item, where it used to
// be Section Type → Service Category (`catalog.ServiceCategory`, now deleted).
// This spec drove the old shape and could never have passed here.
//
// Self-cleaning: deleting the section type cascades to the trade and item
// created under it.
test('catalogue CRUD: section type → trade → item, edit, cascade delete', async ({ page }) => {
  const suffix = uniqueSuffix();
  const typeName = `E2E Type ${suffix}`;
  const typeNameEdited = `${typeName} v2`;
  const tradeName = `E2E Trade ${suffix}`;
  const itemName = `E2E Item ${suffix}`;

  await loginAsAdmin(page);
  await page.goto('/dashboard/catalogue');

  // The first department auto-selects; the page is ready when the CTA renders.
  await expect(page.getByRole('button', { name: 'Add Section Type' })).toBeVisible();

  // ── Create a section type (department is preset from the active tab) ───────
  await page.getByRole('button', { name: 'Add Section Type' }).click();
  const stDialog = page.getByRole('dialog');
  await expect(stDialog.getByText('New Section Type')).toBeVisible();
  await stDialog.getByPlaceholder('e.g. Software Support').fill(typeName);
  await stDialog.getByPlaceholder('e.g. SW').fill(`E${suffix.slice(-4)}`);
  await stDialog.getByRole('button', { name: 'Create Section Type' }).click();
  await expect(stDialog).toBeHidden();

  const typeRow = page.locator('div.group', { hasText: typeName });
  await expect(typeRow).toBeVisible();

  // ── Select it and add a trade ─────────────────────────────────────────────
  await typeRow.getByRole('button', { name: typeName }).click();
  await page.getByRole('button', { name: 'New Trade' }).click();
  const tradeDialog = page.getByRole('dialog');
  await expect(tradeDialog.getByText('New Trade')).toBeVisible();
  // By label, not placeholder: getByPlaceholder matches case-insensitive
  // substrings, so "e.g. PLUMB" also matches the name field's "e.g. Plumbing".
  await tradeDialog.getByRole('textbox', { name: 'Trade Name *' }).fill(tradeName);
  await tradeDialog.getByRole('textbox', { name: 'Code *' }).fill(`T${suffix.slice(-4)}`);
  await tradeDialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(tradeDialog).toBeHidden();

  const tradeCard = page.locator('div.border.rounded-lg', { hasText: tradeName });
  await expect(tradeCard.getByRole('heading', { name: tradeName })).toBeVisible();

  // ── Add a service item under it ───────────────────────────────────────────
  await tradeCard.getByRole('button', { name: `Add Service Item to ${tradeName}` }).click();
  const itemDialog = page.getByRole('dialog');
  await expect(itemDialog.getByText('New Service Item')).toBeVisible();
  await itemDialog.getByPlaceholder('e.g. Leaking tap or pipe').fill(itemName);
  await itemDialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(itemDialog).toBeHidden();
  await expect(tradeCard.getByText(itemName)).toBeVisible();

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

  // ── Delete it — cascades to the trade and item (cleanup) ──────────────────
  await editedRow.hover();
  await editedRow.locator('button').nth(2).click(); // trash
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByText(`Delete "${typeNameEdited}"?`)).toBeVisible();
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('div.group', { hasText: typeNameEdited })).toHaveCount(0);
});
