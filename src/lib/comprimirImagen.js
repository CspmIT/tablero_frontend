// Compresión de imágenes ANTES de subir al gateway (20/08, sugerencia de Juan,
// alcance decidido por Leonardo: adjuntos de tickets sí — las fotos de
// relevamiento de +Agua ya se comprimían en agua.html desde el origen (1600px,
// JPEG 0.85) — y Marketing queda EXPRESAMENTE AFUERA: el material de campaña
// sube byte a byte intacto (nada de perder calidad).
// Mismos parámetros probados de agua.html, con 1920px de lado máximo.

const MAX_DIM = 1920;            // px en el lado más largo
const CALIDAD = 0.85;            // JPEG
const NO_TOCAR_MENOR_A = 500 * 1024; // <500 KB sube tal cual

const esImagenComprimible = (f) => /^image\/(jpeg|png|webp)$/i.test(f?.type || '');

// Devuelve un File listo para subir: la imagen redimensionada/recomprimida si
// conviene, o el ORIGINAL intacto si no es imagen, ya es chica, el resultado
// no achica, o algo falla (nunca bloquea la subida).
export async function comprimirImagen(file) {
  try {
    if (!esImagenComprimible(file) || file.size < NO_TOCAR_MENOR_A) return file;

    const url = URL.createObjectURL(file);
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('no se pudo cargar'));
      i.src = url;
    });

    let { width, height } = img;
    const lado = Math.max(width, height);
    if (lado > MAX_DIM) {
      const k = MAX_DIM / lado;
      width = Math.round(width * k);
      height = Math.round(height * k);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(url);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', CALIDAD));
    if (!blob || blob.size >= file.size) return file; // no achicó: manda el original

    const nombre = file.name.replace(/\.(png|webp|jpeg|jpg)$/i, '') + '.jpg';
    return new File([blob], nombre, { type: 'image/jpeg' });
  } catch {
    return file; // ante cualquier problema, el original intacto
  }
}
