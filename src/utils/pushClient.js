// Cliente de notificaciones push (ola 30/07): pide permiso, suscribe al
// service worker con la clave pública VAPID del servidor y registra la
// suscripción para este colaborador.
function b64aUint8(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(b);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSoportado() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function pushEstado() {
  if (!pushSoportado()) return 'no_soportado';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export async function activarNotificaciones(api) {
  if (!pushSoportado()) throw new Error('Este navegador no soporta notificaciones push');
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error('Permiso de notificaciones no otorgado');
  const reg = await navigator.serviceWorker.ready;
  const { clave } = await api.push.clavePublica();
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aUint8(clave) });
  await api.push.suscribir(sub.toJSON());
  return true;
}
