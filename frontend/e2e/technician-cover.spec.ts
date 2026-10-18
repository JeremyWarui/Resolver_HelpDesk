import { test, expect, type Page } from '@playwright/test';
import { login, loginAsAdmin, USERS, apiGet } from './helpers';

// Cover by trade on the Technicians page: who can work each trade at each
// campus, read from /analytics/cover/, with the gaps in red.

interface Cover {
  campuses: { id: number; name: string; technicians: number }[];
  trades: { id: number; name: string }[];
  cells: { campus: number; trade: number; technicians: number; open: number }[];
  gaps: number;
  gap_campuses: number;
}

async function cover(page: Page): Promise<Cover> {
  return apiGet(page, `/analytics/cover/`);
}

async function openCover(page: Page) {
  await page.getByRole('link', { name: 'Technicians', exact: true }).click();
  await expect(page.locator('header h1')).toHaveText('Technicians');
  await page.getByRole('button', { name: /Cover by trade/ }).click();
}

test('the grid draws every cell the server counts, the gaps as none', async ({ page }) => {
  await loginAsAdmin(page);
  await openCover(page);
  const data = await cover(page);
  const grid = page.getByLabel('Cover by trade', { exact: true });

  await expect(page.getByText(`${data.trades.length} trades × ${data.campuses.length} campuses`)).toBeVisible();
  await expect(page.getByRole('button', { name: /Cover by trade/ }))
    .toContainText(`${data.gaps} gaps across ${data.gap_campuses} campuses`);
  for (const t of data.trades) {
    for (const c of data.campuses) {
      const cell = data.cells.find((x) => x.campus === c.id && x.trade === t.id)!;
      const people = cell.technicians ? `${cell.technicians} technician${cell.technicians === 1 ? '' : 's'}` : 'nobody';
      await expect(grid.getByLabel(new RegExp(`^${t.name} at ${c.name}: ${people}, ${cell.open} open`))).toHaveText(
        cell.technicians ? String(cell.technicians) : 'none',
      );
    }
  }
});

test('a gap opens Add Technician with its campus and trade filled in', async ({ page }) => {
  await loginAsAdmin(page);
  await openCover(page);
  const data = await cover(page);
  const gap = data.cells.find((c) => c.technicians === 0);
  test.skip(!gap, 'every trade is covered');
  const campus = data.campuses.find((c) => c.id === gap!.campus)!.name;
  const trade = data.trades.find((t) => t.id === gap!.trade)!.name;

  await page.getByRole('button', { name: new RegExp(`^${trade} at ${campus}: nobody`) }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('combobox').filter({ hasText: campus }).first()).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: trade })).toBeChecked();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

test('each campus in the rail lists the technicians the grid counts there', async ({ page }) => {
  await loginAsAdmin(page);
  await page.getByRole('link', { name: 'Technicians', exact: true }).click();
  const data = await cover(page);

  for (const campus of data.campuses) {
    await page.getByRole('button', { name: new RegExp(`^${campus.name}`) }).click();
    await expect(page.getByRole('heading', { name: campus.name, level: 2 })).toBeVisible();
    await expect(page.locator('main ul li')).toHaveCount(campus.technicians);
  }
});

test('an HOS reads the grid for their own campus, without the controls to change it', async ({ page }) => {
  await login(page, USERS.hos);
  await openCover(page);
  const data = await cover(page);

  expect(data.campuses.map((c) => c.name)).toEqual(['Nairobi']);
  await expect(page.getByRole('button', { name: 'Add Technician' })).toHaveCount(0);
  const grid = page.getByLabel('Cover by trade', { exact: true });
  await expect(grid.getByRole('columnheader')).toHaveCount(2);
});
