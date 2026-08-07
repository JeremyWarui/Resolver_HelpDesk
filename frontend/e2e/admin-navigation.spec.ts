import { test, expect, type Page } from '@playwright/test';
import { loginAsAdmin } from './helpers';

// Sidebar navigation smoke: every admin sidebar item must change both the URL
// and the rendered page (asserted via the header title), and the "My Requests"
// context switch (§1.2) must swap the content in AND be escaped by any sidebar
// navigation — regression tests for the dead-navigation bug where layouts kept
// rendering the requester view after the toggle.

const SIDEBAR_ITEMS: Array<{ label: string; path: string; title: string }> = [
  { label: 'Tickets', path: '/dashboard/tickets', title: 'Tickets' },
  { label: 'Reports', path: '/dashboard/reports', title: 'Reports' },
  { label: 'Analytics', path: '/dashboard/analytics', title: 'Organisation Analytics' },
  { label: 'Schedule', path: '/dashboard/schedule', title: 'Schedule' },
  { label: 'Technicians', path: '/dashboard/technicians', title: 'Technicians' },
  { label: 'Facilities', path: '/dashboard/facilities', title: 'Facilities' },
  { label: 'Sections', path: '/dashboard/sections', title: 'Sections' },
  { label: 'Campuses', path: '/dashboard/campuses', title: 'Campuses' },
  { label: 'Departments', path: '/dashboard/departments', title: 'Departments' },
  { label: 'Service Catalogue', path: '/dashboard/catalogue', title: 'Service Catalogue' },
  { label: 'Users', path: '/dashboard/users', title: 'Users' },
  { label: 'SLA Rules', path: '/dashboard/sla-rules', title: 'SLA Rules' },
  { label: 'Audit Log', path: '/dashboard/audit-log', title: 'Audit Log' },
  { label: 'Dashboard', path: '/dashboard', title: 'Dashboard' },
];

const headerTitle = (page: Page) => page.locator('header h1');

test('admin sidebar navigates to every section', async ({ page }) => {
  await loginAsAdmin(page);
  await expect(headerTitle(page)).toHaveText('Dashboard');

  for (const { label, path, title } of SIDEBAR_ITEMS) {
    await page.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`));
    await expect(headerTitle(page)).toHaveText(title);
  }
});

test('My Requests toggle swaps admin content and sidebar navigation escapes it', async ({ page }) => {
  await loginAsAdmin(page);
  await expect(headerTitle(page)).toHaveText('Dashboard');

  // Toggle into the requester context — content and title must change.
  await page.getByRole('button', { name: 'My Requests' }).click();
  await expect(headerTitle(page)).toHaveText('My Requests');

  // Clicking any sidebar item must exit My Requests and render that section.
  await page.getByRole('link', { name: 'Tickets', exact: true }).click();
  await expect(headerTitle(page)).toHaveText('Tickets');
  await expect(page).toHaveURL(/\/dashboard\/tickets$/);

  // The explicit "Staff workspace" toggle still works both ways.
  await page.getByRole('button', { name: 'My Requests' }).click();
  await expect(headerTitle(page)).toHaveText('My Requests');
  await page.getByRole('button', { name: 'Staff workspace' }).click();
  await expect(headerTitle(page)).toHaveText('Tickets');
});
