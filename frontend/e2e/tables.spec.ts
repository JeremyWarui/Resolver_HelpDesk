import { test, expect } from '@playwright/test';
import { login, loginAsAdmin, USERS } from './helpers';

// Two things `tsc` and `npm run build` are both happy with, because neither is
// a type error: a list that silently stops short, and a string built from the
// wrong fields.

// The register must hold every facility, not the server's first page of 20.
// A register that quietly stops short is worse than no register: the buildings
// it omits look like buildings that do not exist.
test('the register holds every facility, not just the first server page', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/dashboard/facilities');

  const all = page.getByRole('button', { name: /All facilities/ });
  await expect(all).toBeVisible({ timeout: 20_000 });

  // The rail states the count it believes it has; the rows are what it drew.
  // Asserting both catches a count that outruns the list.
  const railText = await all.innerText();
  const claimed = Number(railText.match(/(\d+) facilit/)?.[1]);
  expect(claimed, 'the rail must state a count').toBeGreaterThan(20);

  const rows = page.getByRole('listitem');
  await expect(async () => {
    expect(await rows.count()).toBe(claimed);
  }).toPass({ timeout: 20_000 });

  // Picking a campus narrows to that campus and nothing else.
  const campus = page.getByRole('button', { name: /Nairobi/ }).first();
  const campusCount = Number((await campus.innerText()).match(/(\d+) facilit/)?.[1]);
  await campus.click();
  await expect(async () => {
    expect(await rows.count()).toBe(campusCount);
  }).toPass({ timeout: 20_000 });
  expect(campusCount).toBeLessThan(claimed);
});

// The hidden `searchField` must include what the Title column renders
// (`service_item.name`), or a service name plainly visible in the table matches
// no row. The term is read off a visible row so this does not depend on which
// items the seed dealt out.
test('searching a service name shown in the table finds its row', async ({ page }) => {
  await login(page, USERS.technician);
  await page.goto('/tech/assigned');

  const firstRow = page.locator('tbody tr').first();
  await expect(firstRow).toBeVisible({ timeout: 20_000 });

  // Title is the second cell; the first is the ticket number.
  const serviceName = (await firstRow.locator('td').nth(1).innerText()).trim();
  expect(serviceName.length, 'need a service name to search for').toBeGreaterThan(0);

  // Same selector as assignment.spec.ts and claim.spec.ts: the box's own
  // placeholder ends in an ellipsis, not three dots, and matching it
  // literally is how this spec came to wait for an element that never existed.
  await page.getByPlaceholder(/Search/i).first().fill(serviceName);

  const matches = page.locator('tbody tr');
  await expect(matches.first()).toBeVisible();
  await expect(matches.first().locator('td').nth(1)).toHaveText(serviceName);
});

// A rail that re-cuts the rows instead of filtering them is invisible to `tsc`
// and to any test that only counts rows: both views render, both look plausible,
// and the reader has to relearn the card on every tab. Comparing one row's text
// across the two views is what catches it.
test('the rail filters the list, it never restructures the card', async ({ page }) => {
  await loginAsAdmin(page);

  await page.goto('/dashboard/facilities');
  await expect(page.getByRole('listitem').first()).toBeVisible({ timeout: 20_000 });
  const row = (name: string) =>
    page.getByRole('listitem').filter({ hasText: name }).first().innerText();

  const facilityAtAll = (await row('Standby Generator')).trim();
  await page.getByRole('button', { name: /Baringo/ }).first().click();
  await expect(page.getByRole('listitem').first()).toBeVisible();
  expect((await row('Standby Generator')).trim()).toBe(facilityAtAll);

  // The same rule on the page this one was modelled on. Daniel works three
  // trades at Embu; filtered to Embu, his row still reads as it does under All.
  await page.goto('/dashboard/technicians');
  // The open-jobs badge arrives with its own request; read the row once it has.
  const daniel = page.getByRole('listitem').filter({ hasText: 'Daniel Kiptoo' }).first();
  await expect(daniel).toContainText(/\d+ open/, { timeout: 20_000 });
  const techAtAll = (await row('Daniel Kiptoo')).trim();
  await page.getByRole('button', { name: /^Embu/ }).first().click();
  await expect(page.getByRole('listitem').first()).toBeVisible();
  expect((await row('Daniel Kiptoo')).trim()).toBe(techAtAll);
});
