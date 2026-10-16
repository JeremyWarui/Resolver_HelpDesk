import { test, expect, type Page } from '@playwright/test';
import { loginAsAdmin } from './helpers';

// The admin's escalation check on SLA Rules: whether the scheduled job is
// alive, what it would move now, and a preview that changes nothing.

interface Status {
  state: 'never' | 'failing' | 'stale' | 'running';
  interval_minutes: number;
  due: { hos: number; hod: number };
}

async function status(page: Page): Promise<Status> {
  return page.evaluate(async () => {
    const r = await fetch('http://localhost:8000/api/v1/escalations/', {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
    });
    return r.json();
  });
}

const LABEL = { never: 'Not scheduled', failing: 'Failing', stale: 'Stopped', running: 'Running' } as const;

async function openSlaRules(page: Page) {
  await loginAsAdmin(page);
  await page.getByRole('link', { name: 'SLA Rules', exact: true }).click();
  await expect(page.locator('header h1')).toHaveText('SLA Rules');
}

test('the card says what the server says', async ({ page }) => {
  await openSlaRules(page);
  const data = await status(page);
  const card = page.getByLabel('Escalation check', { exact: true });

  // The pill comes first; with nothing scheduled, Next run says it again.
  await expect(card.getByText(LABEL[data.state], { exact: true }).first()).toBeVisible();
  await expect(card.getByText(`Every ${data.interval_minutes} minutes`, { exact: true })).toBeVisible();
  const due = data.due.hos || data.due.hod ? `${data.due.hos} to the HOS · ${data.due.hod} to the HOD` : 'None';
  await expect(card.getByText(due, { exact: true })).toBeVisible();
  await expect(page.getByText('Starts when raised, or reopened')).toBeVisible();
});

test('Preview lists what a run would move and changes nothing', async ({ page }) => {
  await openSlaRules(page);
  const before = await status(page);
  const preview = page.waitForResponse((r) => r.url().includes('/escalations/preview/'));

  await page.getByRole('button', { name: 'Preview' }).click();
  const body = await (await preview).json();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('What a run would move now')).toBeVisible();
  if (body.count) {
    for (const t of body.tickets) await expect(dialog.getByText(t.ticket_no)).toBeVisible();
  } else {
    await expect(dialog.getByText('Nothing is due to climb.')).toBeVisible();
  }

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect((await status(page)).due).toEqual(before.due);
});

test('Run now reports what moved and reads the status again', async ({ page }) => {
  await openSlaRules(page);
  // The run itself is held by the backend suite; here the click, the toast and
  // the refresh are what is under test, so the shared database is left as it is.
  await page.route('**/api/v1/escalations/run/', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 1, started_at: new Date().toISOString(), finished_at: new Date().toISOString(),
        started_by: 'System Administrator', to_hos: 2, to_hod: 1, seconds: 0.4, error: '',
      }),
    }),
  );
  const refreshed = page.waitForResponse((r) => r.url().endsWith('/escalations/') && r.request().method() === 'GET');

  await page.getByRole('button', { name: 'Run now' }).click();

  await expect(page.getByText('Escalation check ran: 2 to the HOS, 1 to the HOD.')).toBeVisible();
  await refreshed;
});

test('Run now warns when the run skipped a ticket', async ({ page }) => {
  await openSlaRules(page);
  // As above, the run is answered here, so the shared database is left as it is.
  await page.route('**/api/v1/escalations/run/', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 2, started_at: new Date().toISOString(), finished_at: new Date().toISOString(), scheduled: false,
        started_by: 'System Administrator', to_hos: 1, to_hod: 0, seconds: 0.4, error: 'ticket 7: RuntimeError: x',
        outcome: 'failed',
      }),
    }),
  );

  await page.getByRole('button', { name: 'Run now' }).click();

  await expect(page.getByText(/Escalation check ran \(1 to the HOS, 0 to the HOD\), but skipped tickets/)).toBeVisible();
});
