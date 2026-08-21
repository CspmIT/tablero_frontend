// Archivos PESADOS: subida en partes y lectura en streaming (21/08).
//
// Por qué existe este camino aparte de api/minio.js: Cloudflare está delante de
// storageov y rechaza con 413 CUALQUIER request de más de 100 MB, decidiendo por
// el Content-Length ANTES de reenviarlo al cluster. No hay client_max_body_size
// ni validación del lado del servidor que lo evite — el archivo tiene que salir
// partido desde acá. El gateway (v1.1.6) expone para eso una subida en TROZOS
// sobre POST /minio/uploadRelease/<release>/<path>: los trozos quedan como
// objetos temporales y el ensamblado final lo hace MinIO por copia interna, así
// que los bytes no vuelven a viajar.
//
// Verificado contra producción el 21/08 con el release 'marketing-releases':
// 12 MiB en 3 trozos → SHA-256 idéntico al original; finish con un trozo
// faltante → 409 {"missing":[2]} y, al resubir solo ese, ensamblado correcto;
// uploadId con formato inválido → 400.
//
// ⚠ LECTURA PÚBLICA: GET /releases/<release>/<path> responde 200 SIN
// credenciales (comprobado). Lo que se sube por acá queda legible por cualquiera
// que tenga la URL — es el precio de pasar los 100 MB, y la contrapartida buena
// es que el navegador puede pedir rangos: un video arranca al instante y se
// puede adelantar, en vez de bajarse entero a memoria como con getImage().
// No mandar por este camino nada que no pueda ser público.

const BASE = (import.meta.env.VITE_MINIO_URL || 'https://storageov.cooptech.com.ar').replace(/\/+$/, '');
const RELEASE = import.meta.env.VITE_MINIO_MARKETING_RELEASE || 'marketing-releases';
const ACCESS = import.meta.env.VITE_MINIO_ACCESS;
const SECRET = import.meta.env.VITE_MINIO_SECRET;

// Por encima de este peso, el archivo va en partes (el umbral que usa el propio
// gateway: deja aire para el overhead del request bajo el techo de 100 MB).
export const LIMITE_UNA_PASADA = 90 * 1024 * 1024;

const TROZO = 32 * 1024 * 1024;        // 32 MiB por request (200 MB = 7 requests)
const MINIMO_MINIO = 5 * 1024 * 1024;  // MinIO no ensambla trozos menores, salvo el último
const REINTENTOS = 3;

// Marca en Archivo.key para distinguir estos archivos de los del gateway común
// (mismo idioma que el `url: 'ticket:<id>'` de los tickets). La key queda
// 'release:marketing-releases/marketing/<archivo>' y de ahí sale la URL pública.
const PREFIJO = 'release:';

export const esGrande = (key) => String(key || '').startsWith(PREFIJO);

// URL directa, servible a un <video src> / <img src> (soporta range requests).
export const urlDirecta = (key) => (esGrande(key) ? `${BASE}/releases/${String(key).slice(PREFIJO.length)}` : null);

// Nombre de objeto legible en el bucket, sin acentos ni espacios. El nombre real
// que ve el usuario vive en Archivo.nombre; esto es solo para poder mirar el
// bucket y entender qué hay.
const slugDe = (nombre) => {
  const s = String(nombre || 'archivo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const punto = s.lastIndexOf('.');
  const base = (punto > 0 ? s.slice(0, punto) : s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'archivo';
  const ext = (punto > 0 ? s.slice(punto + 1) : '').replace(/[^a-z0-9]/g, '').slice(0, 5);
  return ext ? `${base}.${ext}` : base;
};

// POST con reintentos: la red de la cooperativa corta, y perder un trozo de
// 32 MiB por un hipo no debería voltear una subida de 200 MB. El 409 del finish
// NO es un error a reintentar: es información (qué trozos faltan), así que vuelve.
async function postReintentando(url, headers, body) {
  let ultimo;
  for (let intento = 1; intento <= REINTENTOS; intento++) {
    try {
      const res = await fetch(url, { method: 'POST', headers, body });
      if (res.ok || res.status === 409) return res;
      ultimo = new Error(`HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
    } catch (e) {
      ultimo = e;
    }
    if (intento < REINTENTOS) await new Promise((r) => setTimeout(r, 1000 * intento));
  }
  throw ultimo || new Error('no se pudo enviar el trozo');
}

// Sube un archivo grande en trozos y devuelve { key, size, partes }.
// onProgress({ parte, total, recuperando }) para la barra de la vista.
// `mime` importa: el Content-Type del objeto final es el del TROZO 1 (así lo
// define el gateway), y un <video> no reproduce un application/octet-stream.
// Comprobado el 21/08: subido con video/mp4, el objeto se sirve con
// `content-type: video/mp4` + `accept-ranges: bytes` y un range request da 206.
export async function subirEnPartes(file, { onProgress, mime } = {}) {
  if (!ACCESS || !SECRET) throw new Error('Falta configurar las credenciales del almacenamiento (VITE_MINIO_ACCESS/SECRET).');
  if (file.size <= MINIMO_MINIO) throw new Error('Archivo demasiado chico para subir en partes.');

  const path = `marketing/${crypto.randomUUID()}-${slugDe(file.name)}`;
  const target = `${BASE}/minio/uploadRelease/${RELEASE}/${path}`;
  const uploadId = crypto.randomUUID().replace(/-/g, ''); // [A-Za-z0-9_-]{8,64}
  const total = Math.ceil(file.size / TROZO);
  const auth = { accesskey: ACCESS, secretkey: SECRET };
  const headers = { ...auth, 'Content-Type': mime || file.type || 'application/octet-stream' };

  const enviarTrozo = (n) => postReintentando(
    `${target}?uploadId=${uploadId}&part=${n}`, headers,
    file.slice((n - 1) * TROZO, n * TROZO),
  );
  const ensamblar = () => postReintentando(`${target}?uploadId=${uploadId}&finish=${total}`, auth, undefined);

  try {
    // Los trozos van de a uno a propósito: en paralelo se gana poco frente al
    // ancho de banda real y se multiplica la memoria del gateway (medido por el
    // equipo del gateway: 4 trozos simultáneos de 48 MiB = 471 MB de RSS).
    for (let n = 1; n <= total; n++) {
      onProgress?.({ parte: n, total });
      await enviarTrozo(n);
    }

    let res = await ensamblar();
    if (res.status === 409) {
      // El servidor dice exactamente qué falta: se resube solo eso en vez de
      // empezar la subida de nuevo.
      const faltan = (await res.json().catch(() => ({}))).missing || [];
      for (const n of faltan) {
        onProgress?.({ parte: n, total, recuperando: true });
        await enviarTrozo(n);
      }
      res = await ensamblar();
    }
    if (!res.ok) throw new Error(`el gateway no pudo ensamblar el archivo (${res.status})`);

    // Verificación barata: para 200 MB no tiene sentido bajarlo de vuelta para
    // comparar el SHA-256 (duplica la transferencia); el tamaño ensamblado ya
    // delata un trozo perdido o repetido.
    const data = await res.json();
    if (Number(data.size) !== file.size) {
      throw new Error(`el gateway ensambló ${data.size} bytes y el archivo tiene ${file.size}. No se publicó.`);
    }
    return { key: `${PREFIJO}${RELEASE}/${path}`, size: Number(data.size), partes: total };
  } catch (e) {
    // Que un abandono no deje trozos huérfanos ocupando el bucket.
    fetch(`${target}?uploadId=${uploadId}`, { method: 'DELETE', headers: auth }).catch(() => {});
    throw e;
  }
}
