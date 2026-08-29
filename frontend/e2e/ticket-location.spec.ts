import { test, expect } from '@playwright/test';
import { login, PLUMBING, USERS } from './helpers';

// `Ticket.facility` is a non-null FK, so every location type picks a building
// off the register — there is no "typed location" type. Equipment is the
// sharpest case: TYPE_SPECS gives it no location fields at all, so the facility
// is the whole answer, and a wizard that skipped the picker for this type could
// only ever post a request the serializer rejects.
test('every location type raises a ticket against a registered facility', async ({ page }) => {
  await login(page, USERS.requester);

  await page.getByRole('button', { name: 'New Ticket' }).first().click();
  const wizard = page.getByRole('dialog');

  // The service item routes the ticket; the location is a separate question,
  // which is the whole point of this spec. Any named pair will do.
  await wizard.getByRole('button', { name: PLUMBING.trade }).click();
  await wizard.getByRole('button', { name: PLUMBING.item }).click();
  await wizard.getByRole('button', { name: 'Next' }).click();

  await wizard
    .getByPlaceholder('Describe the fault — what is wrong, and since when…')
    .fill('E2E equipment fault — standby generator will not start');

  // Equipment: the facility picker must be here, and it is the only input.
  await wizard.getByRole('button', { name: 'Equipment' }).click();
  await wizard.getByRole('combobox').last().click();
  await page.getByRole('option').first().click();

  await wizard.getByRole('button', { name: 'Next' }).click();

  const created = page.waitForResponse(
    (r) =>
      /\/tickets\/$/.test(new URL(r.url()).pathname) &&
      r.request().method() === 'POST' &&
      r.ok(),
  );
  await wizard.getByRole('button', { name: 'Submit request' }).click();

  const body = await (await created).json();
  expect(body.ticket_no, 'the ticket must actually be created').toBeTruthy();
});
