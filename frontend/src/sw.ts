/// <reference lib="webworker" />
/// <reference types="vite-plugin-pwa/client" />
// The service worker that makes the app installable. It caches the app shell
// and this origin's static assets only. API responses and uploaded files
// (/media/, and anything from the backend's origin) always come from the
// network, so one person's tickets are never left in a cache the next person
// on the device could read.
import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope;

clientsClaim();
cleanupOutdatedCaches();

// Everything Vite built, injected by vite-plugin-pwa at build time.
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ request, url }) =>
    url.origin === self.location.origin &&
    !url.pathname.startsWith('/api/') &&
    !url.pathname.startsWith('/media/') &&
    ['script', 'style', 'font', 'image'].includes(request.destination),
  new CacheFirst({
    cacheName: 'static-assets',
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);
