const cacheName = 'hexcite-__VERSION__';
const cacheReady = caches.open(cacheName);

self.oninstall = event => {
  event.waitUntil(cacheReady.then(cache => cache.addAll(__FILES__)));
};

// Updates activate after open games close; only then remove their old caches.
self.onactivate = event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('hexcite-') && name !== cacheName) {
        await caches.delete(name);
      }
    }
    await self.clients.claim();
  })());
};

self.onfetch = event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  event.respondWith((async () => {
    const cache = await cacheReady;
    const path = new URL(request.url).pathname;
    const isStandalonePage = path === '/support' || path === '/privacy';
    const cacheKey = request.mode === 'navigate' ? (isStandalonePage ? path : '/') : request;
    const cachedResponse = await cache.match(cacheKey);
    return cachedResponse || fetch(request);
  })());
};
