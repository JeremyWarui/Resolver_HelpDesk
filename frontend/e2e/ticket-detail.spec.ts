import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers';

// The ticket detail leads with what the ticket is and where it stands: a title,
// the status, and a five-step tracker whose current step and colour match it.

/** Every status the tracker shows; its current step reads as the status badge does. */
const STATUSES = ['Open', 'Assigned', 'In Progress', 'On Hold', 'Resolved', 'Closed'];
const SETTLED = ['Resolved', 'Closed'];

test('the detail matches the ticket at every status it is found in', async ({ page }) => {
  await login(page, USERS.requester);
  await page.getByRole('link', { name: 'My Tickets' }).click();

  const rows = page.locator('tbody tr');
  await expect(rows.first()).toBeVisible({ timeout: 20_000 });

  // One row per status the table shows, so every mapping is exercised that the data allows.
  const seen = new Set<string>();
  let escalatedChecked = false;
  for (const row of await rows.all()) {
    const statusCell = (await row.locator('td').nth(4).innerText()).trim();
    const status = statusCell.split('\n')[0];
    const level = /\bHOD\b/.test(statusCell) ? 'the head of department'
      : /\bHOS\b/.test(statusCell) ? 'the head of section' : null;
    const wanted = (STATUSES.includes(status) && !seen.has(status)) || (level && !escalatedChecked);
    if (!wanted) continue;
    seen.add(status);

    const ticketNo = (await row.locator('td').first().innerText()).trim();
    await row.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(ticketNo).first()).toBeVisible();

    // The tracker: five steps, the current one reading as the status does.
    const progress = dialog.getByRole('list', { name: 'Progress' });
    await expect(progress.getByRole('listitem')).toHaveCount(5);
    const step = progress.locator('[aria-current="step"]');
    await expect(step).toHaveText(new RegExp(`${status}$`));

    // ...and wearing the colour of the status badge beside it.
    const badgeColour = await dialog.getByText(status, { exact: true }).first()
      .evaluate((el) => getComputedStyle(el).color);
    const dotColour = await step.locator('span').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(dotColour).toBe(badgeColour);

    // The title is the service, not the number.
    await expect(dialog.getByRole('heading', { level: 2 })).not.toHaveText(ticketNo);

    // A live ticket counts down; a settled one keeps its target and a verdict.
    const details = dialog.getByRole('heading', { name: 'Ticket Information' }).locator('..');
    await expect(details.getByText('Fix by')).toBeVisible();
    if (SETTLED.includes(status)) {
      await expect(dialog.getByRole('heading', { name: 'Time to resolve' })).toHaveCount(0);
      await expect(details.getByText(/^(Met|Missed)$/)).toBeVisible();
    } else {
      await expect(dialog.getByRole('heading', { name: 'Time to resolve' })).toBeVisible();
    }

    // The trail is one line per event: typed notes go out as messages instead.
    // On a resolved ticket the resolution note shows in its callout, not the trail.
    // Older seed data resolved without a note, so this checks the ones that have one.
    const resolutionBox = dialog.getByRole('region', { name: 'Resolution' });
    if (status === 'Resolved' && await resolutionBox.count()) {
      const resolution = (await resolutionBox.locator('div').last().innerText()).trim();
      const activity = dialog.getByRole('heading', { name: 'Activity' }).locator('..');
      await expect(activity).not.toContainText(resolution);
    }

    // The escalation pill follows the level, and is absent below it.
    if (level) {
      await expect(dialog.getByText(`Escalated to ${level}`)).toBeVisible();
      escalatedChecked = true;
    } else {
      await expect(dialog.getByText(/^Escalated to /)).toHaveCount(0);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }
  expect(seen.size, 'more than one status was checked').toBeGreaterThan(1);
});
