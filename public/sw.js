// Offline support for ChinhAnh.
// - Page navigations: network first, falling back to the cached app shell.
// - Hashed build assets (/assets/*): cache first; they never change.
// - AI background-removal model files (staticimgly.com): cache first, so the
//   feature keeps working offline after it has been used once.
// - Other same-origin files: stale-while-revalidate.

const VERSION = 'v1';
const SHELL_CACHE = `chinhanh-shell-${VERSION}`;
const ASSET_CACHE = `chinhanh-assets-${VERSION}`;
const MODEL_CACHE = 'chinhanh-ai-models';
const KEEP = new Set([SHELL_CACHE, ASSET_CACHE, MODEL_CACHE]);
const SCOPE = new URL(self.registration.scope);
const SHELL_URL = new URL('./', SCOPE).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      const response = await fetch(SHELL_URL, { cache: 'no-cache' });
      if (!response.ok) return;
      await shell.put(SHELL_URL, response.clone());
      // Precache the entry script/styles referenced by index.html.
      const html = await response.text();
      const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
        .map((m) => new URL(m[1], SHELL_URL))
        .filter((u) => u.origin === SCOPE.origin)
        .map((u) => u.href);
      const assets = await caches.open(ASSET_CACHE);
      await Promise.allSettled(urls.map((u) => assets.add(u)));
    })().then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('chinhanh-') && !KEEP.has(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(SHELL_URL, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(SHELL_URL);
    if (hit) return hit;
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit);
  return hit ?? refresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate' && url.origin === SCOPE.origin) {
    event.respondWith(networkFirstShell(request));
  } else if (url.hostname === 'staticimgly.com') {
    event.respondWith(cacheFirst(request, MODEL_CACHE));
  } else if (url.origin === SCOPE.origin && url.pathname.startsWith(`${SCOPE.pathname}assets/`)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  } else if (url.origin === SCOPE.origin) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
