/* Static fallback only. Never cache authenticated HTML, APIs, evidence, or approval records. */
const CACHE = 'hac-public-shell-v1';
const PUBLIC_ASSETS = ['/offline.html', '/hac-icon.svg', '/manifest.webmanifest'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PUBLIC_ASSETS))); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('hac-public-shell-') && key !== CACHE).map(key => caches.delete(key))))); });
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (PUBLIC_ASSETS.includes(new URL(request.url).pathname)) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request))); return;
  }
  if (request.mode === 'navigate') event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
});
