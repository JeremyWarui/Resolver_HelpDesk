import { readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

// Accounts created by `backend/manage.py seed`. Every seeded user shares one
// password — the SEED_DEFAULT_PASSWORD the seed was run with — so the suite
// takes a single env var rather than one per role:
//
//   E2E_PASSWORD=<seed password> npm run test:e2e
//
// The password is never committed.
//
// Sign-in is by email, and a seeded person's address is their name
// (first.last@ksg.ac.ke) — the role cannot be read off the login, so
// each one is labelled here. `manage.py seed` prints the same list when it
// finishes.
export const USERS = {
  /** System Administrator. */
  admin: 'system.administrator@ksg.ac.ke',
  /** Wanjiku Kamau, the Corporate Director — Administration at every campus. */
  manager: 'wanjiku.kamau@ksg.ac.ke',
  /** Peter Kimani, HOS over Maintenance at Nairobi — assigns and sets priority. */
  hos: 'peter.kimani@ksg.ac.ke',
  /** Aisha Wanjiru, HOD at Nairobi — the HOS's pages, one escalation level up. */
  hod: 'aisha.wanjiru@ksg.ac.ke',
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

/** A trade `USERS.technicianOtherTrade` holds and `USERS.technician` does not.
 *  Anthony Gitau is (Nairobi, Carpentry) and (Nairobi, Painting); Esther
 *  Wairimu is (Nairobi, Plumbing) only. Routing a ticket through this pair
 *  runs pairwise scope in the direction the other specs do not. */
export const CARPENTRY = { trade: 'Carpentry', item: 'Repair door or door frame' };

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
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(seedPassword());
  await page.getByRole('button', { name: 'Sign In' }).click();
  // Login navigates via window.location.assign, i.e. a full page load.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 45_000 });
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await login(page, USERS.admin);
  await page.waitForURL('**/dashboard**', { timeout: 45_000 });
}

/** Unique suffix so a failed earlier run's leftovers never collide. */
export function uniqueSuffix(): string {
  return Date.now().toString(36);
}

/** The e2e backend's API, from e2e/backend.mjs. */
export const API = 'http://localhost:8001/api/v1';

/** GET `path` under the API as whoever this page is signed in as. */
export async function apiGet<T = any>(page: Page, path: string): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  return page.evaluate(async (url) => {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });
    return r.json();
  }, `${API}${path}`);
}

/** The access token this signed-in page is using, for a request made outside it. */
export async function bearer(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem('authToken'));
  expect(token, 'the signed-in page must hold an access token').toBeTruthy();
  return token as string;
}

/** Sign in over the API as `email` and return the headers that carry the session. */
export async function authHeaders(request: APIRequestContext, email: string): Promise<{ Authorization: string }> {
  const res = await request.post(`${API}/auth/login/`, { data: { email, password: seedPassword() } });
  expect(res.ok(), `login as ${email}`).toBeTruthy();
  return { Authorization: `Bearer ${(await res.json()).accessToken}` };
}

/** Raise a ticket through the wizard as whoever is signed in, at an office in
 *  Nairobi, and return what the server answered: its number and id. */
export async function raiseTicket(
  page: Page,
  { trade, item, description, where, beforeReview }: {
    trade: string; item: string; description: string; where: string;
    /** Runs with the location filled, before the review step. */
    beforeReview?: (wizard: Locator) => Promise<void>;
  },
): Promise<{ ticket_no: string; id: number }> {
  await page.getByRole('button', { name: 'New Ticket' }).first().click();
  const wizard = page.getByRole('dialog');
  await wizard.getByRole('button', { name: trade }).click();
  await wizard.getByRole('button', { name: item }).click();
  await wizard.getByRole('button', { name: 'Next' }).click();
  await wizard.getByPlaceholder('Describe the fault — what is wrong, and since when…').fill(description);
  await wizard.getByRole('button', { name: 'Office' }).click();
  await wizard.getByRole('combobox').last().click();
  await page.getByRole('option', { name: NRB_OFFICE_BLOCK }).click();
  await wizard.getByLabel('Where in it').fill(where);
  await beforeReview?.(wizard);
  await wizard.getByRole('button', { name: 'Next' }).click();

  const created = page.waitForResponse(
    (r) => /\/tickets\/$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST' && r.ok(),
  );
  await wizard.getByRole('button', { name: 'Submit request' }).click();
  const body = await (await created).json();
  expect(body.ticket_no, 'the backend must allocate a ticket number').toBeTruthy();
  return body;
}

/** As the technician, with the ticket's sheet open: resolve it with `note`. */
export async function resolveFromSheet(page: Page, note: string): Promise<void> {
  await page.getByRole('dialog').first().getByRole('button', { name: 'Update Status' }).click();
  const modal = page.getByRole('dialog').filter({ hasText: 'Update ticket status' });
  await modal.getByRole('button', { name: 'Resolved', exact: true }).click();
  await modal.getByPlaceholder('Describe what was done or what changed…').fill(note);
  await modal.getByRole('button', { name: 'Save update' }).click();
  await expect(modal).toBeHidden();
}

/** Where e2e/backend.mjs has Django write each email, one file per send. */
const MAIL_DIR = join(tmpdir(), 'resolver-e2e-mail');

/** The newest password reset link emailed to `email`, or null if none was sent. */
export function latestResetLink(email: string): string | null {
  let files: string[];
  try {
    files = readdirSync(MAIL_DIR).map((f) => join(MAIL_DIR, f));
  } catch {
    return null;
  }
  files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const file of files) {
    for (const raw of readFileSync(file, 'utf-8').split(/^-{70,}$/m).reverse()) {
      if (!new RegExp(`^To: ${email}$`, 'mi').test(raw)) continue;
      // Decoded as a mail client would: the body is quoted-printable, so `=` is
      // written `=3D` and a long link wraps with a trailing `=`.
      const message = raw.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      const link = message.match(/https?:\/\/\S+\/reset-password\?uid=[\w-]+&token=[\w-]+/);
      if (link) return link[0];
    }
  }
  return null;
}
