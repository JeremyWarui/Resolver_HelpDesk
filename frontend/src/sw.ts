/// <reference lib="webworker" />
/// <reference types="vite-plugin-pwa/client" />
import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope;

clientsClaim();
cleanupOutdatedCaches();

// Precache all assets built by Vite (injected by vite-plugin-pwa at build time)
precacheAndRoute(self.__WB_MANIFEST);

// ── Runtime caching ───────────────────────────────────────────────────────────

// API — network first (30 s timeout), fall back to cache for offline reads
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 30,
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// Static assets — cache first
registerRoute(
  ({ request }) => ['script', 'style', 'font', 'image'].includes(request.destination),
  new CacheFirst({
    cacheName: 'static-assets',
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// ── Push notifications ─────────────────────────────────────────────────────────

self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;

  let payload: { title?: string; body?: string; ticketId?: number; type?: string } = {};
  try { payload = event.data.json(); } catch { payload = { body: event.data.text() }; }

  const title = payload.title ?? 'Resolver';
  const options = {
    body: payload.body ?? '',
    icon: '/pwa-192.svg',
    badge: '/pwa-192.svg',
    tag: `ticket-${payload.ticketId ?? 'general'}`,
    renotify: true,
    data: { ticketId: payload.ticketId, url: '/tech/mobile' },
  } as NotificationOptions;

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data?.url as string) ?? '/tech/mobile';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes('/technician') || c.url.includes('/tech/mobile'));
      if (existing) { existing.focus(); (existing as WindowClient).navigate(url); }
      else { self.clients.openWindow(url); }
    })
  );
});
