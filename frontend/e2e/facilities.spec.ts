import { test, expect } from '@playwright/test';
import { API, bearer, loginAsAdmin, uniqueSuffix } from './helpers';

// The admin "New Facility" dialog sends what FacilitySerializer accepts: a
// name, a campus and the facility_type FK. tsc cannot see a payload that
// describes a different API than the one being called, so this drives the form.
test('a facility can actually be created', async ({ page }) => {
  const name = `E2E Block ${uniqueSuffix()}`;

  await loginAsAdmin(page);
  await page.goto('/dashboard/facilities');
  await expect(page.getByRole('button', { name: 'Add Facility' })).toBeVisible();

  await page.getByRole('button', { name: 'Add Facility' }).click();
  const form = page.getByRole('dialog');
  await expect(form.getByText('New Facility')).toBeVisible();

  await form.getByPlaceholder('e.g. Admin Block A').fill(name);

  await form.getByText('Select campus').click();
  await page.getByRole('option').first().click();

  // The type list comes from GET /facility-types/ and carries the FK id.
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
  await page.getByPlaceholder('Search facilities…').fill(name);
  const row = page.getByRole('listitem').filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 20_000 });

  // ── Edit ───────────────────────────────────────────────────────────────────
  // The sheet must actually PATCH, not report a save it never made.
  const renamed = `${name} Renamed`;
  // The name is the button; the rest of the row is not a click target.
  await row.getByRole('button').first().click();
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
  const token = await bearer(page);
  const cleanup = await page.request.delete(
    `${API}/facilities/${body.id}/`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(cleanup.status()).toBe(204);
});
