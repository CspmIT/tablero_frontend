// Marketing (20/08, ola 1) — botón principal del menú. Entorno de trabajo y
// repositorio del material que hoy vive desparramado en el Drive de los
// tercerizados (antes Afternoon, hoy Booster). Dos solapas:
//   · Planificación — mes a mes (como la grilla), 4 categorías fijas que
//     espejan las carpetas reales del Drive: Feed, Historia, LinkedIn, Mailing.
//   · Marca — repositorio permanente: manual de marca, logos, videos, imágenes.
// OLA 2 (20/08 noche, validada la ola 1 en producción el mismo día):
//   · SUBCARPETAS libres dentro de cada zona (los logos de marca y de productos
//     quedaban mezclados) + atajo «＋ día» en Planificación (picker → DD.MM,
//     como las carpetas por día de Booster).
//   · VISTA GALERÍA: entrar a una subcarpeta y ver miniaturas grandes.
//   · Curaduría: todos crean subcarpetas; renombrar/borrar/mover archivos es
//     de manager/gerencial (el backend acompaña).
// Diseño congelado: claude/Marketing_seccion_diseno_20_08.md
//
// CERO migraciones (patrón Documentación 18/08): referencia en el modelo
// Archivo con contexto 'marketing'; la ubicación lógica viaja en `url`:
//   plan/<YYYY-MM>/<cat>[/<sub>]   |   marca/<carpeta>[/<sub>]
// La lista de subcarpetas (para que existan aunque estén vacías) es la clave
// JSON `marketing_carpetas` en Configuracion. El binario vive en el gateway
// storageov → MinIO. Subida con plan B de camuflaje .pdf si el gateway
// rechaza la extensión. EN MARKETING NADA SE COMPRIME: byte a byte intacto.
//
// PESADOS (21/08, fix de Juan en masters 8): arriba de 90 MB el archivo NO puede
// ir en un solo request (Cloudflare rechaza con 413 todo lo que pase los 100 MB
// — este era el techo real, no nginx), así que va en trozos de 32 MiB por el
// release 'marketing-releases' y se lee por URL directa, en streaming. Ese
// camino queda marcado en la key ('release:...') y lo maneja api/storageGrande.js
// — ojo que esas URLs son PÚBLICAS: no mandar por ahí nada confidencial.
// Además el gateway ahora expone borrado de binarios: al eliminar la referencia,
// el backend borra también el objeto en MinIO (lib/almacenamiento.js).
import { useEffect, useRef, useState } from 'react';
import { Megaphone, Folder, FolderPlus, CalendarPlus, ArrowLeft, Pencil } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';
import { getImage, saveImage } from '../api/minio.js';
import { LIMITE_UNA_PASADA, subirEnPartes, esGrande, urlDirecta } from '../api/storageGrande.js';

const CONTEXTO = 'marketing';

// Canales del calendario (mismos ids que las zonas de Contenido; color por canal).
const CANALES_CAL = [
  { id: 'feed', label: 'Feed', chip: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  { id: 'historia', label: 'Historia', chip: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  { id: 'linkedin', label: 'LinkedIn', chip: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500' },
  { id: 'mailing', label: 'Mailing', chip: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
];
const CANAL_DE = (id) => CANALES_CAL.find((c) => c.id === id) || CANALES_CAL[0];
// Formatos sugeridos (los del excel de Booster); campo libre igual — lección enum.
const FORMATOS_SUG = ['Historia', 'Carrusel', 'Reel', 'Placa', 'Mailing', 'Nota'];
const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Categorías de la planificación mensual (espejo de las carpetas del Drive).
const CATS_PLAN = [
  { id: 'feed', label: 'Feed', emoji: '🖼️' },
  { id: 'historia', label: 'Historias', emoji: '📱' },
  { id: 'linkedin', label: 'LinkedIn', emoji: '💼' },
  { id: 'mailing', label: 'Mailing', emoji: '✉️' },
];
// Carpetas permanentes del repositorio de marca.
const CATS_MARCA = [
  { id: 'manual', label: 'Manual de marca', emoji: '📕' },
  { id: 'logos', label: 'Logos', emoji: '🔷' },
  { id: 'videos', label: 'Videos', emoji: '🎬' },
  { id: 'imagenes', label: 'Imágenes', emoji: '🖼️' },
];

// Extensiones aceptadas (pedido de Leonardo: manual .pdf, logos .svg/.png,
// videos .mp4, imágenes .jpg; sumamos gif/webp y comprimidos por las dudas).
const EXTS = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp4', 'zip', 'rar', '7z'];
const ACCEPT = EXTS.map((e) => `.${e}`).join(',');
// Tope de subida. El 20/08 eran 100 MB (el techo de Cloudflare) y los videos
// más pesados iban por link externo; desde el 21/08 lo que pasa de 90 MB sube en
// trozos de 32 MiB, así que el tope real es la paciencia: 500 MB son 16 requests.
const TOPE_MB = 500;

const extDe = (nombre) => (String(nombre || '').split('.').pop() || '').toLowerCase();
const esImagen = (n) => ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extDe(n));
const esVideo = (n) => extDe(n) === 'mp4';
const esComprimido = (n) => ['zip', 'rar', '7z'].includes(extDe(n));
const MIME_POR_EXT = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', mp4: 'video/mp4',
  zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
};
const mimeDe = (n) => MIME_POR_EXT[extDe(n)] || 'application/octet-stream';
const iconoDe = (n) => (esImagen(n) ? '🖼' : esVideo(n) ? '🎬' : esComprimido(n) ? '🗜' : extDe(n) === 'svg' ? '🔷' : '📄');

const fmtTam = (n) => {
  if (n == null) return '—';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};
const fmtFecha = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR');
};
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const sha256Hex = async (buf) => {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

// Mes lógico 'YYYY-MM' ↔ etiqueta legible.
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const mesHoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const mesLabel = (ym) => {
  const [y, m] = String(ym).split('-').map(Number);
  return `${MESES[(m || 1) - 1]} ${y}`;
};
const mesSumar = (ym, delta) => {
  const [y, m] = String(ym).split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// Miniatura perezosa de imágenes: baja el objeto recién cuando la fila existe.
// `grande` = tile de galería (más alto, ancho completo).
function Miniatura({ archivo, grande = false }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    // Los pesados se sirven por URL directa: nada que bajar ni que revocar.
    if (esGrande(archivo.key)) { setSrc(urlDirecta(archivo.key)); return undefined; }
    let url = null, cancelado = false;
    (async () => {
      try {
        url = await getImage(archivo.key);
        if (!cancelado) setSrc(url); else URL.revokeObjectURL(url);
      } catch { /* sin miniatura: queda el icono */ }
    })();
    return () => { cancelado = true; if (url) URL.revokeObjectURL(url); };
  }, [archivo.key]);
  if (grande) {
    return src
      ? <img src={src} alt="" className="w-full h-36 rounded-t-lg object-cover bg-slate-100" />
      : <div className="w-full h-36 rounded-t-lg bg-slate-100 flex items-center justify-center text-3xl">🖼</div>;
  }
  if (!src) return <span className="text-lg w-9 h-9 flex items-center justify-center">🖼</span>;
  return <img src={src} alt="" className="w-9 h-9 rounded object-cover border border-slate-200" />;
}

export default function Marketing() {
  const { api, me } = useData();
  const puedeCurar = ['manager', 'gerencial'].includes(me?.tipo);

  const [solapa, setSolapa] = useState('plan'); // plan | eventos | marca
  const [mes, setMes] = useState(mesHoy());
  const [anio, setAnio] = useState(new Date().getFullYear()); // solapa Eventos (anual)
  // Calendario del mes (ola 3): ítems de publicación (excel de Booster → calendario).
  const [posts, setPosts] = useState([]);
  const [diaSel, setDiaSel] = useState(null); // día abierto en el panel (1..31) | null
  // Sello «usado» (22/08): ids de archivos vinculados a ALGUNA publicación/campaña.
  const [usados, setUsados] = useState(new Set());
  // Campañas publicitarias (26/08): pocas por año — se traen TODAS y el frontend
  // decide qué mostrar (el período puede cruzar meses: 20/08 → 10/09).
  const [campanias, setCampanias] = useState([]);
  const cargarPosts = async (m) => {
    try { const r = await api.marketingPosts.list(m); setPosts(Array.isArray(r?.posts) ? r.posts : []); }
    catch { setPosts([]); } // backend viejo: el calendario queda vacío, el resto sigue
    try { const u = await api.marketingPosts.archivosUsados(); setUsados(new Set(u?.archivoIds || [])); }
    catch { /* sin sello */ }
    try { const c = await api.marketingCampanias.list(); setCampanias(Array.isArray(c?.campanias) ? c.campanias : []); }
    catch { setCampanias([]); }
  };
  useEffect(() => { cargarPosts(mes); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [mes]);
  const [archivos, setArchivos] = useState(null); // null = cargando (todas las refs del contexto)
  const [carpetas, setCarpetas] = useState({});   // { rutaZona: [subnombres] } (Configuracion)
  const [error, setError] = useState('');
  const [busca, setBusca] = useState('');
  // Vista galería (ola 2): subcarpeta abierta { ruta, migas: [..] } | null
  const [vista, setVista] = useState(null);

  const cargar = async () => {
    try {
      const [r, rc] = await Promise.all([
        api.archivos.list({ contexto: CONTEXTO }),
        api.archivos.marketingCarpetas().catch(() => null), // backend viejo: la sección sigue sin subcarpetas
      ]);
      setArchivos(Array.isArray(r?.data) ? r.data : []);
      if (rc && rc.carpetas && typeof rc.carpetas === 'object') setCarpetas(rc.carpetas);
      setError('');
    } catch (e) { setArchivos([]); setError(e.message || 'No se pudo cargar Marketing'); }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Ubicación lógica: 'plan/2026-08/feed[/sub]' | 'marca/logos[/sub]'.
  const rutaDe = (a) => String(a.url || '').trim();
  const enRuta = (ruta) => (archivos || []).filter((a) => rutaDe(a) === ruta)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const enZona = (ruta) => (archivos || []).filter((a) => rutaDe(a) === ruta || rutaDe(a).startsWith(ruta + '/'));
  // Subcarpetas de una zona: las declaradas en Configuracion ∪ las derivadas de archivos.
  const subsDe = (rutaZona) => {
    const declaradas = Array.isArray(carpetas[rutaZona]) ? carpetas[rutaZona] : [];
    const derivadas = (archivos || [])
      .map(rutaDe)
      .filter((u) => u.startsWith(rutaZona + '/'))
      .map((u) => u.slice(rutaZona.length + 1).split('/')[0])
      .filter(Boolean);
    const vistos = new Set();
    return [...declaradas, ...derivadas]
      .filter((s) => { const k = s.toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true; })
      .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  };

  const guardarCarpetas = async (nuevo) => {
    const r = await api.archivos.guardarMarketingCarpetas(nuevo);
    setCarpetas(r?.carpetas && typeof r.carpetas === 'object' ? r.carpetas : nuevo);
  };
  const crearSub = async (rutaZona, nombre) => {
    const n = String(nombre || '').trim().replace(/\//g, '·').slice(0, 60);
    if (!n) return false;
    const actuales = subsDe(rutaZona);
    if (actuales.some((s) => s.toLowerCase() === n.toLowerCase())) { setError(`La subcarpeta "${n}" ya existe ahí.`); return false; }
    try {
      await guardarCarpetas({ ...carpetas, [rutaZona]: [...(carpetas[rutaZona] || []), n] });
      return true;
    } catch (e) { setError(e.message || 'No se pudo crear la subcarpeta'); return false; }
  };
  // Renombrar (gestores): actualiza la lista Y mueve los archivos (PATCH url uno a uno).
  const renombrarSub = async (rutaZona, viejo, nuevo) => {
    const n = String(nuevo || '').trim().replace(/\//g, '·').slice(0, 60);
    if (!n || n === viejo) return;
    try {
      const afectados = enRuta(`${rutaZona}/${viejo}`);
      for (const a of afectados) await api.archivos.update(a.id, { url: `${rutaZona}/${n}` });
      const lista = (carpetas[rutaZona] || []).filter((s) => s.toLowerCase() !== viejo.toLowerCase());
      await guardarCarpetas({ ...carpetas, [rutaZona]: [...lista, n] });
      if (vista?.ruta === `${rutaZona}/${viejo}`) setVista((v) => ({ ...v, ruta: `${rutaZona}/${n}`, migas: [...v.migas.slice(0, -1), n] }));
      cargar();
    } catch (e) { setError(e.message || 'No se pudo renombrar'); }
  };
  const borrarSub = async (rutaZona, sub) => {
    if (enRuta(`${rutaZona}/${sub}`).length) { setError(`"${sub}" tiene archivos — movelos o borralos antes de eliminar la subcarpeta.`); return; }
    try {
      await guardarCarpetas({ ...carpetas, [rutaZona]: (carpetas[rutaZona] || []).filter((s) => s.toLowerCase() !== sub.toLowerCase()) });
    } catch (e) { setError(e.message || 'No se pudo eliminar la subcarpeta'); }
  };
  // Mover un archivo de ubicación (gestores): PATCH url.
  const moverArchivo = async (a, nuevaRuta) => {
    try { await api.archivos.update(a.id, { url: nuevaRuta }); cargar(); }
    catch (e) { setError(e.message || 'No se pudo mover'); }
  };

  // Buscador global: con texto, cruza meses, categorías, subcarpetas y marca.
  const nb = norm(busca.trim());
  const resultados = nb
    ? (archivos || []).filter((a) => norm(a.nombre).includes(nb) || norm(rutaDe(a)).includes(nb))
    : null;

  // ---------- Subida (todos pueden subir; curaduría manager/gerencial) ----------
  const [subida, setSubida] = useState(null); // { txt, ok? } | { err }
  const [arrastrando, setArrastrando] = useState(null); // ruta destino resaltada
  const inputRef = useRef(null);
  const rutaInputRef = useRef(null); // adónde caen los archivos del picker

  const subirArchivos = async (files, ruta) => {
    const lista = Array.from(files || []).filter(Boolean);
    if (!lista.length) return;
    for (const f of lista) {
      if (!EXTS.includes(extDe(f.name))) { setSubida({ err: `"${f.name}": tipo no aceptado (${EXTS.join(', ')}).` }); return; }
      if (f.size > TOPE_MB * 1024 * 1024) {
        setSubida({ err: `"${f.name}" pesa ${fmtTam(f.size)} — el tope es ${TOPE_MB} MB. Un archivo así conviene comprimirlo (para Feed, Historias o LinkedIn alcanza H.264 1080p) o dejarlo por link externo.` });
        return;
      }
    }
    for (const f of lista) {
      setSubida({ txt: `Subiendo "${f.name}"…` });
      try {
        // PESADO (> 90 MB): en trozos de 32 MiB por el release, porque Cloudflare
        // rechaza con 413 cualquier request que pase los 100 MB. No se baja de
        // vuelta para comparar el SHA-256 (duplicaría la transferencia): el
        // tamaño ensamblado que devuelve el gateway ya delata un trozo perdido.
        if (f.size > LIMITE_UNA_PASADA) {
          const { key } = await subirEnPartes(f, {
            // El Content-Type del objeto final es el del primer trozo: si no va
            // el real, el navegador no reproduce el video (lo baja).
            mime: mimeDe(f.name),
            onProgress: ({ parte, total, recuperando }) => setSubida({
              txt: recuperando
                ? `Subiendo "${f.name}" — recuperando el trozo ${parte} de ${total}…`
                : `Subiendo "${f.name}" en partes — trozo ${parte} de ${total} (${Math.round(((parte - 1) / total) * 100)}%)…`,
            }),
          });
          await api.archivos.create({ key, nombre: f.name, mime: mimeDe(f.name), tamano: f.size, contexto: CONTEXTO, url: ruta });
          continue;
        }
        const buf = await f.arrayBuffer();
        const sha256 = await sha256Hex(buf);
        // Plan A: tal cual. Plan B (patrón releases/Documentación): el gateway
        // nació para imágenes — si rechaza la extensión (.svg/.mp4/.zip), se
        // reintenta el MISMO contenido camuflado como .pdf; el nombre real
        // queda en la referencia y la descarga restituye la extensión.
        let key;
        try {
          key = await saveImage(f);
        } catch (e1) {
          if (esImagen(f.name)) throw e1; // una imagen rechazada es otro problema
          const camuflado = new File([buf], f.name + '.pdf', { type: 'application/pdf' });
          key = await saveImage(camuflado);
        }
        // Verificación de ida y vuelta: huella igual o no se publica.
        setSubida({ txt: `Verificando "${f.name}"…` });
        const objUrl = await getImage(key);
        const vuelta = await (await fetch(objUrl)).arrayBuffer();
        URL.revokeObjectURL(objUrl);
        if (await sha256Hex(vuelta) !== sha256) {
          throw new Error('El almacenamiento devolvió el archivo alterado (huella distinta). No se publicó — avisar a Juan (gateway storageov).');
        }
        await api.archivos.create({ key, nombre: f.name, mime: mimeDe(f.name), tamano: f.size, contexto: CONTEXTO, url: ruta });
      } catch (e) {
        const msg = /413|entity too large|Failed to fetch/i.test(e.message || '')
          ? `${e.message} — el borde (Cloudflare) rechaza cualquier request de más de 100 MB. Los archivos de más de 90 MB tendrían que ir en trozos: si esto pasó con uno grande, es un bug, avisá a Juan.`
          : (e.message || `No se pudo subir "${f.name}"`);
        setSubida({ err: msg });
        cargar();
        return;
      }
    }
    setSubida({ txt: `✓ ${lista.length === 1 ? `"${lista[0].name}" publicado` : `${lista.length} archivos publicados`}.`, ok: true });
    cargar();
  };

  const abrirPicker = (ruta) => {
    rutaInputRef.current = ruta;
    if (inputRef.current) { inputRef.current.value = ''; inputRef.current.click(); }
  };

  // ---------- Descarga (objectURL + <a download>, patrón Documentación) ----------
  const [descarga, setDescarga] = useState(null); // { id, estado }
  const descargar = async (a) => {
    // Pesados: la URL directa se abre en una pestaña y la baja el navegador
    // (progreso propio, sin cargar 200 MB en memoria). El atributo `download`
    // no sirve acá: es cross-origin y el navegador lo ignora.
    if (esGrande(a.key)) {
      window.open(urlDirecta(a.key), '_blank', 'noopener');
      return;
    }
    if (descarga?.estado === 'bajando') return;
    setDescarga({ id: a.id, estado: 'bajando' });
    try {
      const objUrl = await getImage(a.key);
      const el = document.createElement('a');
      el.href = objUrl;
      el.download = /\.[a-z0-9]{2,4}$/i.test(a.nombre) ? a.nombre : `${a.nombre}.${extDe(a.key) || 'bin'}`;
      document.body.appendChild(el); el.click(); el.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
      setDescarga({ id: a.id, estado: 'ok' });
      setTimeout(() => setDescarga((d) => (d?.id === a.id && d.estado === 'ok' ? null : d)), 4000);
    } catch (e) { setDescarga(null); setError(e.message || 'No se pudo descargar'); }
  };

  // ---------- Vista ampliada de imágenes (modal propio, sin visor externo) ----------
  const [ampliada, setAmpliada] = useState(null); // { nombre, src, directa? }
  const ampliar = async (a) => {
    if (esGrande(a.key)) { setAmpliada({ nombre: a.nombre, src: urlDirecta(a.key), directa: true }); return; }
    try {
      const src = await getImage(a.key);
      setAmpliada({ nombre: a.nombre, src });
    } catch (e) { setError(e.message || 'No se pudo abrir la imagen'); }
  };
  const cerrarAmpliada = () => {
    if (ampliada?.src && !ampliada.directa) URL.revokeObjectURL(ampliada.src); // la directa no es objectURL
    setAmpliada(null);
  };

  // ---------- Reproductor de video (modal propio, fix de Juan 21/08) ----------
  // Los pesados se ven en STREAMING: el <video> pide rangos sobre la URL directa,
  // arranca al instante y se puede adelantar. Los chicos (≤ 90 MB) siguen saliendo
  // por el gateway con credenciales, así que hay que bajarlos a un objectURL.
  const [video, setVideo] = useState(null); // { nombre, src, directa? }
  const reproducir = async (a) => {
    if (esGrande(a.key)) { setVideo({ nombre: a.nombre, src: urlDirecta(a.key), directa: true }); return; }
    try {
      setVideo({ nombre: a.nombre, src: null });
      const src = await getImage(a.key);
      setVideo({ nombre: a.nombre, src });
    } catch (e) { setVideo(null); setError(e.message || 'No se pudo abrir el video'); }
  };
  const cerrarVideo = () => {
    if (video?.src && !video.directa) URL.revokeObjectURL(video.src);
    setVideo(null);
  };

  // ---------- Borrado (manager/gerencial) con confirmación PROPIA (jamás confirm()) ----------
  const [borrando, setBorrando] = useState(null); // id pidiendo confirmación
  const borrar = async (a) => {
    try { await api.archivos.remove(a.id); setBorrando(null); cargar(); }
    catch (e) { setBorrando(null); setError(e.message || 'No se pudo eliminar'); }
  };

  // Destinos posibles para "mover" un archivo dentro de su zona (raíz + subcarpetas).
  const zonaDeRuta = (ruta) => {
    const partes = String(ruta).split('/');
    return partes[0] === 'plan' ? partes.slice(0, 3).join('/') : partes.slice(0, 2).join('/');
  };
  const opcionesMover = (a) => {
    const zona = zonaDeRuta(rutaDe(a));
    return [zona, ...subsDe(zona).map((s) => `${zona}/${s}`)].filter((r) => r !== rutaDe(a));
  };
  const [moviendo, setMoviendo] = useState(null); // id con el selector de mover abierto

  const controlesArchivo = (a) => (
    <>
      <button onClick={() => descargar(a)} disabled={descarga?.estado === 'bajando'}
        title="Descargar" className="px-2 py-1 text-xs rounded-lg border border-slate-300 bg-white text-slate-600 hover:border-coop-azul hover:text-coop-azul disabled:opacity-40">
        {descarga?.id === a.id ? (descarga.estado === 'bajando' ? '…' : '✓') : '⬇'}
      </button>
      {puedeCurar && (moviendo === a.id ? (
        <select autoFocus className="text-xs border border-slate-300 rounded-lg px-1 py-1 max-w-[150px]"
          onBlur={() => setMoviendo(null)}
          onChange={(e) => { if (e.target.value) { moverArchivo(a, e.target.value); setMoviendo(null); } }}>
          <option value="">Mover a…</option>
          {opcionesMover(a).map((r) => <option key={r} value={r}>{r.split('/').slice(2).join('/') || '(raíz de la zona)'}</option>)}
        </select>
      ) : (
        <button onClick={() => setMoviendo(a.id)} title="Mover a otra subcarpeta"
          className="px-2 py-1 text-xs rounded-lg border border-slate-200 text-slate-400 hover:border-coop-azul hover:text-coop-azul opacity-0 group-hover:opacity-100">📂</button>
      ))}
      {puedeCurar && (borrando === a.id ? (
        <span className="flex items-center gap-1 text-xs">
          <button onClick={() => borrar(a)} className="px-2 py-1 rounded-lg bg-red-600 text-white">Eliminar</button>
          <button onClick={() => setBorrando(null)} className="px-2 py-1 rounded-lg border border-slate-300 text-slate-500">No</button>
        </span>
      ) : (
        <button onClick={() => setBorrando(a.id)} title="Eliminar de la biblioteca"
          className="px-2 py-1 text-xs rounded-lg border border-slate-200 text-slate-400 hover:border-red-400 hover:text-red-500 opacity-0 group-hover:opacity-100">🗑</button>
      ))}
    </>
  );

  // ---------- Fila de archivo (lista compacta) ----------
  const Fila = ({ a, conRuta = false }) => (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50 group">
      {esImagen(a.nombre) ? (
        <button onClick={() => ampliar(a)} title="Ver la imagen" className="shrink-0"><Miniatura archivo={a} /></button>
      ) : esVideo(a.nombre) ? (
        <button onClick={() => reproducir(a)} title="Reproducir el video"
          className="shrink-0 w-9 h-9 flex items-center justify-center rounded bg-slate-100 text-slate-500 hover:bg-coop-azul/10 hover:text-coop-azul">▶</button>
      ) : (
        <span className="text-lg w-9 h-9 flex items-center justify-center shrink-0">{iconoDe(a.nombre)}</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-700 truncate" title={a.nombre}>{a.nombre}</p>
        <p className="text-[11px] text-slate-400">
          {fmtTam(a.tamano)} · {fmtFecha(a.createdAt)}{conRuta ? ` · ${rutaDe(a)}` : ''}
        </p>
      </div>
      {usados.has(a.id) && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 shrink-0" title="Vinculado a una publicación del calendario">✓ usado</span>
      )}
      {controlesArchivo(a)}
    </div>
  );

  // ---------- Fila de subcarpeta (dentro de una zona) ----------
  const FilaSub = ({ rutaZona, sub, migas }) => {
    const ruta = `${rutaZona}/${sub}`;
    const n = enRuta(ruta).length;
    const activa = arrastrando === ruta;
    const [editNombre, setEditNombre] = useState(null); // null | string
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setArrastrando(ruta); }}
        onDragLeave={(e) => { e.preventDefault(); setArrastrando((r) => (r === ruta ? null : r)); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setArrastrando(null); subirArchivos(e.dataTransfer.files, ruta); }}
        className={`flex items-center gap-2 py-1.5 px-2 rounded-lg group cursor-pointer ${activa ? 'bg-blue-50 ring-1 ring-coop-azul/40' : 'hover:bg-slate-50'}`}
        onClick={() => editNombre === null && setVista({ ruta, migas: [...migas, sub] })}
      >
        <Folder size={18} className="text-coop-naranja shrink-0" />
        {editNombre === null ? (
          <span className="text-sm text-slate-700 flex-1 truncate">{sub} <span className="text-[11px] text-slate-400">({n})</span></span>
        ) : (
          <span className="flex-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <input autoFocus value={editNombre} onChange={(e) => setEditNombre(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { renombrarSub(rutaZona, sub, editNombre); setEditNombre(null); } if (e.key === 'Escape') setEditNombre(null); }}
              className="flex-1 border border-slate-300 rounded px-1.5 py-0.5 text-sm" />
            <button onClick={() => { renombrarSub(rutaZona, sub, editNombre); setEditNombre(null); }} className="text-xs text-coop-azul">OK</button>
          </span>
        )}
        {puedeCurar && editNombre === null && (
          <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setEditNombre(sub)} title="Renombrar" className="text-slate-300 hover:text-coop-azul"><Pencil size={13} /></button>
            {n === 0 && <button onClick={() => borrarSub(rutaZona, sub)} title="Eliminar subcarpeta vacía" className="text-slate-300 hover:text-red-500 text-xs">🗑</button>}
          </span>
        )}
        <span className="text-slate-300 text-xs">›</span>
      </div>
    );
  };

  // ---------- Alta de subcarpeta (＋ carpeta / ＋ día) ----------
  const NuevaSub = ({ rutaZona, conDia }) => {
    const [modo, setModo] = useState(null); // null | 'nombre' | 'dia'
    const [valor, setValor] = useState('');
    const confirmar = async () => {
      let nombre = valor;
      if (modo === 'dia' && valor) { const [, m, d] = valor.split('-'); nombre = `${d}.${m}`; }
      if (await crearSub(rutaZona, nombre)) { setModo(null); setValor(''); }
    };
    if (modo) return (
      <span className="flex items-center gap-1">
        {modo === 'dia'
          ? <input type="date" autoFocus value={valor} onChange={(e) => setValor(e.target.value)} className="border border-slate-300 rounded-lg px-1.5 py-0.5 text-xs" />
          : <input autoFocus value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Nombre…"
              onKeyDown={(e) => { if (e.key === 'Enter') confirmar(); if (e.key === 'Escape') setModo(null); }}
              className="border border-slate-300 rounded-lg px-1.5 py-0.5 text-xs w-28" />}
        <button onClick={confirmar} disabled={!valor} className="text-xs text-coop-azul disabled:opacity-40">OK</button>
        <button onClick={() => { setModo(null); setValor(''); }} className="text-xs text-slate-400">✕</button>
      </span>
    );
    return (
      <span className="flex items-center gap-1">
        <button onClick={() => setModo('nombre')} title="Nueva subcarpeta"
          className="px-1.5 py-0.5 text-xs rounded-lg border border-slate-200 text-slate-400 hover:border-coop-azul hover:text-coop-azul flex items-center gap-1"><FolderPlus size={12} /></button>
        {conDia && (
          <button onClick={() => setModo('dia')} title="Subcarpeta del día (DD.MM, como Booster)"
            className="px-1.5 py-0.5 text-xs rounded-lg border border-slate-200 text-slate-400 hover:border-coop-azul hover:text-coop-azul flex items-center gap-1"><CalendarPlus size={12} /> día</button>
        )}
      </span>
    );
  };

  // ---------- Zona (categoría/carpeta) con drag & drop + subcarpetas ----------
  const Zona = ({ cat, ruta, migas, conDia }) => {
    const raiz = enRuta(ruta);
    const total = enZona(ruta).length;
    const subs = subsDe(ruta);
    const activa = arrastrando === ruta;
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setArrastrando((r) => (r && r.startsWith(ruta + '/') ? r : ruta)); }}
        onDragLeave={(e) => { e.preventDefault(); setArrastrando((r) => (r === ruta ? null : r)); }}
        onDrop={(e) => { e.preventDefault(); if (arrastrando === ruta) { setArrastrando(null); subirArchivos(e.dataTransfer.files, ruta); } }}
        className={`bg-white rounded-xl border ${activa ? 'border-coop-azul ring-2 ring-coop-azul/30' : 'border-slate-200'} p-3 flex flex-col min-h-[180px]`}
      >
        <div className="flex items-center justify-between mb-1 gap-1 flex-wrap">
          {/* Ola 3 (pedido de Leonardo): tocar la zona también abre la galería. */}
          <button onClick={() => setVista({ ruta, migas })} title={`Abrir ${cat.label} en vista galería`}
            className="text-sm font-semibold text-coop-negro flex items-center gap-1.5 hover:text-coop-azul">
            <span>{cat.emoji}</span> {cat.label}
            <span className="text-[11px] font-normal text-slate-400">({total})</span>
          </button>
          <div className="flex items-center gap-1">
            <NuevaSub rutaZona={ruta} conDia={conDia} />
            <button onClick={() => abrirPicker(ruta)}
              className="px-2 py-0.5 text-xs rounded-lg border border-slate-300 text-slate-500 hover:border-coop-azul hover:text-coop-azul">
              ＋ subir
            </button>
          </div>
        </div>
        {subs.length > 0 && (
          <div className="mb-1">{subs.map((s) => <FilaSub key={s} rutaZona={ruta} sub={s} migas={migas} />)}</div>
        )}
        {raiz.length === 0 && subs.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs text-slate-300 border border-dashed border-slate-200 rounded-lg py-6">
            Arrastrá archivos acá
          </div>
        ) : (
          <div className="divide-y divide-slate-100">{raiz.map((a) => <Fila key={a.id} a={a} />)}</div>
        )}
      </div>
    );
  };

  // ---------- Vista galería (ola 2; ola 3: genérica y anidable) ----------
  // Muestra las SUBCARPETAS de la ruta como tarjetas (se puede seguir entrando —
  // los eventos tienen carpetas adentro) + los archivos como tiles grandes.
  // «Volver» sube UN nivel; desde la raíz de la zona, vuelve a la vista de zonas.
  const profundidadBase = (ruta) => (String(ruta).split('/')[0] === 'plan' ? 3 : 2);
  const volverUnNivel = () => {
    const partes = vista.ruta.split('/');
    if (partes.length <= profundidadBase(vista.ruta)) { setVista(null); return; } // raíz de zona → vista de zonas
    setVista({ ruta: partes.slice(0, -1).join('/'), migas: vista.migas.slice(0, -1) });
  };
  const Galeria = () => {
    const items = enRuta(vista.ruta);
    const subsAca = subsDe(vista.ruta);
    const activa = arrastrando === vista.ruta;
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setArrastrando(vista.ruta); }}
        onDragLeave={(e) => { e.preventDefault(); setArrastrando((r) => (r === vista.ruta ? null : r)); }}
        onDrop={(e) => { e.preventDefault(); setArrastrando(null); subirArchivos(e.dataTransfer.files, vista.ruta); }}
        className={`bg-white rounded-xl border ${activa ? 'border-coop-azul ring-2 ring-coop-azul/30' : 'border-slate-200'} p-4 min-h-[300px]`}
      >
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <button onClick={volverUnNivel}
            className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-600 hover:border-coop-azul hover:text-coop-azul flex items-center gap-1 text-sm">
            <ArrowLeft size={14} /> Volver
          </button>
          <p className="text-sm text-slate-500">
            {vista.migas.map((m, i) => (
              <span key={i}>{i > 0 && <span className="text-slate-300"> › </span>}<span className={i === vista.migas.length - 1 ? 'font-semibold text-coop-negro' : ''}>{m}</span></span>
            ))}
            <span className="text-slate-400 text-xs"> · {items.length} archivo{items.length === 1 ? '' : 's'}</span>
          </p>
          <div className="flex-1" />
          <NuevaSub rutaZona={vista.ruta} conDia={false} />
          <button onClick={() => abrirPicker(vista.ruta)}
            className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 text-slate-500 hover:border-coop-azul hover:text-coop-azul">＋ subir</button>
        </div>
        {subsAca.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3 mb-3">
            {subsAca.map((s) => (
              <button key={s} onClick={() => setVista({ ruta: `${vista.ruta}/${s}`, migas: [...vista.migas, s] })}
                className="border border-slate-200 rounded-lg p-3 flex flex-col items-center gap-1 hover:border-coop-azul/60 hover:bg-blue-50/30">
                <Folder size={28} className="text-coop-naranja" />
                <span className="text-xs text-slate-700 truncate w-full text-center" title={s}>{s}</span>
                <span className="text-[10.5px] text-slate-400">{enZona(`${vista.ruta}/${s}`).length} archivo{enZona(`${vista.ruta}/${s}`).length === 1 ? '' : 's'}</span>
              </button>
            ))}
          </div>
        )}
        {items.length === 0 && subsAca.length === 0 ? (
          <div className="flex items-center justify-center text-sm text-slate-300 border border-dashed border-slate-200 rounded-lg py-16">
            Arrastrá archivos acá
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
            {items.map((a) => (
              <div key={a.id} className="border border-slate-200 rounded-lg overflow-hidden group hover:border-coop-azul/50 flex flex-col">
                {esImagen(a.nombre) ? (
                  <button onClick={() => ampliar(a)} title="Ver la imagen"><Miniatura archivo={a} grande /></button>
                ) : esVideo(a.nombre) ? (
                  <button onClick={() => reproducir(a)} title="Reproducir el video"
                    className="w-full h-36 bg-slate-900/90 flex items-center justify-center text-4xl text-white/80 hover:text-white">▶</button>
                ) : (
                  <div className="w-full h-36 bg-slate-50 flex items-center justify-center text-4xl">{iconoDe(a.nombre)}</div>
                )}
                <div className="p-2 flex-1 flex flex-col">
                  <p className="text-xs text-slate-700 truncate" title={a.nombre}>{a.nombre}</p>
                  <p className="text-[10.5px] text-slate-400 mb-1">
                    {fmtTam(a.tamano)} · {fmtFecha(a.createdAt)}
                    {usados.has(a.id) && <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-emerald-50 text-emerald-600" title="Vinculado a una publicación del calendario">✓ usado</span>}
                  </p>
                  <div className="flex items-center gap-1 mt-auto">{controlesArchivo(a)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ---------- Bandeja de IDEAS (26/08): la etapa previa del documento de Booster ----------
  // Ideas = publicaciones SIN día (dia null). Se cargan acá con los mismos campos,
  // Booster propone y el tilde ✓ las aprueba; «📅 Programar» les asigna día (puede
  // ser de otro mes) y pasan al calendario siendo EL MISMO registro.
  const ideas = posts.filter((p) => p.dia == null);
  const [ideaForm, setIdeaForm] = useState(null);   // null | { id?, canal, formato, titulo, nota }
  const [programando, setProgramando] = useState(null); // id de la idea con el picker de fecha abierto
  const [borrandoIdea, setBorrandoIdea] = useState(null);
  const guardarIdea = async () => {
    if (!ideaForm.titulo.trim()) return;
    try {
      if (ideaForm.id) await api.marketingPosts.update(ideaForm.id, { canal: ideaForm.canal, formato: ideaForm.formato, titulo: ideaForm.titulo, nota: ideaForm.nota });
      else await api.marketingPosts.create({ mes, dia: null, ...ideaForm });
      setIdeaForm(null);
      cargarPosts(mes);
    } catch (e) { setError(e.message || 'No se pudo guardar la idea'); }
  };
  const toggleAprobada = async (p) => {
    try { await api.marketingPosts.update(p.id, { aprobada: !p.aprobada }); cargarPosts(mes); }
    catch (e) { setError(e.message || 'No se pudo cambiar la aprobación'); }
  };
  const programarIdea = async (p, fecha) => {
    if (!fecha) return;
    const [y, m, d] = fecha.split('-');
    try {
      await api.marketingPosts.update(p.id, { mes: `${y}-${m}`, dia: Number(d) });
      setProgramando(null);
      if (`${y}-${m}` !== mes) setMes(`${y}-${m}`); // programada en otro mes: seguirla
      else cargarPosts(mes);
    } catch (e) { setError(e.message || 'No se pudo programar'); }
  };
  const borrarIdea = async (p) => {
    try { await api.marketingPosts.remove(p.id); setBorrandoIdea(null); cargarPosts(mes); }
    catch (e) { setError(e.message || 'No se pudo eliminar'); }
  };

  // ---------- Campañas publicitarias (26/08) ----------
  // Nace PROPUESTA sin fechas; al aprobar se define el período y aparece la
  // LÍNEA delgada atravesando los días del calendario (repite contenido todos
  // los días del rango, a diferencia de una publicación puntual).
  const CAMP_COLORES = ['bg-rose-400', 'bg-teal-500', 'bg-indigo-400', 'bg-orange-400', 'bg-cyan-500', 'bg-fuchsia-400'];
  const colorCamp = (c) => CAMP_COLORES[c.id % CAMP_COLORES.length];
  const isoDia = (v) => (v ? String(v).slice(0, 10) : null);
  const fmtRango = (c) => (c.desde ? `${isoDia(c.desde).slice(8, 10)}/${isoDia(c.desde).slice(5, 7)} → ${isoDia(c.hasta).slice(8, 10)}/${isoDia(c.hasta).slice(5, 7)}` : 'sin período');
  // Campañas del mes visible: las que intersectan el mes + las propuestas sin fechas.
  const primerDiaMes = `${mes}-01`;
  const ultimoDiaMes = (() => { const [y, m] = mes.split('-').map(Number); return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; })();
  const campaniasDelMes = campanias.filter((c) => !c.desde || (isoDia(c.desde) <= ultimoDiaMes && isoDia(c.hasta) >= primerDiaMes));
  const campaniasEnDia = (d) => {
    const fecha = `${mes}-${String(d).padStart(2, '0')}`;
    return campanias.filter((c) => c.desde && isoDia(c.desde) <= fecha && isoDia(c.hasta) >= fecha);
  };
  const [campForm, setCampForm] = useState(null); // null | { id?, nombre, producto, presupuesto, desarrollo, desde, hasta }
  const [borrandoCamp, setBorrandoCamp] = useState(null);
  const abrirCampania = (c) => setCampForm({
    id: c.id, nombre: c.nombre, producto: c.producto || '', presupuesto: c.presupuesto || '',
    desarrollo: c.desarrollo || '', desde: isoDia(c.desde) || '', hasta: isoDia(c.hasta) || '',
  });
  const guardarCampania = async () => {
    if (!campForm.nombre.trim()) return;
    const body = {
      nombre: campForm.nombre, producto: campForm.producto, presupuesto: campForm.presupuesto,
      desarrollo: campForm.desarrollo, desde: campForm.desde || null, hasta: campForm.hasta || null,
    };
    if ((body.desde && !body.hasta) || (!body.desde && body.hasta)) { setError('El período necesita desde y hasta (o dejá los dos vacíos).'); return; }
    try {
      if (campForm.id) await api.marketingCampanias.update(campForm.id, body);
      else await api.marketingCampanias.create(body);
      setCampForm(null); setError('');
      cargarPosts(mes);
    } catch (e) { setError(e.message || 'No se pudo guardar la campaña'); }
  };
  // Aprobar define los días (dato de Leonardo): si no tiene período, se abre la
  // campaña para cargarlo en el mismo gesto.
  const toggleAprobadaCamp = async (c) => {
    try {
      await api.marketingCampanias.update(c.id, { aprobada: !c.aprobada });
      if (!c.aprobada && !c.desde) abrirCampania({ ...c, aprobada: true });
      cargarPosts(mes);
    } catch (e) { setError(e.message || 'No se pudo cambiar la aprobación'); }
  };
  const borrarCampania = async (c) => {
    try { await api.marketingCampanias.remove(c.id); setBorrandoCamp(null); cargarPosts(mes); }
    catch (e) { setError(e.message || 'No se pudo eliminar la campaña'); }
  };

  // Export de la planificación del mes (26/08, decisión de Leonardo: incluirlo ya):
  // documento Word con el formato del documento real de Booster (ítems por canal
  // con título, formato, día, aprobación y copy). HTML compatible con Word — se
  // abre y edita en Word/LibreOffice sin dependencias nuevas.
  const exportarPlanificacion = () => {
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const orden = ['linkedin', 'mailing', 'feed', 'historia'];
    const rotulo = { linkedin: 'LINKEDIN', mailing: 'MAILING', feed: 'POSTEOS / FEED', historia: 'HISTORIAS' };
    const [, mm] = mes.split('-');
    let cuerpo = '';
    for (const c of orden) {
      const del = posts.filter((p) => p.canal === c);
      if (!del.length) continue;
      cuerpo += `<h2 style="color:#0E5174">${rotulo[c]}</h2>`;
      del.forEach((p, i) => {
        const cuando = p.dia ? `${String(p.dia).padStart(2, '0')}/${mm}` : 'Sin fecha (idea)';
        cuerpo += `<h3>${rotulo[c].split(' ')[0]} ${i + 1}: ${esc(p.titulo)}</h3>` +
          `<p style="color:#666;font-size:10pt">${esc(p.formato || '—')} · ${cuando} · ${p.aprobada ? '✔ Aprobada' : 'Pendiente de aprobación'}</p>` +
          (p.nota ? `<p>${esc(p.nota).replace(/\n/g, '<br>')}</p>` : '');
      });
    }
    // Campañas del mes (26/08): con su período, presupuesto y desarrollo.
    if (campaniasDelMes.length) {
      cuerpo += '<h2 style="color:#0E5174">CAMPAÑAS PUBLICITARIAS</h2>';
      for (const c of campaniasDelMes) {
        cuerpo += `<h3>${esc(c.nombre)}${c.producto ? ` — ${esc(c.producto)}` : ''}</h3>` +
          `<p style="color:#666;font-size:10pt">${fmtRango(c)} · ${c.aprobada ? '✔ Aprobada' : 'Propuesta'}${c.presupuesto ? ` · ${esc(c.presupuesto)}` : ''}</p>` +
          (c.desarrollo ? `<p>${esc(c.desarrollo).replace(/\n/g, '<br>')}</p>` : '');
      }
    }
    const html = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Planificación</title></head>` +
      `<body style="font-family:Calibri,sans-serif"><h1 style="color:#0E5174">PLANIFICACIÓN ${mesLabel(mes).toUpperCase()} — COOPTECH</h1>${cuerpo || '<p>Sin publicaciones ni ideas este mes.</p>'}</body></html>`;
    const blob = new Blob(['﻿', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PLANIFICACION_${mesLabel(mes).replace(' ', '_').toUpperCase()}_COOPTECH.doc`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  // ---------- Calendario del mes (ola 3): el excel de Booster como calendario ----------
  // Espacio de trabajo compartido: canal + formato + título + nota por día. Si el
  // día tiene su subcarpeta DD.MM en la zona del canal, el ítem enlaza a las piezas.
  const subDelDia = (canal, dia) => {
    const [, mm] = mes.split('-');
    const nombre = `${String(dia).padStart(2, '0')}.${mm}`;
    return subsDe(`plan/${mes}/${canal}`).find((s) => s.toLowerCase() === nombre.toLowerCase()) || null;
  };
  const irAPiezas = (canal, dia) => {
    const sub = subDelDia(canal, dia);
    if (!sub) return;
    setDiaSel(null);
    setVista({ ruta: `plan/${mes}/${canal}/${sub}`, migas: [mesLabel(mes), CANAL_DE(canal).label, sub] });
  };

  const Calendario = () => {
    const [y, m] = mes.split('-').map(Number);
    const primero = new Date(y, m - 1, 1);
    const nDias = new Date(y, m, 0).getDate();
    const offset = primero.getDay(); // domingo-primero, como la grilla
    const celdas = [...Array(offset).fill(null), ...Array.from({ length: nDias }, (_, i) => i + 1)];
    while (celdas.length % 7) celdas.push(null);
    const hoyD = new Date();
    const esHoy = (d) => d && hoyD.getFullYear() === y && hoyD.getMonth() === m - 1 && hoyD.getDate() === d;
    const delDia = (d) => posts.filter((p) => p.dia === d);
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-3 mb-4">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DIAS_SEMANA.map((d) => <div key={d} className="text-center text-[11px] font-medium text-slate-400 uppercase">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {celdas.map((d, i) => (
            <div key={i}
              onClick={() => d && setDiaSel(d)}
              className={`min-h-[74px] rounded-lg border p-1 flex flex-col ${d ? 'cursor-pointer hover:border-coop-azul/60 bg-white' : 'bg-slate-50/50 border-transparent'} ${esHoy(d) ? 'border-coop-naranja ring-1 ring-coop-naranja/40' : d ? 'border-slate-100' : ''}`}>
              {d && (
                <>
                  <p className={`text-[11px] leading-none mb-1 ${esHoy(d) ? 'text-coop-naranja font-bold' : 'text-slate-400'}`}>{d}</p>
                  <div className="space-y-0.5 flex-1">
                    {delDia(d).slice(0, 3).map((p) => (
                      <p key={p.id}
                        className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate ${CANAL_DE(p.canal).chip} ${p.aprobada ? '' : 'opacity-60 border border-dashed border-slate-400'}`}
                        title={`${CANAL_DE(p.canal).label}${p.formato ? ` · ${p.formato}` : ''} — ${p.titulo}${p.aprobada ? '' : ' (pendiente de aprobación)'}`}>
                        {p.titulo}
                      </p>
                    ))}
                    {delDia(d).length > 3 && <p className="text-[10px] text-slate-400 px-1">+{delDia(d).length - 3} más</p>}
                  </div>
                  {/* Campañas activas este día (26/08): línea delgada por campaña,
                      atravesando todos los días del período. Click abre la campaña. */}
                  {campaniasEnDia(d).length > 0 && (
                    <div className="space-y-0.5 mt-0.5">
                      {campaniasEnDia(d).slice(0, 3).map((c) => (
                        <div key={c.id}
                          onClick={(e) => { e.stopPropagation(); abrirCampania(c); }}
                          title={`📣 ${c.nombre}${c.producto ? ` (${c.producto})` : ''} · ${fmtRango(c)} — la campaña corre TODOS los días del período`}
                          className={`h-1.5 rounded-sm cursor-pointer ${colorCamp(c)} ${c.aprobada ? '' : 'opacity-50'} hover:h-2 transition-all`} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Panel del día: ver, agregar, editar y borrar ítems (todo el equipo interno).
  const PanelDia = () => {
    const del = posts.filter((p) => p.dia === diaSel);
    const [editando, setEditando] = useState(null); // null | 'nuevo' | id
    // ACORDEÓN (25/08, «el monitor no es infinito»): con varias publicaciones,
    // cada una colapsada en UNA línea y se expande de a una (nota + vista
    // previa). Con una sola, viene abierta.
    const [abierto, setAbierto] = useState(() => (del.length === 1 ? del[0].id : null));
    const [f, setF] = useState({ canal: 'feed', formato: '', titulo: '', nota: '', archivoIds: [] });
    const [borrandoP, setBorrandoP] = useState(null);
    // Vista previa de las piezas vinculadas (24/08, boceto de Leonardo): la
    // miniatura al lado del contenido; con más de una, flechitas ◀ ▶.
    const archivosPorId = new Map((archivos || []).map((a) => [a.id, a]));
    const [idxPieza, setIdxPieza] = useState({}); // { [postId]: índice del carrusel }
    const piezasDe = (p) => (p.archivoIds || []).map((id) => archivosPorId.get(id)).filter(Boolean);
    const moverPieza = (p, delta, total) => setIdxPieza((m) => ({
      ...m, [p.id]: ((m[p.id] || 0) + delta + total) % total,
    }));
    const abrirNuevo = () => { setF({ canal: 'feed', formato: '', titulo: '', nota: '', archivoIds: [] }); setEditando('nuevo'); };
    const abrirEdicion = (p) => { setF({ canal: p.canal, formato: p.formato || '', titulo: p.titulo, nota: p.nota || '', archivoIds: p.archivoIds || [] }); setEditando(p.id); };
    const guardar = async () => {
      if (!f.titulo.trim()) return;
      try {
        if (editando === 'nuevo') await api.marketingPosts.create({ mes, dia: diaSel, ...f });
        else await api.marketingPosts.update(editando, f);
        setEditando(null);
        cargarPosts(mes);
      } catch (e) { setError(e.message || 'No se pudo guardar el ítem'); }
    };
    // Piezas vinculables (22/08): los archivos del canal elegido en este mes —
    // primero los de la subcarpeta del día (DD.MM), después el resto de la zona.
    const nombreDia = subDelDia(f.canal, diaSel);
    const candidatos = enZona(`plan/${mes}/${f.canal}`).sort((a, b) => {
      const da = nombreDia && rutaDe(a).endsWith(`/${nombreDia}`) ? 0 : 1;
      const db = nombreDia && rutaDe(b).endsWith(`/${nombreDia}`) ? 0 : 1;
      return da - db || String(a.nombre).localeCompare(String(b.nombre));
    });
    const toggleArchivo = (id) => setF((x) => ({
      ...x,
      archivoIds: x.archivoIds.includes(id) ? x.archivoIds.filter((i) => i !== id) : [...x.archivoIds, id],
    }));
    const subEtiqueta = (a) => {
      const partes = rutaDe(a).split('/');
      return partes.length > 3 ? partes.slice(3).join('/') : '';
    };
    const borrarPost = async (p) => {
      try { await api.marketingPosts.remove(p.id); setBorrandoP(null); cargarPosts(mes); }
      catch (e) { setError(e.message || 'No se pudo eliminar'); }
    };
    const [yy, mm2] = mes.split('-');
    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setDiaSel(null)}>
        <div className="bg-white rounded-xl w-full max-w-2xl p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-coop-negro">{String(diaSel).padStart(2, '0')}/{mm2}/{yy} · {del.length} publicación{del.length === 1 ? '' : 'es'}</h3>
            <button onClick={() => setDiaSel(null)} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          {del.length === 0 && editando === null && (
            <p className="text-sm text-slate-300 text-center py-4">Sin publicaciones planificadas este día.</p>
          )}
          <div className="space-y-2 mb-3">
            {del.map((p) => {
              const piezas = piezasDe(p);
              const idx = Math.min(idxPieza[p.id] || 0, Math.max(0, piezas.length - 1));
              const pieza = piezas[idx];
              const expandida = abierto === p.id;
              return (
                <div key={p.id} className="border border-slate-100 rounded-lg group">
                  {/* Cabecera SIEMPRE visible (una línea): click expande/colapsa. */}
                  <div onClick={() => setAbierto(expandida ? null : p.id)}
                    className={`flex items-center gap-2 p-2.5 cursor-pointer ${expandida ? '' : 'hover:bg-slate-50 rounded-lg'}`}>
                    <span className="text-slate-300 text-xs w-3 shrink-0">{expandida ? '⌄' : '›'}</span>
                    <button onClick={(e) => { e.stopPropagation(); toggleAprobada(p); }}
                      title={p.aprobada ? 'Aprobada — click para quitar' : 'Pendiente — click para aprobar'}
                      className={`w-5 h-5 rounded border shrink-0 text-[11px] leading-none ${p.aprobada ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-300 text-transparent hover:border-emerald-400'}`}>✓</button>
                    <span className={`text-[10.5px] px-1.5 py-0.5 rounded shrink-0 ${CANAL_DE(p.canal).chip}`}>{CANAL_DE(p.canal).label}</span>
                    {p.formato && <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">{p.formato}</span>}
                    <span className="text-sm text-slate-800 font-medium flex-1 min-w-0 truncate" title={p.titulo}>{p.titulo}</span>
                    {!expandida && pieza && esImagen(pieza.nombre) && <span className="shrink-0"><Miniatura archivo={pieza} /></span>}
                    {piezas.length > 0 && <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 shrink-0">🖇 {piezas.length}</span>}
                    <span onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 shrink-0">
                      <button onClick={() => abrirEdicion(p)} title="Editar" className="text-slate-300 hover:text-coop-azul opacity-0 group-hover:opacity-100"><Pencil size={13} /></button>
                      {borrandoP === p.id ? (
                        <span className="flex items-center gap-1 text-xs">
                          <button onClick={() => borrarPost(p)} className="px-1.5 py-0.5 rounded bg-red-600 text-white">Sí</button>
                          <button onClick={() => setBorrandoP(null)} className="px-1.5 py-0.5 rounded border border-slate-300 text-slate-500">No</button>
                        </span>
                      ) : (
                        <button onClick={() => setBorrandoP(p.id)} title="Eliminar" className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 text-xs">🗑</button>
                      )}
                    </span>
                  </div>
                  {/* Cuerpo expandido: nota completa + vista previa con carrusel. */}
                  {expandida && (
                    <div className="flex gap-3 px-2.5 pb-2.5">
                      <div className="min-w-0 flex-1">
                        {p.nota
                          ? <p className="text-xs text-slate-500 whitespace-pre-wrap border-t border-slate-50 pt-1.5">{p.nota}</p>
                          : <p className="text-xs text-slate-300 border-t border-slate-50 pt-1.5">Sin nota.</p>}
                        {subDelDia(p.canal, diaSel) && (
                          <button onClick={() => irAPiezas(p.canal, diaSel)} title="Ver las piezas de este día"
                            className="mt-1.5 text-[10.5px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100">📎 piezas del día</button>
                        )}
                      </div>
                      {pieza && (
                        <div className="w-36 shrink-0 flex flex-col items-center gap-1">
                          {esImagen(pieza.nombre) ? (
                            <button onClick={() => ampliar(pieza)} title={pieza.nombre} className="w-full">
                              <Miniatura archivo={pieza} grande />
                            </button>
                          ) : esVideo(pieza.nombre) ? (
                            <button onClick={() => reproducir(pieza)} title={`Reproducir ${pieza.nombre}`}
                              className="w-full h-36 rounded-lg bg-slate-900/90 flex items-center justify-center text-3xl text-white/80 hover:text-white">▶</button>
                          ) : (
                            <button onClick={() => descargar(pieza)} title={`Descargar ${pieza.nombre}`}
                              className="w-full h-36 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-3xl">{iconoDe(pieza.nombre)}</button>
                          )}
                          {piezas.length > 1 ? (
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <button onClick={() => moverPieza(p, -1, piezas.length)} className="px-1.5 rounded border border-slate-200 hover:border-coop-azul hover:text-coop-azul">◀</button>
                              <span>{idx + 1}/{piezas.length}</span>
                              <button onClick={() => moverPieza(p, 1, piezas.length)} className="px-1.5 rounded border border-slate-200 hover:border-coop-azul hover:text-coop-azul">▶</button>
                            </div>
                          ) : (
                            <p className="text-[10px] text-slate-400 truncate w-full text-center" title={pieza.nombre}>{pieza.nombre}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {editando !== null ? (
            <div className="border border-coop-azul/40 rounded-lg p-3 space-y-2 bg-blue-50/30">
              <div className="flex gap-2">
                <select value={f.canal} onChange={(e) => setF((x) => ({ ...x, canal: e.target.value }))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                  {CANALES_CAL.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <input list="mkt-formatos" value={f.formato} onChange={(e) => setF((x) => ({ ...x, formato: e.target.value }))}
                  placeholder="Formato (Reel, Placa…)" className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                <datalist id="mkt-formatos">{FORMATOS_SUG.map((x) => <option key={x} value={x} />)}</datalist>
              </div>
              <input value={f.titulo} onChange={(e) => setF((x) => ({ ...x, titulo: e.target.value }))}
                placeholder="Título / contenido" className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-medium" />
              <textarea value={f.nota} onChange={(e) => setF((x) => ({ ...x, nota: e.target.value }))} rows={3}
                placeholder="Nota: copy, pie de foto, comentario…" className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
              {/* Piezas del contenido (22/08): tildá los archivos que usa esta publicación. */}
              <div>
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
                  Piezas de {CANAL_DE(f.canal).label} · {mesLabel(mes)} {f.archivoIds.length > 0 && <span className="normal-case text-emerald-600">({f.archivoIds.length} vinculada{f.archivoIds.length === 1 ? '' : 's'})</span>}
                </p>
                {candidatos.length === 0 ? (
                  <p className="text-xs text-slate-300 border border-dashed border-slate-200 rounded-lg px-2 py-2">Todavía no hay archivos subidos en {CANAL_DE(f.canal).label} este mes — subilos en «Contenido del mes» y vinculalos después.</p>
                ) : (
                  <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-slate-50">
                    {candidatos.map((a) => (
                      <label key={a.id} className="flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer hover:bg-slate-50">
                        <input type="checkbox" checked={f.archivoIds.includes(a.id)} onChange={() => toggleArchivo(a.id)} />
                        <span>{iconoDe(a.nombre)}</span>
                        <span className="text-slate-700 truncate flex-1" title={a.nombre}>{a.nombre}</span>
                        {subEtiqueta(a) && <span className="text-[10px] text-slate-400 shrink-0">📁 {subEtiqueta(a)}</span>}
                        {usados.has(a.id) && <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-50 text-emerald-600 shrink-0">usado</span>}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditando(null)} className="px-3 py-1 text-xs rounded-lg border border-slate-300 text-slate-500">Cancelar</button>
                <button onClick={guardar} disabled={!f.titulo.trim()} className="px-3 py-1 text-xs rounded-lg bg-coop-azul text-white disabled:opacity-40">Guardar</button>
              </div>
            </div>
          ) : (
            <button onClick={abrirNuevo} className="w-full py-2 text-sm rounded-lg border border-dashed border-slate-300 text-slate-500 hover:border-coop-azul hover:text-coop-azul">
              ＋ Agregar publicación
            </button>
          )}
        </div>
      </div>
    );
  };

  const cargando = archivos === null;
  const migasBase = solapa === 'plan' ? [mesLabel(mes)] : solapa === 'eventos' ? [`Eventos ${anio}`] : ['Marca'];

  return (
    <div className="p-4">
      {/* input global del picker: la ruta destino viaja en rutaInputRef */}
      <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden"
        onChange={(e) => { if (rutaInputRef.current) subirArchivos(e.target.files, rutaInputRef.current); }} />

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <h2 className="text-xl font-semibold text-coop-negro flex items-center gap-2">
          <Megaphone size={20} className="text-coop-naranja" /> Marketing
        </h2>
        <div className="flex gap-1.5">
          {[{ id: 'plan', label: 'Planificación' }, { id: 'eventos', label: 'Eventos' }, { id: 'marca', label: 'Marca' }].map((s) => (
            <button key={s.id} onClick={() => { setSolapa(s.id); setVista(null); }}
              className={`px-3.5 py-1.5 rounded-full text-sm ${solapa === s.id ? 'bg-coop-azul text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-coop-azul hover:text-coop-azul'}`}>
              {s.label}
            </button>
          ))}
        </div>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar en todo Marketing…"
          className="ml-auto px-3 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-coop-azul w-56" />
      </div>

      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 flex items-center justify-between gap-2">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}
      {subida && (
        <div className={`mb-3 rounded-lg px-3 py-2 text-sm border ${subida.err ? 'bg-red-50 border-red-200 text-red-700' : subida.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
          {subida.err || subida.txt}
        </div>
      )}

      {cargando ? <p className="text-slate-400 text-sm">Cargando…</p> : resultados ? (
        // Resultados del buscador: cruza meses, categorías, subcarpetas y marca.
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-400 mb-1">{resultados.length} resultado{resultados.length === 1 ? '' : 's'} en todo Marketing</p>
          {resultados.length === 0 ? <p className="text-sm text-slate-300 py-4 text-center">Nada con “{busca.trim()}”.</p>
            : <div className="divide-y divide-slate-100">{resultados.map((a) => <Fila key={a.id} a={a} conRuta />)}</div>}
        </div>
      ) : vista ? (
        <Galeria />
      ) : solapa === 'plan' ? (
        <>
          <div className="flex items-center gap-2 mb-3">
            <button onClick={() => setMes((m) => mesSumar(m, -1))} className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-600 hover:border-coop-azul hover:text-coop-azul">◀</button>
            <span className="text-base font-semibold text-coop-negro min-w-[150px] text-center">{mesLabel(mes)}</span>
            <button onClick={() => setMes((m) => mesSumar(m, 1))} className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-600 hover:border-coop-azul hover:text-coop-azul">▶</button>
            {mes !== mesHoy() && (
              <button onClick={() => setMes(mesHoy())} className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 text-slate-500 hover:border-coop-azul hover:text-coop-azul">Hoy</button>
            )}
            <button onClick={exportarPlanificacion} title="Descargar la planificación del mes como documento Word (ideas incluidas)"
              className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 bg-white text-slate-600 hover:border-coop-azul hover:text-coop-azul">⬇ Word</button>
            <span className="text-xs text-slate-400 ml-2">Tope por archivo: {TOPE_MB} MB — arriba de 90 MB sube en partes (tarda, pero entra).</span>
          </div>

          {/* Bandeja de IDEAS (26/08): la etapa previa — sin fecha. Booster propone,
              el tilde ✓ aprueba, «📅» programa y la idea pasa al calendario. */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 mb-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-coop-negro">💡 Ideas <span className="text-[11px] font-normal text-slate-400">({ideas.length} sin fecha)</span></h3>
              {!ideaForm && (
                <button onClick={() => setIdeaForm({ canal: 'feed', formato: '', titulo: '', nota: '' })}
                  className="px-2 py-0.5 text-xs rounded-lg border border-slate-300 text-slate-500 hover:border-coop-azul hover:text-coop-azul">＋ idea</button>
              )}
            </div>
            {ideas.length === 0 && !ideaForm && (
              <p className="text-xs text-slate-300 border border-dashed border-slate-200 rounded-lg px-2 py-2">
                Acá se cargan las ideas del mes (el documento de planificación de Booster) antes de tener fecha. Al programarlas pasan al calendario.
              </p>
            )}
            <div className="divide-y divide-slate-50">
              {ideas.map((p) => (
                <div key={p.id} className="flex items-center gap-2 py-1.5 group">
                  <button onClick={() => toggleAprobada(p)} title={p.aprobada ? 'Aprobada — click para quitar' : 'Pendiente — click para aprobar'}
                    className={`w-5 h-5 rounded border shrink-0 text-xs leading-none ${p.aprobada ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-300 text-transparent hover:border-emerald-400'}`}>✓</button>
                  <span className={`text-[10.5px] px-1.5 py-0.5 rounded shrink-0 ${CANAL_DE(p.canal).chip}`}>{CANAL_DE(p.canal).label}</span>
                  {p.formato && <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">{p.formato}</span>}
                  <span className="text-sm text-slate-700 flex-1 min-w-0 truncate" title={p.nota ? `${p.titulo}\n\n${p.nota}` : p.titulo}>{p.titulo}</span>
                  {programando === p.id ? (
                    <input type="date" autoFocus onChange={(e) => programarIdea(p, e.target.value)} onBlur={() => setProgramando(null)}
                      className="border border-slate-300 rounded-lg px-1.5 py-0.5 text-xs shrink-0" />
                  ) : (
                    <button onClick={() => setProgramando(p.id)} title="Programar: asignarle día y pasarla al calendario"
                      className="px-2 py-0.5 text-xs rounded-lg border border-slate-300 text-slate-500 hover:border-coop-azul hover:text-coop-azul shrink-0">📅 Programar</button>
                  )}
                  <button onClick={() => setIdeaForm({ id: p.id, canal: p.canal, formato: p.formato || '', titulo: p.titulo, nota: p.nota || '' })}
                    title="Editar" className="text-slate-300 hover:text-coop-azul opacity-0 group-hover:opacity-100 shrink-0"><Pencil size={13} /></button>
                  {borrandoIdea === p.id ? (
                    <span className="flex items-center gap-1 text-xs shrink-0">
                      <button onClick={() => borrarIdea(p)} className="px-1.5 py-0.5 rounded bg-red-600 text-white">Sí</button>
                      <button onClick={() => setBorrandoIdea(null)} className="px-1.5 py-0.5 rounded border border-slate-300 text-slate-500">No</button>
                    </span>
                  ) : (
                    <button onClick={() => setBorrandoIdea(p.id)} title="Eliminar la idea"
                      className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 text-xs shrink-0">🗑</button>
                  )}
                </div>
              ))}
            </div>
            {ideaForm && (
              <div className="border border-coop-azul/40 rounded-lg p-3 mt-2 space-y-2 bg-blue-50/30">
                <div className="flex gap-2">
                  <select value={ideaForm.canal} onChange={(e) => setIdeaForm((x) => ({ ...x, canal: e.target.value }))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                    {CANALES_CAL.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                  <input list="mkt-formatos" value={ideaForm.formato} onChange={(e) => setIdeaForm((x) => ({ ...x, formato: e.target.value }))}
                    placeholder="Formato (Reel, Placa…)" className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                </div>
                <input value={ideaForm.titulo} onChange={(e) => setIdeaForm((x) => ({ ...x, titulo: e.target.value }))}
                  placeholder="Título / concepto de la idea" className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-medium" />
                <textarea value={ideaForm.nota} onChange={(e) => setIdeaForm((x) => ({ ...x, nota: e.target.value }))} rows={4}
                  placeholder="Desarrollo: concepto, visual, texto en imagen, copy…" className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setIdeaForm(null)} className="px-3 py-1 text-xs rounded-lg border border-slate-300 text-slate-500">Cancelar</button>
                  <button onClick={guardarIdea} disabled={!ideaForm.titulo.trim()} className="px-3 py-1 text-xs rounded-lg bg-coop-azul text-white disabled:opacity-40">Guardar idea</button>
                </div>
              </div>
            )}
          </div>

          {/* Campañas publicitarias (26/08): propuesta → aprobada (✓ define el
              período) → línea de color atravesando los días del calendario. */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 mb-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-coop-negro">📣 Campañas <span className="text-[11px] font-normal text-slate-400">({campaniasDelMes.length} este mes)</span></h3>
              {!campForm && (
                <button onClick={() => setCampForm({ nombre: '', producto: '', presupuesto: '', desarrollo: '', desde: '', hasta: '' })}
                  className="px-2 py-0.5 text-xs rounded-lg border border-slate-300 text-slate-500 hover:border-coop-azul hover:text-coop-azul">＋ campaña</button>
              )}
            </div>
            {campaniasDelMes.length === 0 && !campForm && (
              <p className="text-xs text-slate-300 border border-dashed border-slate-200 rounded-lg px-2 py-2">
                Las campañas (Meta Ads) se cargan como propuesta con su estrategia y presupuesto; al aprobarlas se define el período y aparecen como línea de color atravesando los días del calendario.
              </p>
            )}
            <div className="divide-y divide-slate-50">
              {campaniasDelMes.map((c) => (
                <div key={c.id} className="flex items-center gap-2 py-1.5 group">
                  <button onClick={() => toggleAprobadaCamp(c)} title={c.aprobada ? 'Aprobada — click para quitar' : 'Aprobar (te pide el período si no lo tiene)'}
                    className={`w-5 h-5 rounded border shrink-0 text-xs leading-none ${c.aprobada ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-300 text-transparent hover:border-emerald-400'}`}>✓</button>
                  <span className={`w-3 h-3 rounded-sm shrink-0 ${colorCamp(c)}`} title="Color de la línea en el calendario" />
                  <span className="text-sm text-slate-700 font-medium min-w-0 truncate" title={c.nombre}>{c.nombre}</span>
                  {c.producto && <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">{c.producto}</span>}
                  <span className={`text-[11px] shrink-0 ${c.desde ? 'text-slate-500' : 'text-amber-600'}`}>{fmtRango(c)}</span>
                  {c.presupuesto && <span className="text-[11px] text-slate-400 truncate max-w-[180px] shrink-0" title={c.presupuesto}>💰 {c.presupuesto}</span>}
                  <span className="flex-1" />
                  <button onClick={() => abrirCampania(c)} title="Abrir / editar" className="text-slate-300 hover:text-coop-azul opacity-0 group-hover:opacity-100 shrink-0"><Pencil size={13} /></button>
                  {borrandoCamp === c.id ? (
                    <span className="flex items-center gap-1 text-xs shrink-0">
                      <button onClick={() => borrarCampania(c)} className="px-1.5 py-0.5 rounded bg-red-600 text-white">Sí</button>
                      <button onClick={() => setBorrandoCamp(null)} className="px-1.5 py-0.5 rounded border border-slate-300 text-slate-500">No</button>
                    </span>
                  ) : (
                    <button onClick={() => setBorrandoCamp(c.id)} title="Eliminar la campaña"
                      className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 text-xs shrink-0">🗑</button>
                  )}
                </div>
              ))}
            </div>
            {campForm && (
              <div className="border border-coop-azul/40 rounded-lg p-3 mt-2 space-y-2 bg-blue-50/30">
                <div className="flex gap-2 flex-wrap">
                  <input value={campForm.nombre} onChange={(e) => setCampForm((x) => ({ ...x, nombre: e.target.value }))}
                    placeholder="Nombre de la campaña" className="flex-1 min-w-[180px] border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-medium" />
                  <input value={campForm.producto} onChange={(e) => setCampForm((x) => ({ ...x, producto: e.target.value }))}
                    placeholder="Producto (Reconecta, +AGUA…)" className="w-44 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <label className="text-xs text-slate-500">Período</label>
                  <input type="date" value={campForm.desde} onChange={(e) => setCampForm((x) => ({ ...x, desde: e.target.value }))} className="border border-slate-300 rounded-lg px-2 py-1 text-sm" />
                  <span className="text-slate-400 text-xs">→</span>
                  <input type="date" value={campForm.hasta} onChange={(e) => setCampForm((x) => ({ ...x, hasta: e.target.value }))} className="border border-slate-300 rounded-lg px-2 py-1 text-sm" />
                  <input value={campForm.presupuesto} onChange={(e) => setCampForm((x) => ({ ...x, presupuesto: e.target.value }))}
                    placeholder="Presupuesto ($/día × días)" className="flex-1 min-w-[180px] border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                </div>
                <textarea value={campForm.desarrollo} onChange={(e) => setCampForm((x) => ({ ...x, desarrollo: e.target.value }))} rows={6}
                  placeholder={'Desarrollo: objetivo Meta, segmentación (provincias, edades, cargos, intereses, exclusiones), formulario…'}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setCampForm(null)} className="px-3 py-1 text-xs rounded-lg border border-slate-300 text-slate-500">Cancelar</button>
                  <button onClick={guardarCampania} disabled={!campForm.nombre.trim()} className="px-3 py-1 text-xs rounded-lg bg-coop-azul text-white disabled:opacity-40">Guardar campaña</button>
                </div>
              </div>
            )}
          </div>

          {/* Ola 3: el espacio de trabajo del mes — el excel de Booster como calendario.
              Click en un día: ver/agregar/editar publicaciones (canal, formato, título, nota). */}
          <Calendario />
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Contenido del mes</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {CATS_PLAN.map((c) => <Zona key={c.id} cat={c} ruta={`plan/${mes}/${c.id}`} migas={[...migasBase, c.label]} conDia />)}
          </div>
        </>
      ) : solapa === 'eventos' ? (
        <>
          {/* Eventos (ola 3): repositorio ANUAL — carpetas libres por evento, cualquier
              formato, con subcarpetas y galería (misma mecánica que Planificación). */}
          <div className="flex items-center gap-2 mb-3">
            <button onClick={() => setAnio((a) => a - 1)} className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-600 hover:border-coop-azul hover:text-coop-azul">◀</button>
            <span className="text-base font-semibold text-coop-negro min-w-[80px] text-center">{anio}</span>
            <button onClick={() => setAnio((a) => a + 1)} className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-600 hover:border-coop-azul hover:text-coop-azul">▶</button>
            {anio !== new Date().getFullYear() && (
              <button onClick={() => setAnio(new Date().getFullYear())} className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 text-slate-500 hover:border-coop-azul hover:text-coop-azul">Hoy</button>
            )}
            <span className="text-xs text-slate-400 ml-2">Una carpeta por evento — adentro, subcarpetas y cualquier formato de archivo.</span>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <Zona cat={{ id: 'eventos', label: `Eventos ${anio}`, emoji: '🎪' }} ruta={`evento/${anio}`} migas={[`Eventos ${anio}`]} conDia={false} />
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-slate-400 mb-3">Material permanente de marca — no depende del mes. Tope por archivo: {TOPE_MB} MB (arriba de 90 MB sube en partes).</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {CATS_MARCA.map((c) => <Zona key={c.id} cat={c} ruta={`marca/${c.id}`} migas={[...migasBase, c.label]} conDia={false} />)}
          </div>
        </>
      )}

      {/* Panel del día del calendario (ola 3) */}
      {diaSel !== null && <PanelDia />}

      {/* Reproductor propio: streaming para los pesados, objectURL para los chicos */}
      {video && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={cerrarVideo}>
          <div className="w-full max-w-4xl flex flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {video.src ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={video.src} controls autoPlay className="w-full max-h-[80vh] rounded-lg shadow-2xl bg-black" />
            ) : (
              <p className="text-white/70 text-sm py-12">Bajando el video…</p>
            )}
            <div className="flex items-center gap-3">
              <p className="text-white/80 text-sm truncate max-w-[60vw]">{video.nombre}</p>
              <button onClick={cerrarVideo} className="px-3 py-1 text-sm rounded-lg bg-white/90 text-slate-700">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal propio de imagen ampliada */}
      {ampliada && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={cerrarAmpliada}>
          <div className="max-w-4xl max-h-full flex flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <img src={ampliada.src} alt={ampliada.nombre} className="max-h-[80vh] rounded-lg shadow-2xl object-contain" />
            <div className="flex items-center gap-3">
              <p className="text-white/80 text-sm">{ampliada.nombre}</p>
              <button onClick={cerrarAmpliada} className="px-3 py-1 text-sm rounded-lg bg-white/90 text-slate-700">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
