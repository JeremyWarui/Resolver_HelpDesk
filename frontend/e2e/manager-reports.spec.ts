import { test, expect, type Page } from '@playwright/test';
import { login, USERS, API } from './helpers';

// The manager's report reads one overview: every section agrees with
// /analytics/overview/, and picking a campus narrows all of them. Read-only.

interface Overview {
  current: { resolution_sla_pct: number | null; overdue: number; open_backlog: number };
  insights: { text: string }[];
  facilities: { label: string; suggestion: string }[];
  campuses: { key: number; label: string; total: number }[];
  trade_by_campus: { rows: { campus: string; total: number }[]; total: number };
}

async function overview(page: Page, query: string): Promise<Overview> {
  return page.evaluate(async (url) => {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });
    return r.json();
  }, `${API}/analytics/overview/${query}`);
}

async function openReports(page: Page) {
  await login(page, USERS.manager);
  await page.getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(page.getByLabel('Campuses', { exact: true }).getByRole('row')).not.toHaveCount(0);
}

test('the manager reads every section in order, matching the overview', async ({ page }) => {
  await openReports(page);
  const data = await overview(page, '?days=30&bucket=day');

  const sections = await page.locator('main [aria-label]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label')).filter((l) =>
      ['Needs your attention', 'Facility Health', 'Campuses', 'Trades', 'Trades by campus'].includes(l!)));
  expect(sections).toEqual(['Needs your attention', 'Facility Health', 'Campuses', 'Trades', 'Trades by campus']);

  await expect(page.getByText('Resolved on time', { exact: true }).first()).toBeVisible();
  const attention = page.getByLabel('Needs your attention', { exact: true });
  if (data.insights.length) {
    await expect(attention.getByRole('row')).toHaveCount(data.insights.length);
    for (const item of data.insights) await expect(attention.getByText(item.text, { exact: true })).toBeVisible();
  } else {
    await expect(attention.getByText('Nothing is below target this period.')).toBeVisible();
  }

  const facilities = page.getByLabel('Facility Health', { exact: true });
  if (data.facilities.length) {
    await expect(facilities.getByRole('row')).toHaveCount(data.facilities.length + 1);
    await expect(facilities.getByText(data.facilities[0].suggestion, { exact: true }).first()).toBeVisible();
  } else {
    await expect(facilities.getByText('No building shows a pattern this period.')).toBeVisible();
  }

  const campuses = page.getByLabel('Campuses', { exact: true });
  await expect(campuses.getByRole('row')).toHaveCount(data.campuses.length + 1);

  // Every campus row's total in the grid is the server's.
  const grid = page.getByLabel('Trades by campus', { exact: true });
  for (const row of data.trade_by_campus.rows) {
    await expect(grid.getByRole('row', { name: new RegExp(`^${row.campus}`) }).getByRole('cell').last())
      .toHaveText(String(row.total));
  }

  // The supervisor views are not on the manager's page.
  await expect(page.getByText('Technician Performance')).toHaveCount(0);
});

test('picking a campus narrows every section to it', async ({ page }) => {
  await openReports(page);
  const all = await overview(page, '?days=30&bucket=day');
  expect(all.campuses.length, 'there are campuses to pick between').toBeGreaterThan(1);
  const [picked, other] = all.campuses;
  const narrowed = await overview(page, `?days=30&bucket=day&campus=${picked.key}`);

  await page.getByLabel('Campuses', { exact: true }).getByRole('button', { name: picked.label }).click();
  await expect(page.getByText(`${picked.label}, against the period before`)).toBeVisible();

  const campuses = page.getByLabel('Campuses', { exact: true });
  await expect(campuses.getByRole('row')).toHaveCount(2);
  const grid = page.getByLabel('Trades by campus', { exact: true });
  await expect(grid.getByRole('row', { name: new RegExp(`^${other.label}`) })).toHaveCount(0);
  await expect(grid.getByRole('row', { name: /^All/ }).getByRole('cell').last())
    .toHaveText(String(narrowed.trade_by_campus.total));
  // The files follow the campus too.
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Excel report' }).click();
  const slug = picked.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  expect((await pending).suggestedFilename()).toContain(`helpdesk-report-${slug}-campus-`);

  await page.getByRole('combobox', { name: 'Campus' }).click();
  await page.getByRole('option', { name: 'All campuses' }).click();
  await expect(campuses.getByRole('row')).toHaveCount(all.campuses.length + 1);
});
