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
  campuses: { label: string; waiting: number; with_technician: number; on_hold: number }[];
  campus_table: { label: string; total: number; open_now: number; overdue: number; at_hod: number }[];
}

async function dashboard(page: Page): Promise<Dashboard> {
  return page.evaluate(async () => {
    const r = await fetch('http://localhost:8000/api/v1/analytics/dashboard/', {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
    });
    return r.json();
  });
}

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
  for (const c of data.campuses) {
    await expect(campuses.getByRole('img', {
      name: `${c.label}: ${c.waiting} waiting, ${c.with_technician} with a technician, ${c.on_hold} on hold`,
    })).toBeVisible();
  }

  // The Reports page's Campuses table, over the week: a header and a row per campus.
  const table = page.getByLabel('Campuses', { exact: true });
  await expect(table.getByRole('row')).toHaveCount(data.campus_table.length + 1);
  for (const c of data.campus_table) {
    await expect(table.getByRole('row', { name: new RegExp(`^${c.label}\\b`) }))
      .toHaveText(new RegExp(`^${c.label}\\s*${c.total}\\s*${c.open_now}\\s*${c.overdue}\\s*${c.at_hod}\\s*`));
  }

  await expect(page.getByText('Raised and resolved, day by day')).toBeVisible();
  // An overview: no ticket table, no ticket filters.
  await expect(page.getByText('Recent Tickets')).toHaveCount(0);
  await expect(page.getByPlaceholder(/Search by ID/)).toHaveCount(0);
});

test('the HOS keeps their own dashboard', async ({ page }) => {
  await login(page, USERS.hos);
  await expect(page.getByText('Recent Tickets')).toBeVisible();
  await expect(page.getByLabel('Open work by campus', { exact: true })).toHaveCount(0);
});
