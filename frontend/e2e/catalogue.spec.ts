import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueSuffix } from './helpers';

// Service Catalogue CRUD, end to end against the real backend.
//
// Two levels, matching `org`: Trade → ServiceItem. Nothing sits above a trade —
// Maintenance is the only section there is.
//
// Self-cleaning: the item goes first, then the trade it hung off. Neither has
// tickets against it, so neither trips the PROTECT on Ticket.service_item.
test('catalogue CRUD: trade, service item, edit, delete', async ({ page }) => {
  const suffix = uniqueSuffix();
  const tradeName = `E2E Trade ${suffix}`;
  const tradeNameEdited = `${tradeName} v2`;
  const itemName = `E2E Item ${suffix}`;

  await loginAsAdmin(page);
  await page.goto('/dashboard/catalogue');

  await expect(page.getByRole('button', { name: 'New Trade' })).toBeVisible();

  // ── Create a trade ────────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'New Trade' }).click();
  const tradeDialog = page.getByRole('dialog');
  await expect(tradeDialog.getByText('New Trade')).toBeVisible();
  // By label, not placeholder: getByPlaceholder matches case-insensitive
  // substrings, so "e.g. PLUMB" also matches the name field's "e.g. Plumbing".
  await tradeDialog.getByRole('textbox', { name: 'Trade Name *' }).fill(tradeName);
  await tradeDialog.getByRole('textbox', { name: 'Code *' }).fill(`T${suffix.slice(-4)}`);
  await tradeDialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(tradeDialog).toBeHidden();

  // Each trade is a region named after it, and every icon button says what it acts on.
  const tradeCard = page.getByRole('region', { name: tradeName, exact: true });
  await expect(tradeCard.getByRole('heading', { name: tradeName })).toBeVisible();

  // ── Add a service item under it ───────────────────────────────────────────
  await tradeCard.getByRole('button', { name: `Add Service Item to ${tradeName}` }).click();
  const itemDialog = page.getByRole('dialog');
  await expect(itemDialog.getByText('New Service Item')).toBeVisible();
  await itemDialog.getByPlaceholder('e.g. Leaking tap or pipe').fill(itemName);
  await itemDialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(itemDialog).toBeHidden();
  await expect(tradeCard.getByText(itemName)).toBeVisible();

  // ── Rename the trade ──────────────────────────────────────────────────────
  await tradeCard.getByRole('button', { name: `Edit ${tradeName}`, exact: true }).click();
  const editDialog = page.getByRole('dialog');
  await expect(editDialog.getByText('Edit Trade')).toBeVisible();
  await editDialog.getByRole('textbox', { name: 'Trade Name *' }).fill(tradeNameEdited);
  await editDialog.getByRole('button', { name: 'Update' }).click();
  await expect(editDialog).toBeHidden();

  const editedCard = page.getByRole('region', { name: tradeNameEdited, exact: true });
  await expect(editedCard.getByRole('heading', { name: tradeNameEdited })).toBeVisible();

  // ── Delete the item, then the trade (cleanup) ─────────────────────────────
  await editedCard.getByRole('button', { name: `Delete ${itemName}`, exact: true }).click();
  const itemConfirm = page.getByRole('alertdialog');
  await expect(itemConfirm.getByText('Delete service item?')).toBeVisible();
  await itemConfirm.getByRole('button', { name: 'Delete' }).click();
  await expect(editedCard.getByText(itemName)).toHaveCount(0);

  await editedCard.getByRole('button', { name: `Delete ${tradeNameEdited}`, exact: true }).click();
  const tradeConfirm = page.getByRole('alertdialog');
  await expect(tradeConfirm.getByText('Delete trade?')).toBeVisible();
  await tradeConfirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('region', { name: tradeNameEdited, exact: true })).toHaveCount(0);
});
