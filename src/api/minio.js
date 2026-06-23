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

// Descarga un objeto y devuelve una URL local (objectURL) lista para <img src>.
// IMPORTANTE: revocá la URL con URL.revokeObjectURL() cuando ya no la uses.
export async function getImage(fileName) {
  const res = await fetch(`${BASE}/minio/getImg/${BUCKET}/${fileName}`, {
    method: 'GET',
    headers: { accesskey: ACCESS, secretkey: SECRET, Accept: 'image/*' },
  });
  if (!res.ok) throw new Error(`No se pudo obtener la imagen (${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
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
