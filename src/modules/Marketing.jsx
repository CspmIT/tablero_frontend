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

  const [solapa, setSolapa] = useState('plan'); // plan | marca
  const [mes, setMes] = useState(mesHoy());
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
          <h3 className="text-sm font-semibold text-coop-negro flex items-center gap-1.5">
            <span>{cat.emoji}</span> {cat.label}
            <span className="text-[11px] font-normal text-slate-400">({total})</span>
          </h3>
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

  // ---------- Vista galería (ola 2): adentro de una subcarpeta ----------
  const Galeria = () => {
    const items = enRuta(vista.ruta);
    const activa = arrastrando === vista.ruta;
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setArrastrando(vista.ruta); }}
        onDragLeave={(e) => { e.preventDefault(); setArrastrando((r) => (r === vista.ruta ? null : r)); }}
        onDrop={(e) => { e.preventDefault(); setArrastrando(null); subirArchivos(e.dataTransfer.files, vista.ruta); }}
        className={`bg-white rounded-xl border ${activa ? 'border-coop-azul ring-2 ring-coop-azul/30' : 'border-slate-200'} p-4 min-h-[300px]`}
      >
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <button onClick={() => setVista(null)}
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
          <button onClick={() => abrirPicker(vista.ruta)}
            className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 text-slate-500 hover:border-coop-azul hover:text-coop-azul">＋ subir</button>
        </div>
        {items.length === 0 ? (
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
                  <p className="text-[10.5px] text-slate-400 mb-1">{fmtTam(a.tamano)} · {fmtFecha(a.createdAt)}</p>
                  <div className="flex items-center gap-1 mt-auto">{controlesArchivo(a)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const cargando = archivos === null;
  const migasBase = solapa === 'plan' ? [mesLabel(mes)] : ['Marca'];

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
          {[{ id: 'plan', label: 'Planificación' }, { id: 'marca', label: 'Marca' }].map((s) => (
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
            <span className="text-xs text-slate-400 ml-2">Tope por archivo: {TOPE_MB} MB — arriba de 90 MB sube en partes (tarda, pero entra).</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {CATS_PLAN.map((c) => <Zona key={c.id} cat={c} ruta={`plan/${mes}/${c.id}`} migas={[...migasBase, c.label]} conDia />)}
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
