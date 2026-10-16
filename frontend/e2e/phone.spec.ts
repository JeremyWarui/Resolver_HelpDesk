import { test, expect, type Page } from '@playwright/test';
import { login, loginAsAdmin, USERS, PLUMBING, NRB_OFFICE_BLOCK } from './helpers';

// On a phone the menu opens what each role acts on out and about, and no page
// is wider than the screen. The registers a requester or technician reads at a
// desk stay off it; the desk roles keep every section, with a notice.

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

/** On the desktop rail but not the phone menu. */
const DESKTOP_ONLY: Record<string, string[]> = {
  requester: ['My Tickets'],
  technician: ['Section Tickets'],
};

/** Each role's phone menu, in order. New Ticket opens the wizard, not a page. */
const MENU: Record<string, string[]> = {
  requester: ['Dashboard', 'New Ticket', 'Notifications'],
  technician: ['My Jobs', 'My Reports', 'My Feedback', 'Notifications'],
  hos: ['Dashboard', 'Tickets', 'Pending Work', 'Escalated', 'Technicians', 'Facilities', 'Reports', 'Feedback', 'Notifications'],
  hod: ['Dashboard', 'Tickets', 'Pending Work', 'Escalated', 'Technicians', 'Facilities', 'Reports', 'Feedback', 'Notifications'],
  manager: ['Dashboard', 'Tickets', 'Reports', 'Technicians', 'Facilities', 'Campuses', 'Feedback', 'Notifications'],
  admin: ['Dashboard', 'Tickets', 'Reports', 'Technicians', 'Facilities', 'Campuses', 'Service Catalogue', 'Users', 'SLA Rules', 'System Feedback', 'Notifications'],
};

/** How far the page is wider than the screen, in CSS pixels. */
async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function openMenu(page: Page) {
  await page.getByRole('button', { name: 'Open menu' }).click();
  return page.getByRole('dialog', { name: 'Menu' });
}

for (const [role, menu] of Object.entries(MENU)) {
  test(`${role}: every section is reachable from the phone menu and fits the screen`, async ({ page }) => {
    if (role === 'admin') await loginAsAdmin(page);
    else await login(page, USERS[role as keyof typeof USERS]);

    // The desktop rail is hidden on a phone; the menu button replaces it.
    await expect(page.locator('aside')).toBeHidden();

    const menuLinks = (await openMenu(page)).getByRole('navigation', { name: 'Sections' }).getByRole('link');
    const names = (await menuLinks.allInnerTexts()).map((t) => t.replace(/\s*\d+\+?$/, '').trim());
    expect(names, `${role}'s phone menu`).toEqual(menu);
    for (const absent of DESKTOP_ONLY[role] ?? []) expect(names).not.toContain(absent);
    await page.keyboard.press('Escape');

    for (const label of menu.filter((n) => n !== 'New Ticket')) {
      const drawer = await openMenu(page);
      // A counted queue's name carries its badge after the label.
      await drawer.getByRole('link', { name: new RegExp(`^${label}`) }).click();
      await expect(drawer).toBeHidden();
      await expect(page.locator('header h1')).toHaveText(label);
      await page.waitForTimeout(800);
      expect(await overflow(page), `${role} › ${label} is wider than the phone`).toBeLessThanOrEqual(0);
    }
  });
}

test('a requester raises a ticket on a phone, and the wizard fits the screen', async ({ page }) => {
  await login(page, USERS.requester);
  await page.getByRole('button', { name: 'New Ticket' }).first().click();
  const wizard = page.getByRole('dialog');

  await wizard.getByRole('button', { name: PLUMBING.trade }).click();
  await wizard.getByRole('button', { name: PLUMBING.item }).click();
  await wizard.getByRole('button', { name: 'Next' }).click();
  await wizard
    .getByPlaceholder('Describe the fault — what is wrong, and since when…')
    .fill('E2E phone — basin tap loose');
  await wizard.getByRole('button', { name: 'Office' }).click();
  await wizard.getByRole('combobox').last().click();
  await page.getByRole('option', { name: NRB_OFFICE_BLOCK }).click();
  await wizard.getByLabel('Where in it').fill('Ground floor washroom');

  const box = await wizard.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);

  await wizard.getByRole('button', { name: 'Next' }).click();
  const created = page.waitForResponse(
    (r) => /\/tickets\/$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST' && r.ok(),
  );
  await wizard.getByRole('button', { name: 'Submit request' }).click();
  expect((await (await created).json()).ticket_no).toBeTruthy();
});

test('every My Jobs tab fits a phone screen', async ({ page }) => {
  await login(page, USERS.technician);
  for (const path of ['/tech', '/tech/available', '/tech/pending', '/tech/escalated', '/tech/assigned']) {
    await page.goto(path);
    await expect(page.getByRole('tabpanel')).toBeVisible();
    await page.waitForTimeout(800);
    expect(await overflow(page), `${path} is wider than the phone`).toBeLessThanOrEqual(0);
  }
});

test('a technician opens a ticket on a phone and its actions fit the screen', async ({ page }) => {
  await login(page, USERS.technician);
  // My Jobs is cards; Section Tickets always has rows to open.
  await page.goto('/tech/section');
  const row = page.locator('tbody tr').first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();

  const detail = page.getByRole('dialog').first();
  await expect(detail.getByText('Activity')).toBeVisible();
  const box = await detail.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

const NOTICE = 'laid out for a computer';

async function signIn(page: Page, role: keyof typeof USERS | 'admin') {
  if (role === 'admin') await loginAsAdmin(page);
  else await login(page, USERS[role]);
  await expect(page.locator('header h1')).toBeVisible();
}

for (const role of ['hos', 'hod', 'manager', 'admin'] as const) {
  test(`${role}: a phone shows the made-for-a-computer note`, async ({ page }) => {
    await signIn(page, role);
    await expect(page.getByRole('note').filter({ hasText: NOTICE })).toBeVisible();
  });
}

test('the note stays dismissed for that account only', async ({ page }) => {
  await signIn(page, 'hos');
  const notice = page.getByRole('note').filter({ hasText: NOTICE });
  await notice.getByRole('button', { name: 'Dismiss' }).click();
  await expect(notice).toBeHidden();
  await page.reload();
  await expect(page.locator('header h1')).toBeVisible();
  await expect(notice).toHaveCount(0);

  // Someone else signing in on the same phone still sees it.
  await page.evaluate(() => localStorage.removeItem('authToken'));
  await signIn(page, 'manager');
  await expect(notice).toBeVisible();
});

test('the note leaves My Requests alone, and a technician or requester never sees it', async ({ page }) => {
  await signIn(page, 'hos');
  await (await openMenu(page)).getByRole('button', { name: 'My Requests' }).click();
  await expect(page.getByText(NOTICE)).toHaveCount(0);

  for (const who of ['technician', 'requester'] as const) {
    await page.evaluate(() => localStorage.clear());
    await signIn(page, who);
    await expect(page.getByText(NOTICE)).toHaveCount(0);
  }
});

test('a requester pages through every active request on the dashboard', async ({ page }) => {
  await signIn(page, 'requester');
  const total = await page.evaluate(async () => {
    const r = await fetch('http://localhost:8000/api/v1/tickets/?mine=1&status=active&page_size=1', {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
    });
    return (await r.json()).count as number;
  });
  const section = page.locator('main section[aria-labelledby="active-heading"]');
  const cards = section.locator('button[aria-label*="TKT-"]');
  const more = section.getByRole('button', { name: /^Show \d+ more/ });
  await expect(section.getByRole('button', { name: 'All my tickets' })).toBeHidden();

  if (total === 0) {
    await expect(section.getByText('No active requests')).toBeVisible();
    return;
  }
  await expect(cards).toHaveCount(Math.min(total, 6));
  const loaded = Math.min(total, 100);
  if (loaded > 6) {
    await expect(more).toHaveText(`Show ${Math.min(6, loaded - 6)} more · ${loaded - 6} left`);
  }
  while (await more.count()) await more.click();
  await expect(cards).toHaveCount(loaded);
  await expect(section.getByText(/most recently updated/)).toHaveCount(total > 100 ? 1 : 0);
});

test.describe('on a computer', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test('a desk role sees no phone note', async ({ page }) => {
    await signIn(page, 'hos');
    await expect(page.locator('aside')).toBeVisible();
    await expect(page.getByText(NOTICE)).toBeHidden();
  });
});
