// Descargas del Tablero de escritorio (app Tauri).
// El workflow de release publica en storageov un downloads.json con las URLs
// de los instaladores por sistema operativo. Acá sólo lo leemos.
//
// La ruta sigue la convención nueva del gateway: /releases/{nombre_release}/...
// (el mismo prefijo que usa el updater de Tauri en tauri.conf.json).
//   VITE_MINIO_URL              base del gateway (ej: https://storageov.cooptech.com.ar)
//   VITE_MINIO_RELEASES_BUCKET  nombre del release (ej: tablero-releases)

const BASE = (import.meta.env.VITE_MINIO_URL || 'https://storageov.cooptech.com.ar').replace(/\/+$/, '');
const RELEASES_BUCKET = import.meta.env.VITE_MINIO_RELEASES_BUCKET || 'tablero-releases';

const DOWNLOADS_URL = `${BASE}/releases/${RELEASES_BUCKET}/downloads.json`;

// Devuelve el objeto downloads.json publicado por el workflow:
//   { version, windows: {name, browser_download_url}|null,
//     appImage: {...}|null, deb: {...}|null }
// Devuelve null si todavía no hay releases publicados o falla la descarga.
export async function getDesktopDownloads() {
  try {
    const res = await fetch(DOWNLOADS_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
