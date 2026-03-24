const CACHE_NAME = 'memopro-v8';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first for app, cache-first for fonts
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('fonts.googleapis') || event.request.url.includes('fonts.gstatic')) {
    event.respondWith(caches.match(event.request).then(c => c || fetch(event.request).then(r => {
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, r.clone()));
      return r;
    })));
    return;
  }
  event.respondWith(
    fetch(event.request).then(r => {
      if (r && r.status === 200) caches.open(CACHE_NAME).then(c => c.put(event.request, r.clone()));
      return r;
    }).catch(() => caches.match(event.request).then(c => c || caches.match('/index.html')))
  );
});

// ── REMINDER ENGINE ──
self.reminders = [];
self.habitLogs = {};
self.firedOnce = {}; // tracks fired one-time notes

self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'SCHEDULE_REMINDERS') {
    self.reminders = event.data.reminders || [];
    if (!self.reminderTick) {
      self.reminderTick = setInterval(checkReminders, 60000);
    }
    checkReminders();
  }
  if (event.data.type === 'UPDATE_LOGS') {
    self.habitLogs = event.data.logs || {};
  }
});

function localDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function checkReminders() {
  const now = new Date();
  const todayStr = localDateStr();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowTs = now.getTime();

  (self.reminders || []).forEach(r => {

    // ── HABIT — fires daily at exact time if not done ──
    if (r.type === 'habit') {
      const [hh, mm] = r.time.split(':').map(Number);
      if (Math.abs(nowMin - (hh * 60 + mm)) <= 1) {
        const done = (self.habitLogs[`${r.id}_${todayStr}`] || 0) >= (r.goal || 1);
        if (!done) notify(r.id, r.name, r.body);
      }
    }

    // ── NOTE ONE-TIME — fires once at exact timestamp ──
    if (r.type === 'note-once') {
      const diff = nowTs - r.timestamp;
      if (diff >= 0 && diff <= 90000 && !self.firedOnce[r.id]) {
        self.firedOnce[r.id] = true;
        notify(r.id, '🗒️ ' + r.name, r.body);
      }
    }

    // ── NOTE RECURRING — fires at matching time/day ──
    if (r.type === 'note-recur') {
      const [hh, mm] = r.time.split(':').map(Number);
      if (Math.abs(nowMin - (hh * 60 + mm)) > 1) return;
      let shouldFire = false;
      if (r.freq === 'daily') {
        shouldFire = true;
      } else if (r.freq === 'weekly') {
        shouldFire = now.getDay() === (r.day ?? 0);
      } else if (r.freq === 'monthly') {
        shouldFire = now.getDate() === (r.dom || 1);
      }
      if (shouldFire) notify(r.id + '_' + todayStr, '🗒️ ' + r.name, r.body);
    }
  });
}

function notify(tag, title, body) {
  self.registration.showNotification(title, {
    body: body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: String(tag),
    renotify: false,
    data: { url: '/' }
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
