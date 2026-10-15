// Cliente del almacenamiento de archivos.
// El frontend sube y lee los archivos DIRECTO contra el gateway intermedio
// (storageov → MinIO). El backend sólo guarda la referencia (el fileName/key).
//
// Configurable por entorno (.env del frontend):
//   VITE_MINIO_URL     base del gateway (ej: https://storageov.cooptech.com.ar)
//   VITE_MINIO_BUCKET  nombre del bucket (ej: tablero)
//   VITE_MINIO_ACCESS  accesskey
//   VITE_MINIO_SECRET  secretkey

const BASE = (import.meta.env.VITE_MINIO_URL || 'https://storageov.cooptech.com.ar').replace(/\/+$/, '');
const BUCKET = import.meta.env.VITE_MINIO_BUCKET || 'tablero';
const ACCESS = import.meta.env.VITE_MINIO_ACCESS;
const SECRET = import.meta.env.VITE_MINIO_SECRET;

const MIME_POR_EXTENSION = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf',
};

// Tipo MIME a partir de la extensión del nombre (null si no se reconoce).
export const mimeDeNombre = (nombre) => MIME_POR_EXTENSION[String(nombre || '').split('.').pop().toLowerCase()] || null;

// Descarga un objeto y devuelve una URL local (objectURL) lista para <img src>.
// IMPORTANTE: revocá la URL con URL.revokeObjectURL() cuando ya no la uses.
// `mime` (opcional): el gateway no manda Content-Type y el navegador adivina
// mal (text/xml para un PNG), con lo que abrir el blob en otra pestaña falla.
// Se etiqueta con el tipo real; sin `mime`, se deduce de la extensión.
export async function getImage(fileName, mime = null) {
  const res = await fetch(`${BASE}/minio/getImg/${BUCKET}/${fileName}`, {
    method: 'GET',
    headers: { accesskey: ACCESS, secretkey: SECRET, Accept: 'image/*' },
  });
  if (!res.ok) throw new Error(`No se pudo obtener la imagen (${res.status})`);
  const blob = await res.blob();
  const tipo = mime || mimeDeNombre(fileName);
  return URL.createObjectURL(tipo ? new Blob([blob], { type: tipo }) : blob);
}

// Sube un archivo al gateway y devuelve el fileName con el que quedó guardado.
export async function saveImage(file) {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('bucketName', BUCKET);
  const res = await fetch(`${BASE}/minio/uploadImg`, {
    method: 'POST',
    headers: { accesskey: ACCESS, secretkey: SECRET },
    body: formData,
  });
  if (!res.ok) throw new Error(`No se pudo subir la imagen (${res.status})`);
  const data = await res.json();
  return data.fileName;
}

// Sube un documento (PDF) por /minio/uploadFile: /minio/uploadImg solo acepta
// jpeg/png y rechaza el resto. Devuelve el fileName, igual que saveImage.
export async function saveFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('bucketName', BUCKET);
  const res = await fetch(`${BASE}/minio/uploadFile`, {
    method: 'POST',
    headers: { accesskey: ACCESS, secretkey: SECRET },
    body: formData,
  });
  if (!res.ok) throw new Error(`No se pudo subir el archivo (${res.status})`);
  const data = await res.json();
  return data.fileName;
}

// Adjunto de ticket: los PDF van como documento, el resto como imagen.
export const saveAdjunto = (file) => (file?.type === 'application/pdf' ? saveFile(file) : saveImage(file));
