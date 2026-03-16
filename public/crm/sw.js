// Mallan CRM Service Worker — push notification stub
self.addEventListener('install', function(e) { self.skipWaiting(); });
self.addEventListener('activate', function(e) { e.waitUntil(clients.claim()); });

// Push notification handler
self.addEventListener('push', function(e) {
  var data = {};
  try { data = e.data.json(); } catch(err) { data = { title: 'Mallan CRM', body: e.data ? e.data.text() : 'New notification' }; }

  e.waitUntil(
    self.registration.showNotification(data.title || 'Mallan CRM', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'mallan-crm',
      data: { url: data.url || '/crm/dashboard' }
    })
  );
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  var url = e.notification.data && e.notification.data.url ? e.notification.data.url : '/crm/dashboard';
  e.waitUntil(clients.openWindow(url));
});
