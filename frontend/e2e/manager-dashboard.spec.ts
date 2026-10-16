import { test, expect, type Page } from '@playwright/test';
import { login, USERS } from './helpers';

// The manager's dashboard is an overview: live work and the last seven days,
// every figure the server's, and no ticket list. Read-only.

interface Dashboard {
  live: {
    open_now: number; waiting: number; with_technician: number; on_hold: number; overdue: number; at_hod: number;
  };
  this_week: { total: number };
  last_week: { total: number };
  open_work: { label: string; waiting: number; with_technician: number; on_hold: number }[];
  campus_table: { label: string; total: number; open_now: number; overdue: number; at_hod: number }[];
  facilities: { label: string; campus: string; total: number; trades: { label: string; total: number }[] }[];
}

async function dashboard(page: Page, query = ''): Promise<Dashboard> {
  return page.evaluate(async (q) => {
    const r = await fetch(`http://localhost:8001/api/v1/analytics/dashboard/${q}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
    });
    return r.json();
  }, query);
}

const bar = (c: Dashboard['open_work'][number]) =>
  `${c.label}: ${c.waiting} waiting, ${c.with_technician} with a technician, ${c.on_hold} on hold`;

test('the manager dashboard shows the server’s figures and no ticket list', async ({ page }) => {
  await login(page, USERS.manager);
  await expect(page.locator('header h1')).toHaveText('Dashboard');
  const data = await dashboard(page);

  const card = (title: string) => page.locator('p', { hasText: new RegExp(`^${title}$`) }).locator('xpath=..');
  await expect(card('Open now')).toContainText(String(data.live.open_now));
  await expect(card('Open now')).toContainText(`${data.live.waiting} waiting · ${data.live.on_hold} held`);
  await expect(card('Overdue now')).toContainText(`${data.live.at_hod} with the HOD`);
  await expect(card('Raised this week')).toContainText(`${data.last_week.total} last week`);

  const campuses = page.getByLabel('Open work by campus', { exact: true });
  for (const c of data.open_work) {
    await expect(campuses.getByRole('img', { name: bar(c) })).toBeVisible();
  }

  // The Reports page's Campuses table, over the week: a header and a row per campus.
  const table = page.getByLabel('Campuses', { exact: true });
  await expect(table.getByRole('row')).toHaveCount(data.campus_table.length + 1);
  for (const c of data.campus_table) {
    await expect(table.getByRole('row', { name: new RegExp(`^${c.label}\\b`) }))
      .toHaveText(new RegExp(`^${c.label}\\s*${c.total}\\s*${c.open_now}\\s*${c.overdue}\\s*${c.at_hod}\\s*`));
  }

  // Facility Health: building, faults reported, and the trades they fell in.
  const facilities = page.getByLabel('Facility Health', { exact: true });
  await expect(facilities.getByRole('row')).toHaveCount(data.facilities.length + 1);
  for (const [i, f] of data.facilities.entries()) {
    const row = facilities.getByRole('row').nth(i + 1);
    await expect(row).toContainText(`${f.label}${f.campus}`);
    await expect(row).toContainText(`${f.total}${f.trades.map((t) => `${t.label} ${t.total}`).join(' · ')}`);
  }

  await expect(page.getByText('Raised and resolved, day by day')).toBeVisible();
  // An overview: no ticket table, no ticket filters.
  await expect(page.getByText('Recent Tickets')).toHaveCount(0);
  await expect(page.getByPlaceholder(/Search by ID/)).toHaveCount(0);
});

test('each chart reads its own period, and the cards stay on the week', async ({ page }) => {
  await login(page, USERS.manager);
  const before = await dashboard(page);
  const openNow = page.locator('p', { hasText: /^Open now$/ }).locator('xpath=..');

  await page.getByRole('combobox', { name: 'Raised and resolved period' }).click();
  await page.getByRole('option', { name: 'This quarter' }).click();
  await expect(page.getByText('Raised and resolved, week by week')).toBeVisible();

  await page.getByRole('combobox', { name: 'Open work period' }).click();
  await page.getByRole('option', { name: 'Raised this week' }).click();
  const recent = await dashboard(page, '?open_days=7');
  const campuses = page.getByLabel('Open work by campus', { exact: true });
  for (const c of recent.open_work) {
    await expect(campuses.getByRole('img', { name: bar(c) })).toBeVisible();
  }
  await expect(openNow).toContainText(String(before.live.open_now));
});

test('Facility Health links through to Reports', async ({ page }) => {
  await login(page, USERS.manager);
  await page.getByRole('button', { name: 'See more in Reports' }).click();
  await expect(page.locator('header h1')).toHaveText('Reports');
  await expect(page.getByLabel('Facility Health', { exact: true })).toBeVisible();
});
