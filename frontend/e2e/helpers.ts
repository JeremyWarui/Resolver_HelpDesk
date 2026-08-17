import { expect, type Page } from '@playwright/test';

// Accounts created by `backend/manage.py seed`. Every seeded user shares one
// password — the SEED_DEFAULT_PASSWORD the seed was run with — so the suite
// takes a single env var rather than one per role:
//
//   E2E_PASSWORD=<seed password> npm run test:e2e
//
// The password is never committed.
//
// Sign-in is by email, and a seeded person's address is their name
// (first.last@ksg.ac.ke) — the role is no longer readable off the login, so
// each one is labelled here. `manage.py seed` prints the same list when it
// finishes.
export const USERS = {
  /** System Administrator. */
  admin: 'system.administrator@ksg.ac.ke',
  /** Wanjiku Kamau, the Corporate Director — Administration at every campus. */
  manager: 'wanjiku.kamau@ksg.ac.ke',
  /** Peter Kimani, HOS over Maintenance at Nairobi — assigns and sets priority. */
  hos: 'peter.kimani@ksg.ac.ke',
  /** Esther Wairimu, plumbing technician at Nairobi. Pairs with PLUMBING below. */
  technician: 'esther.wairimu@ksg.ac.ke',
  /** Caroline Wafula, at Nairobi (the seed deals requesters round-robin from NRB). */
  requester: 'caroline.wafula@ksg.ac.ke',
  /** Anthony Gitau — Nairobi like the technician above, but Carpentry and
   *  Painting only. The negative case for pairwise (campus AND trade) scope. */
  technicianOtherTrade: 'anthony.gitau@ksg.ac.ke',
} as const;

/** The trade `USERS.technician` is linked to, and one of its seeded items. */
export const PLUMBING = { trade: 'Plumbing', item: 'Leaking tap or pipe' };

/** A Nairobi office block from the seed — the facility dropdown must offer it. */
export const NRB_OFFICE_BLOCK = 'Administration Block';

export function seedPassword(): string {
  const password = process.env.E2E_PASSWORD;
  if (!password) {
    throw new Error(
      'E2E_PASSWORD is not set. Export the SEED_DEFAULT_PASSWORD that ' +
        "`backend/manage.py seed` was run with before running the e2e suite.",
    );
  }
  return password;
}

/**
 * Sign in and wait for the role's landing page.
 *
 * Roles land on different paths — admin on /dashboard, everyone else on their
 * own prefix — so this waits for "not /login" rather than a fixed URL.
 */
export async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(seedPassword());
  await page.getByRole('button', { name: 'Sign In' }).click();
  // Login navigates via window.location.assign, i.e. a full page load.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 45_000 });
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await login(page, USERS.admin);
  await page.waitForURL('**/dashboard**', { timeout: 45_000 });
}

/**
 * Open a ticket's detail page by its number (KSG-…), from a list page.
 *
 * Ticket numbers come from `TicketSequence.allocate()`, so a spec that creates
 * a ticket cannot predict its number and has to read it back off the row.
 */
export async function openTicketByNumber(page: Page, ticketNo: string): Promise<void> {
  const row = page.getByText(ticketNo, { exact: false }).first();
  await expect(row).toBeVisible();
  await row.click();
}

/** Unique suffix so a failed earlier run's leftovers never collide. */
export function uniqueSuffix(): string {
  return Date.now().toString(36);
}
