// Service worker del Tablero Cooptech — notificaciones push (ola 30/07).
// Recibe el push del backend (invitaciones/cambios de reuniones) y muestra la
// notificación del sistema aunque la app esté cerrada (Android/Chrome).
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { titulo: 'Tablero Cooptech', cuerpo: event.data?.text() || '' }; }
  event.waitUntil(self.registration.showNotification(data.titulo || 'Tablero Cooptech', {
    body: data.cuerpo || '',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
    for (const c of lista) { if ('focus' in c) { c.navigate(url); return c.focus(); } }
    return clients.openWindow(url);
  }));
});
