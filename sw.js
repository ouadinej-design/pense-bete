const CACHE_NAME = 'memopro-v5';

// Network-first: toujours récupérer la dernière version, cache en fallback
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  // Fonts: cache-first (externes, ne changent pas)
  if (event.request.url.includes('fonts.googleapis') || event.request.url.includes('fonts.gstatic')) {
    event.respondWith(
      caches.match(event.request).then(c => c || fetch(event.request).then(r => {
        const clone = r.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return r;
      }))
    );
    return;
  }
  // App files: network-first, cache en fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(c => c || caches.match('/index.html')))
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
