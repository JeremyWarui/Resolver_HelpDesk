import { test, expect, type Page } from '@playwright/test';
import { login, loginAsAdmin, USERS } from './helpers';

// Who sees the Priority column on a ticket table, and who has to ask for it.
//
// The HOS sets priority when they assign a ticket, and the technician decides
// what to do next by it, so both get it by default. The requester, the HOD, the
// manager and the admin do not set it and do not work by it, so it is hidden —
// but not removed: the Columns menu turns it on, and the ticket detail carries
// it for everyone regardless.
//
// This lives in a spec rather than a unit test because the rule is only true
// once rendered. It is one line in `TicketTable` (`priority: showsPriority`,
// spread after the variant's own map) and `tsc` has no opinion about whether a
// column ends up on screen — which is exactly how the two column factories that
// preceded it managed to disagree for so long.

const PRIORITY = 'Priority';

/** The header cells of the first ticket table on the page. */
function headers(page: Page) {
  return page.locator('table thead th');
}

test('the HOS sees Priority by default — they are the one who set it', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await login(page, USERS.hos);

  await page.getByRole('link', { name: 'Tickets', exact: true }).click();
  await expect(page).toHaveURL(/\/hos\/tickets$/);

  await expect(
    headers(page).filter({ hasText: PRIORITY }),
    'the HOS sets priority on assignment and must be able to see what they set',
  ).toHaveCount(1);
});

test('the technician sees Priority by default — they work by it', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await login(page, USERS.technician);

  await page.getByRole('link', { name: 'Assigned Tickets' }).click();
  await expect(page).toHaveURL(/\/tech\/assigned$/);

  await expect(headers(page).filter({ hasText: PRIORITY })).toHaveCount(1);
});

test('the admin gets Priority hidden, and can turn it on', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await loginAsAdmin(page);

  await page.getByRole('link', { name: 'Tickets', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/tickets$/);
  await expect(headers(page)).not.toHaveCount(0); // the table rendered at all

  await expect(
    headers(page).filter({ hasText: PRIORITY }),
    'the admin neither sets priority nor works by it, so it starts hidden',
  ).toHaveCount(0);

  // Hidden, not removed — the column is still in the table and the Columns
  // menu is how anyone who wants it gets it back.
  await page.getByRole('button', { name: 'Columns' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'priority' }).click();
  await page.keyboard.press('Escape');

  await expect(
    headers(page).filter({ hasText: PRIORITY }),
    'the Columns menu must be able to bring Priority back',
  ).toHaveCount(1);
});

test('the requester gets Priority hidden on their own tickets', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await login(page, USERS.requester);

  await page.getByRole('link', { name: 'My Tickets' }).click();
  await expect(page).toHaveURL(/\/user\/tickets$/);

  await expect(headers(page).filter({ hasText: PRIORITY })).toHaveCount(0);
});
