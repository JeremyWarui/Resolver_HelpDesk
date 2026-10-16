import { test, expect } from '@playwright/test';
import { seedPassword, USERS } from './helpers';

// The production build is an installable app: Chrome reports no installability
// errors, the service worker takes control, and the installed app starts at `/`.
// Runs against `vite preview` (port 4173), which serves the built bundle.

const PREVIEW = 'http://localhost:4173';
const API = 'http://localhost:8000/api/v1';

test('the built app is installable', async ({ page }) => {
  await page.goto(`${PREVIEW}/login`);
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, {
    timeout: 30_000,
  });

  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  expect(installabilityErrors).toEqual([]);

  const manifest = await (await page.request.get(`${PREVIEW}/manifest.webmanifest`)).json();
  expect(manifest.start_url).toBe('/');
  expect(manifest.display).toBe('standalone');
  const sizes = manifest.icons.map((i: { sizes: string; type: string }) => `${i.sizes} ${i.type}`);
  expect(sizes).toContain('192x192 image/png');
  expect(sizes).toContain('512x512 image/png');
});

/** The URL of one seeded ticket attachment, read as the admin. */
async function anAttachmentUrl(request: import('@playwright/test').APIRequestContext) {
  const login = await request.post(`${API}/auth/login/`, {
    data: { email: USERS.admin, password: seedPassword() },
  });
  const headers = { Authorization: `Bearer ${(await login.json()).accessToken}` };
  for (let id = 1; id <= 60; id++) {
    const r = await request.get(`${API}/tickets/${id}/attachments/`, { headers });
    if (!r.ok()) continue;
    const rows = await r.json();
    const image = rows.find((a: { mime_type: string }) => a.mime_type.startsWith('image/'));
    if (image) return { url: image.url as string, headers };
  }
  throw new Error('the seed attached no image to tickets 1–60');
}

test('the service worker never caches an API response or an uploaded file', async ({ page }) => {
  const { url } = await anAttachmentUrl(page.request);
  const path = new URL(url).pathname;

  await page.goto(`${PREVIEW}/login`);
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, {
    timeout: 30_000,
  });

  // Through the page, so the requests pass the service worker: an API call,
  // and the attachment as an <img> twice — from this origin via the preview
  // proxy, and from the backend's own origin as the API hands it out.
  await page.evaluate(async ([sameOrigin, crossOrigin]) => {
    await fetch('/api/v1/auth/campuses/');
    const load = (src: string) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = img.onerror = () => resolve();
        img.src = src;
      });
    await load(sameOrigin);
    await load(crossOrigin);
  }, [path, url]);
  await page.waitForTimeout(1000);

  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) urls.push(req.url);
    }
    return urls;
  });
  const leaked = cached.filter((u) => /\/(api|media)\//.test(new URL(u).pathname));
  expect(leaked).toEqual([]);
});
