const CACHE_NAME = 'memopro-v7';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first for app files, cache-first for fonts
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
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

// ── BACKGROUND REMINDER CHECK ──
// Receives reminder schedule from the app page
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SCHEDULE_REMINDERS') {
    // Store reminders in SW scope
    self.pendingReminders = event.data.reminders || [];
    // Start checking loop if not already running
    if (!self.reminderInterval) {
      self.reminderInterval = setInterval(checkReminders, 60000); // check every minute
    }
    checkReminders(); // also check immediately
  }
  if (event.data && event.data.type === 'UPDATE_LOGS') {
    self.habitLogs = event.data.logs || {};
  }
});

function localDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function checkReminders() {
  const reminders = self.pendingReminders || [];
  const logs = self.habitLogs || {};
  if (!reminders.length) return;

  const now = new Date();
  const todayStr = localDateStr();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  reminders.forEach(r => {
    const [hh, mm] = r.time.split(':').map(Number);
    const remMin = hh * 60 + mm;
    // Fire if within 1 minute window
    if (Math.abs(nowMin - remMin) <= 1) {
      // Check if already done today
      const logKey = `${r.id}_${todayStr}`;
      const val = logs[logKey] || 0;
      if (val < (r.goal || 1)) {
        self.registration.showNotification('🔔 ' + r.name, {
          body: r.body || '',
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: r.id,
          renotify: false,
          data: { url: '/' }
        });
      }
    }
  });
}

// Notification click → open app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      return clients.openWindow('/');
    })
  );
});
