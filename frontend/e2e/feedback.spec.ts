import { test, expect, type Page } from '@playwright/test';
import { login, USERS, API } from './helpers';

// The Feedback page reads a period: its figures cover every rating in it, the
// comments load a page at a time, and a star narrows them. Read-only; the
// seeded demo data rates fixes every day.

const STAR_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

interface Summary {
  count: number;
  average: number | null;
  stars: { stars: number; count: number }[];
}

async function summaryOver(page: Page, days: number): Promise<Summary> {
  return page.evaluate(async ({ url, days }) => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const query = `?date_from=${encodeURIComponent(from.toISOString())}&date_to=${encodeURIComponent(to.toISOString())}`;
    const r = await fetch(url + query, {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
    });
    return r.json();
  }, { url: `${API}/tickets/feedback/summary/`, days });
}

async function openFeedback(page: Page, who: string) {
  await login(page, who);
  await page.getByRole('link', { name: 'Feedback', exact: true }).click();
  await expect(page.getByLabel('Ratings', { exact: true }).getByText(/ratings?, \d+ with a comment$/)).toBeVisible();
}

test('the figures cover the whole period, and Load more pages through it', async ({ page }) => {
  await openFeedback(page, USERS.manager);
  const summary = await summaryOver(page, 30);
  expect(summary.count, 'the seed rates fixes every day').toBeGreaterThan(20);

  const ratings = page.getByLabel('Ratings', { exact: true });
  await expect(ratings.getByText('Rated in the last 30 days', { exact: true })).toBeVisible();
  await expect(ratings.getByText(new RegExp(`^${summary.count} ratings, `))).toBeVisible();
  await expect(ratings.getByText(summary.average!.toFixed(1), { exact: true })).toBeVisible();

  const comments = page.getByLabel('Comments', { exact: true });
  const rows = comments.getByRole('listitem');
  await expect(rows).toHaveCount(20);
  await expect(comments.getByText(`Showing 20 of ${summary.count}`, { exact: true })).toBeVisible();

  // The page fits the window: the comments scroll inside their card, and the
  // count and Load more stay in view below them.
  expect(await page.locator('main').evaluate((m) => m.scrollHeight - m.clientHeight)).toBeLessThanOrEqual(1);
  const list = comments.getByRole('list', { name: 'Ratings in the period' });
  expect(await list.evaluate((l) => l.scrollHeight > l.clientHeight)).toBe(true);
  await expect(comments.getByRole('button', { name: 'Load more' })).toBeInViewport();

  await comments.getByRole('button', { name: 'Load more' }).click();
  const shown = Math.min(summary.count, 40);
  await expect(rows).toHaveCount(shown);
  await expect(comments.getByText(`Showing ${shown} of ${summary.count}`, { exact: true })).toBeVisible();
});

test('a star shows only its ratings, and the figures stay whole', async ({ page }) => {
  await openFeedback(page, USERS.manager);
  const summary = await summaryOver(page, 30);
  const pick = summary.stars.find((s) => s.stars === 2)!;
  expect(pick.count, 'the seed gives some fixes two stars').toBeGreaterThan(0);

  const ratings = page.getByLabel('Ratings', { exact: true });
  const bar = ratings.getByRole('button', { name: `2 stars: ${pick.count}`, exact: true });
  await bar.click();
  await expect(bar).toHaveAttribute('aria-pressed', 'true');

  const comments = page.getByLabel('Comments', { exact: true });
  await expect(comments.getByText('2-star ratings, newest first', { exact: true })).toBeVisible();
  const shown = Math.min(pick.count, 20);
  await expect(comments.getByText(`Showing ${shown} of ${pick.count}`, { exact: true })).toBeVisible();
  const rows = comments.getByRole('listitem');
  await expect(rows).toHaveCount(shown);
  // Every row is a two-star rating.
  await expect(rows.filter({ has: page.getByText(STAR_LABELS[2], { exact: true }) })).toHaveCount(shown);
  // The figures still cover every star.
  await expect(ratings.getByText(new RegExp(`^${summary.count} ratings, `))).toBeVisible();

  await comments.getByRole('button', { name: 'Show every star' }).click();
  await expect(bar).toHaveAttribute('aria-pressed', 'false');
  await expect(comments.getByText(`Showing 20 of ${summary.count}`, { exact: true })).toBeVisible();
});

test('a longer period reads further back, and Today says the last 24 hours', async ({ page }) => {
  await openFeedback(page, USERS.hos);
  const quarter = await summaryOver(page, 90);
  const month = await summaryOver(page, 30);
  expect(quarter.count, 'the quarter holds older ratings than the month').toBeGreaterThan(month.count);

  const ratings = page.getByLabel('Ratings', { exact: true });
  await page.getByRole('button', { name: 'This Month' }).click();
  await page.getByRole('menuitem', { name: 'This Quarter' }).click();
  await expect(ratings.getByText('Rated in the last 90 days', { exact: true })).toBeVisible();
  await expect(ratings.getByText(new RegExp(`^${quarter.count} ratings, `))).toBeVisible();

  await page.getByRole('button', { name: 'This Quarter' }).click();
  await page.getByRole('menuitem', { name: 'Today' }).click();
  await expect(ratings.getByText('Rated in the last 24 hours', { exact: true })).toBeVisible();
});
