import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueSuffix } from './helpers';

// The admin "New Facility" dialog could never create a facility. The form
// collected facility_code / type / status / location — of those, `code` is the
// real field name, `type` and `status` are read-only SerializerMethodFields,
// and `location` is not a column — while never sending `facility_type`, the
// one required FK. Every submit answered
// 400 {"facility_type": ["This field is required."]} behind a generic
// "Failed to create facility" toast.
//
// tsc was green throughout: the payload type simply described a different API
// than the one being called. Only driving the form catches it, which is why
// this spec exists rather than a type-level assertion.
test('a facility can actually be created', async ({ page }) => {
  const name = `E2E Block ${uniqueSuffix()}`;

  await loginAsAdmin(page);
  await page.goto('/dashboard/facilities');
  await expect(page.getByRole('button', { name: 'Add Facility' })).toBeVisible();

  await page.getByRole('button', { name: 'Add Facility' }).click();
  const form = page.getByRole('dialog');
  await expect(form.getByText('New Facility')).toBeVisible();

  await form.getByPlaceholder('e.g. Admin Block A').fill(name);
  await form.getByPlaceholder('e.g. AB01').fill(`E2E${uniqueSuffix().slice(-4)}`);

  await form.getByText('Select campus').click();
  await page.getByRole('option').first().click();

  // The type list comes from GET /facility-types/ and carries the FK id. The
  // form used to offer hardcoded type *codes*, which the serializer ignores.
  await form.getByText('Select type').click();
  await page.getByRole('option').first().click();

  const created = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname.endsWith('/facilities/') &&
      r.request().method() === 'POST',
  );
  await form.getByRole('button', { name: 'Create Facility' }).click();

  const response = await created;
  expect(
    response.status(),
    `create must succeed; got ${response.status()} ${await response.text()}`,
  ).toBe(201);
  const body = await response.json();

  await expect(form).toBeHidden({ timeout: 20_000 });
  await page.getByPlaceholder('Search by ID or name...').fill(name);
  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toBeVisible();

  // ── Edit ───────────────────────────────────────────────────────────────────
  // The facility branch of handleSaveChanges was an empty TODO that fell
  // through to `toast.success('Facility updated successfully')`, so the sheet
  // reported a save it had not made and the list refetched the old values.
  const renamed = `${name} Renamed`;
  await row.getByRole('button', { name: 'View' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Edit Details' }).click();

  const nameInput = sheet.locator('input').first();
  await nameInput.fill(renamed);

  const saved = page.waitForResponse(
    (r) => r.url().includes('/facilities/') && r.request().method() === 'PATCH',
  );
  await sheet.getByRole('button', { name: 'Save Changes' }).click();
  const patch = await saved;
  expect(patch.status(), `update must persist; got ${await patch.text()}`).toBe(200);
  expect((await patch.json()).name).toBe(renamed);

  // There is no delete affordance on this page, so clean up through the API
  // rather than leaving a row behind on every run.
  await page.keyboard.press('Escape');
  const token = await page.evaluate(() => localStorage.getItem('authToken'));
  const cleanup = await page.request.delete(
    `http://localhost:8000/api/v1/facilities/${body.id}/`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(cleanup.status()).toBe(204);
});
