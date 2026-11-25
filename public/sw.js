/* Darbak service worker: keeps the app usable when hospital Wi-Fi drops.
 *
 * - The build fills PRECACHE with every file the app needs (see vite.config.ts),
 *   so the first visit already works offline, not only the second.
 * - Pages are network-first (a fresh deploy wins), falling back to the cached page.
 * - Hashed build files are cache-first (their name changes when their content does).
 * - The recorded voice pack is stale-while-revalidate: it plays at once from the
 *   cache and quietly refreshes, so a re-recorded clip arrives on the next visit.
 */
const BUILD = '__BUILD_ID__';
const CACHE = `darbak-${BUILD}`;
const PRECACHE = /*__PRECACHE__*/ ['./', './index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('darbak-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

const remember = (request, response) => {
  if (!response || !response.ok) return response;
  const copy = response.clone();
  caches.open(CACHE).then((cache) => cache.put(request, copy));
  return response;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Audio is requested in ranges by some browsers; those cannot be cached whole.
  if (request.headers.has('range')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => remember('./index.html', response))
        .catch(() => caches.match('./index.html').then((hit) => hit || caches.match('./'))),
    );
    return;
  }

  if (url.pathname.includes('/voice/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const refresh = fetch(request).then((response) => remember(request, response));
        if (!cached) return refresh;
        refresh.catch(() => undefined); // offline: the cached clip is enough
        return cached;
      }),
    );
    return;
  }

  event.respondWith(
    caches
      .match(request)
      .then((cached) => cached || fetch(request).then((r) => remember(request, r))),
  );
});
