import { test, expect, type Page } from '@playwright/test';
import { login, NRB_OFFICE_BLOCK, PLUMBING, USERS, API, apiGet, authHeaders } from './helpers';

// The HOS and the HOD share one dashboard and one Reports page, built from the
// manager's pieces. The server decides the scope: their campus, open work by
// trade, their technicians, and the work waiting for one.

interface Row { key: number; label: string }
interface Dashboard {
  open_by: string;
  open_work: (Row & { waiting: number; with_technician: number; on_hold: number })[];
  technicians: (Row & { open_now: number; overdue: number; total: number })[];
  waiting: { count: number; rows: { id: number; ticket_no: string }[] };
}
interface Overview {
  technicians: (Row & { total: number; open_now: number })[];
  trades: (Row & { total: number })[];
}

async function get<T>(page: Page, path: string): Promise<T> {
  return apiGet(page, `/analytics/${path}`);
}

for (const role of ['hos', 'hod'] as const) {
  test(`${role}: the dashboard shows open work by trade, the waiting list and the technicians`, async ({ page }) => {
    await login(page, USERS[role]);
    await expect(page.locator('header h1')).toHaveText('Dashboard');
    const data = await get<Dashboard>(page, 'dashboard/');
    expect(data.open_by).toBe('trade');

    const bars = page.getByLabel('Open work by trade', { exact: true });
    for (const t of data.open_work) {
      // A trade with nothing open has a bar of no width: present, named, not drawn.
      await expect(bars.getByRole('img', {
        name: `${t.label}: ${t.waiting} waiting, ${t.with_technician} with a technician, ${t.on_hold} on hold`,
      })).toHaveCount(1);
    }

    await expect(page.getByText(`Waiting to be assigned (${data.waiting.count})`)).toBeVisible();
    const waiting = page.getByLabel('Waiting to be assigned', { exact: true });
    for (const t of data.waiting.rows) await expect(waiting.getByText(t.ticket_no)).toBeVisible();

    const people = page.getByLabel('Technicians', { exact: true });
    await expect(people.getByRole('row')).toHaveCount(data.technicians.length + 1);
    for (const t of data.technicians) {
      await expect(people.getByRole('row', { name: new RegExp(`^${t.label}`) }))
        .toHaveText(new RegExp(`^${t.label}\\s*${t.open_now}\\s*${t.overdue}\\s*${t.total}`));
    }

    await expect(page.getByLabel('Facility Health', { exact: true })).toBeVisible();
    // The manager's campus sections are not theirs.
    await expect(page.getByLabel('Open work by campus', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Campuses', { exact: true })).toHaveCount(0);
  });
}

/** Raise one Nairobi plumbing ticket as the requester, so there is always work waiting. */
async function raiseOne(page: Page) {
  const headers = await authHeaders(page.request, USERS.requester);
  const catalog = await (await page.request.get(`${API}/catalog/`, { headers })).json();
  const plumbing = catalog.results.find((t: { name: string }) => t.name === PLUMBING.trade);
  const item = plumbing.items.find((i: { name: string }) => i.name === PLUMBING.item);
  const places = await (await page.request.get(`${API}/facilities/`, { headers })).json();
  const place = places.results.find((f: { name: string }) => f.name === NRB_OFFICE_BLOCK);
  const raised = await page.request.post(`${API}/tickets/`, {
    headers,
    data: { service_item: item.id, location: { facility: place.id, detail: 'E2E supervisor, room 1' } },
  });
  expect(raised.status()).toBe(201);
}

test('the HOS assigns the ticket waiting longest from the dashboard', async ({ page }) => {
  // One raised, one assigned: the run leaves the queue as long as it found it.
  await raiseOne(page);
  await login(page, USERS.hos);
  const before = await get<Dashboard>(page, 'dashboard/');
  const oldest = before.waiting.rows[0];

  const waiting = page.getByLabel('Waiting to be assigned', { exact: true });
  await waiting.getByRole('row', { name: new RegExp(oldest.ticket_no) }).getByRole('button', { name: 'Assign' }).click();
  const modal = page.getByRole('dialog').last();
  await expect(modal.getByText('Assign ticket')).toBeVisible();
  // The first technician offered; the priority select is a button too, so it is left out.
  await modal.locator('button.w-full:not([role="combobox"])').first().click();
  const assigned = page.waitForResponse((r) => r.url().includes(`/tickets/${oldest.id}/assign/`) && r.request().method() === 'POST');
  await modal.getByRole('button', { name: 'Assign', exact: true }).click();
  expect((await assigned).status()).toBe(200);

  // The list refreshes on its own: the ticket leaves it and the count drops.
  await expect(page.getByText(`Waiting to be assigned (${before.waiting.count - 1})`)).toBeVisible();
  await expect(waiting.getByText(oldest.ticket_no)).toHaveCount(0);
});

test('the dashboard links through to the tickets and to Reports', async ({ page }) => {
  await login(page, USERS.hos);
  await page.getByRole('button', { name: 'All tickets' }).click();
  await expect(page.locator('header h1')).toHaveText('Tickets');
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('button', { name: 'See more in Reports' }).click();
  await expect(page.locator('header h1')).toHaveText('Reports');
});

for (const role of ['hos', 'hod'] as const) {
  test(`${role}: Reports follows the manager's layout, with technicians and trades side by side`, async ({ page }) => {
    await login(page, USERS[role]);
    await page.getByRole('link', { name: 'Reports', exact: true }).click();
    await expect(page.locator('header h1')).toHaveText('Reports');
    const data = await get<Overview>(page, 'overview/?days=30&bucket=day');

    const sections = await page.locator('[aria-label]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('aria-label')).filter((l) =>
        ['Needs your attention', 'Facility Health', 'Technicians', 'Trades'].includes(l!)));
    expect(sections).toEqual(['Needs your attention', 'Facility Health', 'Technicians', 'Trades']);

    const people = page.getByLabel('Technicians', { exact: true });
    const trades = page.getByLabel('Trades', { exact: true });
    await expect(people.getByRole('row')).toHaveCount(data.technicians.length + 1);
    for (const t of data.technicians) {
      await expect(people.getByRole('row', { name: new RegExp(`^${t.label}`) }))
        .toHaveText(new RegExp(`^${t.label}\\s*${t.total}\\s*${t.open_now}`));
    }
    for (const t of data.trades) {
      await expect(trades.getByRole('row', { name: new RegExp(`^${t.label}`) })).toContainText(String(t.total));
    }
    // One row on a computer screen.
    const [a, b] = [await people.boundingBox(), await trades.boundingBox()];
    expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);

    // No campus picker and no campus sections: their scope is one campus.
    await expect(page.getByRole('combobox', { name: 'Campus' })).toHaveCount(0);
    for (const gone of ['Campuses', 'Trades by campus', 'Service Health', 'Technician Performance']) {
      await expect(page.getByText(gone, { exact: true })).toHaveCount(0);
    }
  });
}
