import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers';

// The requester's dashboard is what needs them now, not a second My Tickets:
// no figure cards and no ticket table, which stay on My Tickets.

test('the dashboard leads with what needs the requester, and My Tickets keeps the table', async ({ page }) => {
  await login(page, USERS.requester);
  await expect(page.locator('header h1')).toHaveText('Dashboard');
  await expect(page.getByRole('heading', { name: /^Hello, / })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Your active requests' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Report a fault' })).toBeVisible();
  await expect(page.locator('main table')).toHaveCount(0);
  await expect(page.getByText('Total Tickets')).toHaveCount(0);

  // Every card on the dashboard is a request still in flight, and opens it.
  const cards = page.locator('main section[aria-labelledby="active-heading"] button[aria-label*="TKT-"]');
  if (await cards.count()) {
    const label = (await cards.first().getAttribute('aria-label'))!;
    const ticketNo = label.split(', ').pop()!;
    await cards.first().click();
    await expect(page.getByRole('dialog').getByText(ticketNo).first()).toBeVisible();
    await page.keyboard.press('Escape');
  }

  // Report a fault comes first.
  const headings = await page.locator('main h3').allInnerTexts();
  expect(headings.indexOf('Report a fault')).toBe(0);

  // A star on a fix waiting for a rating opens the rating dialog with it chosen.
  // Closed without sending, so nothing is rated.
  const rateColumn = page.getByRole('region', { name: 'Rate your fixes' });
  await expect(rateColumn).toBeVisible();
  const fourStars = rateColumn.getByRole('button', { name: 'Rate 4 stars' }).first();
  // Wait for the column to settle: counting during the load reads zero.
  await expect(fourStars.or(rateColumn.getByText('Nothing to rate'))).toBeVisible({ timeout: 20_000 });
  if (await fourStars.count()) {
    await fourStars.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Rate resolution')).toBeVisible();
    await expect(dialog.getByRole('radio', { name: '4 stars' })).toHaveAttribute('aria-checked', 'true');
    await expect(dialog.getByRole('button', { name: 'Submit & close ticket' })).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  } else {
    await expect(rateColumn.getByText('Nothing to rate')).toBeVisible();
  }

  await page.getByRole('button', { name: 'All my tickets' }).click();
  await expect(page.locator('header h1')).toHaveText('My Tickets');
  await expect(page.locator('main table')).toBeVisible();
  await expect(page.getByText('Total Tickets')).toBeVisible();
  // The requester wrote the description; their own table leaves it out.
  await expect(page.getByRole('columnheader', { name: 'Description' })).toHaveCount(0);
});

// Arrow keys move through the stars; from nothing chosen, Left lands on five.
test('the rating stars answer the arrow keys', async ({ page }) => {
  await login(page, USERS.requester);
  await page.getByRole('link', { name: 'My Tickets' }).click();
  const rate = page.getByRole('button', { name: 'Rate & close' }).first();
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 });
  test.skip(!(await rate.count()), 'the requester has nothing waiting for a rating');

  await rate.click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: '1 star' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.getByRole('radio', { name: '5 stars' })).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.getByRole('radio', { name: '5 stars' })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.getByRole('radio', { name: '4 stars' })).toHaveAttribute('aria-checked', 'true');

  // Closed without sending, so nothing is rated.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
