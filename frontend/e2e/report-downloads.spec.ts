import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { login, loginAsAdmin, USERS } from './helpers';

// The Reports page offers each role exactly the files the server will build
// for it, and the files arrive named and non-empty.

async function openReports(page: Page, label = 'Reports') {
  await page.getByRole('link', { name: label, exact: true }).click();
  await expect(page.locator('header h1')).toHaveText(label);
}

async function download(page: Page, name: 'Excel' | 'PDF') {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: `Download ${name} report` }).click();
  const file = await pending;
  const path = await file.path();
  return { name: file.suggestedFilename(), bytes: readFileSync(path!) };
}

test('the manager downloads both the workbook and the PDF for every campus', async ({ page }) => {
  await login(page, USERS.manager);
  await openReports(page);

  const xlsx = await download(page, 'Excel');
  expect(xlsx.name).toMatch(/^helpdesk-report-every-campus-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.xlsx$/);
  // An .xlsx is a zip archive.
  expect(xlsx.bytes.subarray(0, 2).toString()).toBe('PK');

  const pdf = await download(page, 'PDF');
  expect(pdf.name).toMatch(/\.pdf$/);
  expect(pdf.bytes.subarray(0, 4).toString()).toBe('%PDF');
});

test('the HOS downloads both, scoped to their campus', async ({ page }) => {
  await login(page, USERS.hos);
  await openReports(page);

  expect((await download(page, 'Excel')).name).toContain('nairobi-campus');
  expect((await download(page, 'PDF')).name).toContain('nairobi-campus');
});

test('the admin downloads the same two files as the manager', async ({ page }) => {
  await loginAsAdmin(page);
  await openReports(page);

  expect((await download(page, 'Excel')).name).toMatch(/^helpdesk-report-every-campus-.*\.xlsx$/);
  expect((await download(page, 'PDF')).bytes.subarray(0, 4).toString()).toBe('%PDF');
});

test('a technician downloads their own report as Excel and as PDF', async ({ page }) => {
  await login(page, USERS.technicianOtherTrade);
  await openReports(page, 'My Reports');
  expect((await download(page, 'Excel')).name).toContain('jobs-assigned-to');
  const pdf = await download(page, 'PDF');
  expect(pdf.name).toContain('jobs-assigned-to');
  expect(pdf.name).toMatch(/\.pdf$/);
  expect(pdf.bytes.subarray(0, 4).toString()).toBe('%PDF');
});
