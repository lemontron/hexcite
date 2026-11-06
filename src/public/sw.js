// Cleanup worker for browsers that still have the previous version installed.
// Keep this URL available so those browsers can retire their offline cache.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('hexcite-pocket-')).map(key => caches.delete(key)));
    await self.registration.unregister();
  })());
});
