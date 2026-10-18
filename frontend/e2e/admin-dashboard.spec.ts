import { test, expect, type Page } from '@playwright/test';
import { loginAsAdmin, apiGet } from './helpers';

// The admin's dashboard: what needs setting up and whether the work moves,
// every figure the server's, every card a way to the page that fixes it.

interface Desk {
  escalation: { state: 'never' | 'failing' | 'stale' | 'running' };
  cover: { gaps: number };
  accounts_to_fix: { count: number };
  waiting_too_long: number;
  technicians: { total: number; active: number };
  feedback: { unread: number; latest: { message: string }[] };
  campuses: { name: string; hod: string | null; hos: string | null; gaps: string[]; stuck: number }[];
}

async function desk(page: Page): Promise<Desk> {
  return apiGet(page, `/analytics/desk/`);
}

const STATE = { never: 'Not scheduled', failing: 'Failing', stale: 'Stopped', running: 'Running' } as const;
const card = (page: Page, title: string) => page.getByRole('button', { name: `${title}: open the page that fixes it` });

test('the cards, the campus table and the feedback say what the server says', async ({ page }) => {
  await loginAsAdmin(page);
  await expect(page.locator('header h1')).toHaveText('Dashboard');
  const data = await desk(page);

  await expect(card(page, 'Escalation check')).toContainText(STATE[data.escalation.state]);
  await expect(card(page, 'Trades with nobody to send')).toContainText(String(data.cover.gaps));
  await expect(card(page, 'Accounts to fix')).toContainText(String(data.accounts_to_fix.count));
  await expect(card(page, 'Waiting over 24 hours')).toContainText(String(data.waiting_too_long));
  await expect(card(page, 'Technicians active this week')).toContainText(`${data.technicians.active} / ${data.technicians.total}`);
  await expect(card(page, 'Unread system feedback')).toContainText(String(data.feedback.unread));

  const table = page.getByLabel('Cover by campus', { exact: true });
  await expect(table.getByRole('row')).toHaveCount(data.campuses.length + 1);
  for (const c of data.campuses) {
    const row = table.getByRole('row', { name: new RegExp(`^${c.name}`) });
    await expect(row).toContainText(c.hod ?? 'Vacant');
    await expect(row).toContainText(c.hos ?? 'Vacant');
    for (const g of c.gaps) await expect(row).toContainText(g);
  }

  const feedback = page.getByLabel('System feedback, unread', { exact: true });
  for (const f of data.feedback.latest) await expect(feedback.getByText(f.message)).toBeVisible();
  // The supervisor dashboard's Recent Tickets is not on the admin's.
  await expect(page.getByText('Recent Tickets')).toHaveCount(0);
});

for (const [title, heading] of [
  ['Escalation check', 'SLA Rules'],
  ['Trades with nobody to send', 'Technicians'],
  ['Accounts to fix', 'Users'],
] as const) {
  test(`${title} opens ${heading}`, async ({ page }) => {
    await loginAsAdmin(page);
    await card(page, title).click();
    await expect(page.locator('header h1')).toHaveText(heading);
  });
}
