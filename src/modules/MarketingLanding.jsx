import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, GripVertical, Trash2, Plus, Upload, Folder, ArrowLeft, Globe, History, FileImage, Clapperboard } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';
import { useFotoSrc } from '../components/FotoImg.jsx';
import { saveImage } from '../api/minio.js';

// ---------------------------------------------------------------------------
// Marketing → Landing (28/09, spec de Leonardo con el proyecto de la web):
// panel de administración de la landing pública de Cooptech.
//   · NADA se publica solo: se edita un BORRADOR (autosave, patrón simulador);
//     la web solo ve la última versión PUBLICADA («Publicar en la web»,
//     solo conducción, doble click de confirmación).
//   · Los archivos se VINCULAN desde Marca (referencia {id,key,nombre}, nunca
//     una copia) con un selector único; también se puede subir una imagen ahí
//     mismo (queda guardada en la carpeta de Marca que esté abierta).
//   · Orden por flechas/arrastre y tilde «Visible» en todas las listas.
// El armado del payload público, la validación y las versiones viven en el
// backend (routes/landingAdmin.js); acá solo se edita el borrador.
// ---------------------------------------------------------------------------

const SLUGS = ['reconecta', 'mas-agua', 'coopcloud', 'centinela', 'oficina-virtual', 'desarrollos'];
const CARPETA_LOGOS_CLIENTES = 'marca/logos/Logos Clientes';
// Reconocimientos (spec v2): tipos SUGERIDOS — campo libre igual (lección enum).
// Títulos/bajadas de sección que la web reconoce (vacío = usa su default).
const TEXTOS_SECCIONES = [
  { clave: 'productos', label: 'Productos' },
  { clave: 'adn', label: 'ADN' },
  { clave: 'sustentabilidad', label: 'Sustentabilidad' },
  { clave: 'casos', label: 'Casos de éxito' },
  { clave: 'contacto', label: 'Contacto' },
];
const TIPOS_RECONOCIMIENTO = ['Congreso', 'Libro de actas', 'IEEE Xplore', 'Jornadas', 'Tesis', 'Certificación', 'Premio'];
// Carga inicial de los 8 del spec (los sellos hay que subirlos a Marca; entran
// OCULTOS hasta tener imagen — publicar exige el sello).
const RECONOCIMIENTOS_INICIALES = [
  { anio: 2021, tipo: 'Congreso', titulo: 'RPIC 2021 · San Juan', detalle: 'Presentación en la Reunión de Procesamiento de la Información y Control.', link: '' },
  { anio: 2021, tipo: 'Libro de actas', titulo: 'Actas RPIC 2021 (pág. 548)', detalle: 'Trabajo publicado en el libro de actas del congreso.', link: '' },
  { anio: 2021, tipo: 'IEEE Xplore', titulo: '1.ª publicación IEEE Xplore', detalle: 'Primera publicación indexada en IEEE Xplore.', link: 'https://ieeexplore.ieee.org/document/9648462' },
  { anio: 2022, tipo: 'Jornadas', titulo: 'Jornadas de Ciencia y Tecnología UTN FRSF', detalle: 'Presentación en las jornadas de la UTN Facultad Regional Santa Fe.', link: 'https://ria.utn.edu.ar/handle/20.500.12272/7581' },
  { anio: 2022, tipo: 'Tesis', titulo: 'Tesis de Ingeniería Electrónica UTN FRSF', detalle: 'Tesis de grado desarrollada sobre la plataforma.', link: '' },
  { anio: 2023, tipo: 'Congreso', titulo: 'RPIC 2023 · Oberá, Misiones', detalle: 'Presentación en la Reunión de Procesamiento de la Información y Control.', link: '' },
  { anio: 2023, tipo: 'Libro de actas', titulo: 'Actas RPIC 2023 (pág. 549)', detalle: 'Trabajo publicado en el libro de actas del congreso.', link: '' },
  { anio: 2023, tipo: 'IEEE Xplore', titulo: '2.ª publicación IEEE Xplore', detalle: 'Segunda publicación indexada, en validación.', link: '' },
];
const BORRADOR_VACIO = { portada: { video: null, poster: null, titulo: '', bajada: '' }, kpis: [], productos: [], clientes: [], entrevistas: [], reconocimientos: [], sustentabilidad: [], contacto: {}, textos: {} };
const SECS = [
  { id: 'portada', label: 'Portada' },
  { id: 'kpis', label: 'Quiénes somos' },
  { id: 'productos', label: 'Productos' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'entrevistas', label: 'Entrevistas' },
  { id: 'reconocimientos', label: 'Reconocimientos' },
  { id: 'sustentabilidad', label: 'Sustentabilidad' },
  { id: 'contacto', label: 'Contacto y textos' },
  { id: 'precios', label: 'Precios CoopCloud' },
];

const esImg = (a) => (a.mime && a.mime.startsWith('image/')) || /\.(png|jpe?g|gif|webp|svg)$/i.test(a.nombre || a.key || '');
const esVid = (a) => (a.mime && a.mime.startsWith('video/')) || /\.mp4$/i.test(a.nombre || a.key || '');
const sinExt = (n) => String(n || '').replace(/\.[a-z0-9]+$/i, '').trim();
const refDe = (a) => ({ id: a.id, key: a.key, nombre: a.nombre });

// Mini-thumbnail de una referencia de archivo (descarga con auth vía gateway).
function Miniatura({ archivo, clase = 'w-14 h-14' }) {
  const src = useFotoSrc(archivo && esImg(archivo) ? archivo.key : null);
  if (!archivo) return <div className={`${clase} rounded-lg bg-slate-100 flex items-center justify-center text-slate-300`}><FileImage size={18} /></div>;
  if (!esImg(archivo)) return <div className={`${clase} rounded-lg bg-slate-800 flex items-center justify-center text-white`} title={archivo.nombre}><Clapperboard size={18} /></div>;
  return src
    ? <img src={src} alt={archivo.nombre} className={`${clase} rounded-lg object-contain bg-slate-50 border border-slate-100`} />
    : <div className={`${clase} rounded-lg bg-slate-100 animate-pulse`} />;
}

// ============================ SELECTOR DE ARCHIVOS ============================
// El selector ÚNICO del spec: navega las carpetas de Marca, filtra por tipo,
// muestra miniaturas y devuelve la referencia. Subir acá guarda EN MARCA
// (solo imágenes por este camino; los videos se suben desde la pestaña Marca,
// que tiene la subida en partes para pesados).
function SelectorArchivo({ tipo, onElegir, onCerrar }) {
  const { api } = useData();
  const [archivos, setArchivos] = useState(null);
  const [carpetas, setCarpetas] = useState({});
  const [ruta, setRuta] = useState(null); // null = raíz (zonas de Marca)
  const [busca, setBusca] = useState('');
  const [subiendo, setSubiendo] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    Promise.all([api.archivos.list({ contexto: 'marketing' }), api.archivos.marketingCarpetas().catch(() => null)])
      .then(([r, rc]) => { setArchivos(r?.data || []); if (rc?.carpetas) setCarpetas(rc.carpetas); })
      .catch(() => setArchivos([]));
  }, [api]);

  const ZONAS = [
    { ruta: 'marca/manual', label: 'Manual de marca' }, { ruta: 'marca/logos', label: 'Logos' },
    { ruta: 'marca/videos', label: 'Videos' }, { ruta: 'marca/imagenes', label: 'Imágenes' },
  ];
  const delTipo = (a) => (tipo === 'video' ? esVid(a) : esImg(a));
  const rutaDe = (a) => String(a.url || '').trim();
  const q = busca.trim().toLowerCase();
  const enBusqueda = q && (archivos || []).filter((a) => delTipo(a) && (a.nombre || '').toLowerCase().includes(q));
  const zonaDe = (r) => ZONAS.find((z) => r === z.ruta || r.startsWith(z.ruta + '/'));
  // Subcarpetas de la ruta actual: declaradas ∪ derivadas de archivos.
  const subcarpetas = useMemo(() => {
    if (!ruta) return [];
    const declaradas = Array.isArray(carpetas[ruta]) ? carpetas[ruta] : [];
    const derivadas = (archivos || []).map(rutaDe).filter((u) => u.startsWith(ruta + '/')).map((u) => u.slice(ruta.length + 1).split('/')[0]);
    const vistos = new Set();
    return [...declaradas, ...derivadas].filter((s) => { const k = s.toLowerCase(); if (!s || vistos.has(k)) return false; vistos.add(k); return true; }).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  }, [ruta, carpetas, archivos]);
  const enRuta = (archivos || []).filter((a) => rutaDe(a) === ruta && delTipo(a));

  const subir = async (f) => {
    if (!f) return;
    try {
      setSubiendo(`Subiendo "${f.name}"…`);
      const key = await saveImage(f);
      const creado = await api.archivos.create({ key, nombre: f.name, mime: f.type || 'image/png', tamano: f.size, contexto: 'marketing', url: ruta });
      setSubiendo('');
      onElegir(refDe(creado)); // subir Y vincular en un paso — queda en Marca
    } catch (e) { setSubiendo(`No se pudo subir: ${e.message || 'error'}`); }
  };

  const Card = ({ a }) => (
    <button onClick={() => onElegir(refDe(a))} className="text-left bg-white border border-slate-200 rounded-xl p-2 hover:border-coop-azul transition-colors">
      <Miniatura archivo={a} clase="w-full h-20" />
      <p className="text-xs text-slate-600 mt-1 truncate" title={a.nombre}>{a.nombre}</p>
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-3" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200">
          <span className="text-sm font-medium text-coop-negro">Elegir {tipo === 'video' ? 'video' : 'imagen'} de Marca</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nombre…"
            className="ml-auto px-2.5 py-1 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-coop-azul w-44" />
          <button onClick={onCerrar} className="text-slate-500 hover:bg-slate-100 rounded px-2 py-1">✕</button>
        </div>
        <div className="p-3 overflow-y-auto flex-1">
          {archivos === null ? <p className="text-sm text-slate-400">Cargando…</p> : enBusqueda ? (
            enBusqueda.length === 0 ? <p className="text-sm text-slate-300 text-center py-6">Nada con “{busca.trim()}”.</p>
              : <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">{enBusqueda.slice(0, 30).map((a) => <Card key={a.id} a={a} />)}</div>
          ) : !ruta ? (
            <div className="grid grid-cols-2 gap-2">
              {ZONAS.map((z) => (
                <button key={z.ruta} onClick={() => setRuta(z.ruta)} className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3 py-3 text-sm text-slate-700">
                  <Folder size={16} className="text-coop-naranja" /> {z.label}
                  <span className="ml-auto text-xs text-slate-400">{(archivos || []).filter((a) => zonaDe(rutaDe(a))?.ruta === z.ruta && delTipo(a)).length}</span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <button onClick={() => setRuta(ruta.includes('/') && ruta.split('/').length > 2 ? ruta.split('/').slice(0, 2).join('/') : null)}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-coop-azul"><ArrowLeft size={14} /> Volver</button>
                <span className="text-xs text-slate-400">{ruta}</span>
                {tipo !== 'video' && (
                  <button onClick={() => inputRef.current?.click()} className="ml-auto flex items-center gap-1 text-xs bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-600 hover:border-coop-azul">
                    <Upload size={13} /> Subir acá
                  </button>
                )}
                <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ''; }} />
              </div>
              {subiendo && <p className="text-xs text-slate-500 mb-2">{subiendo}</p>}
              {subcarpetas.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {subcarpetas.map((s) => (
                    <button key={s} onClick={() => setRuta(`${ruta}/${s}`)} className="flex items-center gap-1 text-xs bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1 text-slate-600 hover:border-coop-azul">
                      <Folder size={12} className="text-coop-naranja" /> {s}
                    </button>
                  ))}
                </div>
              )}
              {enRuta.length === 0 ? (
                <p className="text-sm text-slate-300 text-center py-6">
                  {tipo === 'video' ? 'No hay videos acá. Los videos se suben desde la pestaña Marca (soporta pesados en partes).' : 'No hay imágenes en esta carpeta.'}
                </p>
              ) : <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">{enRuta.map((a) => <Card key={a.id} a={a} />)}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Campo «archivo de Marca»: miniatura + Elegir/Quitar. Guarda la referencia.
function CampoArchivo({ label, hint, valor, tipo = 'imagen', onChange, disabled }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div>
      <label className="text-xs text-slate-500 block mb-1">{label}{hint && <span className="text-slate-300"> · {hint}</span>}</label>
      <div className="flex items-center gap-2">
        <Miniatura archivo={valor} />
        <div className="min-w-0">
          <p className="text-xs text-slate-600 truncate max-w-[160px]" title={valor?.nombre}>{valor?.nombre || <span className="text-slate-300">sin archivo</span>}</p>
          <div className="flex gap-2 mt-0.5">
            <button disabled={disabled} onClick={() => setAbierto(true)} className="text-xs text-coop-azul hover:underline disabled:opacity-40">Elegir…</button>
            {valor && <button disabled={disabled} onClick={() => onChange(null)} className="text-xs text-slate-400 hover:text-red-500 disabled:opacity-40">Quitar</button>}
          </div>
        </div>
      </div>
      {abierto && <SelectorArchivo tipo={tipo} onElegir={(r) => { onChange(r); setAbierto(false); }} onCerrar={() => setAbierto(false)} />}
    </div>
  );
}

// ============================ LISTAS ORDENABLES ============================
function FilaOrdenable({ i, total, onMover, onDragStart, onDrop, visible, onVisible, onBorrar, children, disabled }) {
  return (
    <div draggable={!disabled} onDragStart={(e) => { onDragStart(i); e.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(i)}
      className={`flex items-start gap-2 bg-white border border-slate-200 rounded-xl p-2.5 ${visible === false ? 'opacity-50' : ''}`}>
      <div className="flex flex-col items-center gap-0.5 pt-1 text-slate-300">
        <button disabled={disabled || i === 0} onClick={() => onMover(i, -1)} className="hover:text-coop-azul disabled:opacity-30 leading-none">▲</button>
        <GripVertical size={14} className="cursor-grab" />
        <button disabled={disabled || i === total - 1} onClick={() => onMover(i, 1)} className="hover:text-coop-azul disabled:opacity-30 leading-none">▼</button>
      </div>
      <div className="flex-1 min-w-0">{children}</div>
      <div className="flex flex-col gap-1.5 pt-1">
        <button disabled={disabled} title={visible === false ? 'Oculto en la web (clic para mostrar)' : 'Visible en la web (clic para ocultar sin borrar)'}
          onClick={onVisible} className={`${visible === false ? 'text-slate-300' : 'text-emerald-600'} disabled:opacity-40`}>
          {visible === false ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        <button disabled={disabled} title="Quitar de la lista" onClick={onBorrar} className="text-slate-300 hover:text-red-500 disabled:opacity-40"><Trash2 size={15} /></button>
      </div>
    </div>
  );
}

const inputCls = 'w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-coop-azul disabled:bg-slate-50';

export default function MarketingLanding() {
  const { api, me } = useData();
  const gestor = me?.tipo === 'manager' || me?.tipo === 'gerencial';
  const [borrador, setBorrador] = useState(null);
  const [ultima, setUltima] = useState(null);
  const [ultimaFuente, setUltimaFuente] = useState(null);
  const [sec, setSec] = useState('portada');
  const [guardado, setGuardado] = useState('');
  const [soloLectura, setSoloLectura] = useState(false);
  const [error, setError] = useState('');
  const [pub, setPub] = useState('normal'); // normal | armado | publicando
  const [verCambios, setVerCambios] = useState(false);
  const [verVersiones, setVerVersiones] = useState(false);
  const [versiones, setVersiones] = useState(null);
  const [monomicos, setMonomicos] = useState(undefined); // undefined=cargando, null=sin publicar
  const timer = useRef(null);
  const pubTimer = useRef(null);
  const dragIdx = useRef(null);
  const cargado = useRef(false);

  useEffect(() => {
    api.landing.admin()
      .then((r) => {
        const b = r?.borrador || {};
        setBorrador({ ...BORRADOR_VACIO, ...b, portada: { ...BORRADOR_VACIO.portada, ...(b.portada || {}) } });
        setUltima(r?.ultima || null);
        setUltimaFuente(r?.ultimaFuente || null);
        cargado.current = true;
      })
      .catch((e) => setError(e.message || 'No se pudo cargar la Landing'));
    fetch('/api/landing/monomicos').then((r) => (r.ok ? r.json() : null)).then(setMonomicos).catch(() => setMonomicos(null));
    return () => { clearTimeout(timer.current); clearTimeout(pubTimer.current); };
  }, [api]);

  // Autosave del borrador (debounce, patrón simulador global).
  const tocar = useCallback((cambio) => {
    setBorrador((b) => {
      const nuevo = typeof cambio === 'function' ? cambio(b) : { ...b, ...cambio };
      if (cargado.current && !soloLectura) {
        setGuardado('Guardando…');
        clearTimeout(timer.current);
        timer.current = setTimeout(async () => {
          try { await api.landing.guardarBorrador(nuevo); setGuardado('Borrador guardado ✓'); }
          catch (e) { if (e?.status === 403) { setSoloLectura(true); setGuardado(''); } else setGuardado('Sin guardar — reintenta al próximo cambio'); }
        }, 800);
      }
      return nuevo;
    });
  }, [api, soloLectura]);

  // Helpers de listas (orden por flechas o arrastre + visible + borrar).
  const lista = (campo) => ({
    mover: (i, d) => tocar((b) => { const l = [...b[campo]]; const j = i + d; if (j < 0 || j >= l.length) return b; [l[i], l[j]] = [l[j], l[i]]; return { ...b, [campo]: l }; }),
    dragStart: (i) => { dragIdx.current = i; },
    drop: (i) => tocar((b) => { const de = dragIdx.current; if (de == null || de === i) return b; const l = [...b[campo]]; const [x] = l.splice(de, 1); l.splice(i, 0, x); return { ...b, [campo]: l }; }),
    visible: (i) => tocar((b) => { const l = [...b[campo]]; l[i] = { ...l[i], visible: l[i].visible === false }; return { ...b, [campo]: l }; }),
    borrar: (i) => tocar((b) => ({ ...b, [campo]: b[campo].filter((_, j) => j !== i) })),
    set: (i, cambio) => tocar((b) => { const l = [...b[campo]]; l[i] = { ...l[i], ...cambio }; return { ...b, [campo]: l }; }),
    agregar: (item) => tocar((b) => ({ ...b, [campo]: [...b[campo], { visible: true, ...item }] })),
  });
  const kpis = lista('kpis'); const prods = lista('productos'); const clis = lista('clientes'); const hitos = lista('sustentabilidad'); const entrs = lista('entrevistas'); const recs = lista('reconocimientos');

  const publicarClick = async () => {
    clearTimeout(pubTimer.current);
    if (pub === 'publicando') return;
    if (pub !== 'armado') { setPub('armado'); pubTimer.current = setTimeout(() => setPub('normal'), 5000); return; }
    setPub('publicando'); setError('');
    try {
      const r = await api.landing.publicar();
      setUltima(r?.version || null);
      setUltimaFuente(borrador);
      setPub('normal'); setGuardado(`Publicada la v${r?.version?.numero} ✓`);
    } catch (e) { setPub('normal'); setError(e.message || 'No se pudo publicar'); }
  };

  const abrirVersiones = async () => {
    setVerVersiones(true); setVersiones(null);
    try { setVersiones((await api.landing.versiones())?.versiones || []); } catch { setVersiones([]); }
  };
  const republicar = async (numero) => {
    try {
      const r = await api.landing.republicar(numero);
      setUltima(r?.version || null); setVerVersiones(false);
      setGuardado(`Republicada como v${r?.version?.numero} ✓ (la web ya la sirve)`);
    } catch (e) { setError(e.message || 'No se pudo republicar'); }
  };

  // «Ver cambios»: compara el borrador contra la fuente de la última versión.
  const cambios = useMemo(() => {
    if (!borrador) return [];
    const partes = [['portada', 'Portada'], ['kpis', 'Quiénes somos (KPIs)'], ['productos', 'Productos'], ['clientes', 'Clientes'], ['entrevistas', 'Entrevistas'], ['reconocimientos', 'Reconocimientos'], ['sustentabilidad', 'Sustentabilidad'], ['contacto', 'Contacto'], ['textos', 'Títulos de sección']];
    return partes.map(([k, label]) => {
      const antes = ultimaFuente?.[k]; const ahora = borrador[k];
      const igual = JSON.stringify(antes ?? (Array.isArray(ahora) ? [] : {})) === JSON.stringify(ahora);
      const detalle = Array.isArray(ahora) ? `${ahora.length} ítem${ahora.length === 1 ? '' : 's'} (${ahora.filter((x) => x.visible !== false).length} visibles)` : null;
      return { label, igual, detalle };
    });
  }, [borrador, ultimaFuente]);
  const hayCambios = cambios.some((c) => !c.igual);

  // Sembrar Clientes desde la carpeta «Logos Clientes» de Marca (los que falten).
  const traerLogosClientes = async () => {
    try {
      const r = await api.archivos.list({ contexto: 'marketing' });
      const enCarpeta = (r?.data || []).filter((a) => String(a.url || '').trim().toLowerCase() === CARPETA_LOGOS_CLIENTES.toLowerCase() && esImg(a));
      tocar((b) => {
        const ya = new Set((b.clientes || []).map((c) => c.archivo?.id));
        const nuevos = enCarpeta.filter((a) => !ya.has(a.id)).map((a) => ({ archivo: refDe(a), nombre: sinExt(a.nombre), visible: true }));
        return { ...b, clientes: [...(b.clientes || []), ...nuevos] };
      });
    } catch (e) { setError(e.message || 'No se pudo leer la carpeta'); }
  };

  if (error && !borrador) return <p className="text-sm text-red-600">{error}</p>;
  if (!borrador) return <p className="text-sm text-slate-400">Cargando…</p>;

  const ro = soloLectura;
  const pubLabel = pub === 'armado' ? '¿Publicar en la web? tocá de nuevo' : pub === 'publicando' ? 'Publicando…' : 'Publicar en la web';

  return (
    <div>
      {/* Barra: sub-pestañas + estado + acciones */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {SECS.map((s) => (
            <button key={s.id} onClick={() => setSec(s.id)}
              className={`px-3 py-1.5 rounded-full text-sm ${sec === s.id ? 'bg-coop-azul text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-coop-azul hover:text-coop-azul'}`}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {guardado && <span className="text-xs text-slate-400">{guardado}</span>}
          {ro && <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">Solo lectura: el borrador lo edita el equipo de Marketing.</span>}
          <button onClick={() => setVerCambios(true)} className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-600 hover:border-coop-azul">Ver cambios</button>
          {gestor && <button onClick={abrirVersiones} className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-600 hover:border-coop-azul flex items-center gap-1"><History size={13} /> Versiones</button>}
          {gestor && (
            <button onClick={publicarClick} disabled={pub === 'publicando'}
              className={`text-xs rounded-lg px-2.5 py-1.5 border flex items-center gap-1 transition-colors ${pub === 'armado' ? 'bg-amber-500 text-white border-amber-500' : 'bg-coop-azul text-white border-coop-azul hover:opacity-90'}`}>
              <Globe size={13} /> {pubLabel}
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-3">
        {ultima ? <>Última publicación: <b>v{ultima.numero}</b> · {new Date(ultima.createdAt).toLocaleString('es-AR')} · {ultima.publicadoPor || '—'}{hayCambios && <span className="text-amber-600"> · el borrador tiene cambios sin publicar</span>}</>
          : 'La landing todavía no se publicó desde el tablero: la web muestra su contenido por defecto hasta la primera publicación.'}
        {error && <span className="text-red-600 block mt-1">{error}</span>}
      </p>

      {/* ============ PORTADA ============ */}
      {sec === 'portada' && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 grid gap-4 max-w-2xl">
          <div className="grid sm:grid-cols-2 gap-4">
            <CampoArchivo label="Video de fondo" hint="mp4, ideal < 8 MB, sin audio" tipo="video" valor={borrador.portada.video} disabled={ro}
              onChange={(v) => tocar((b) => ({ ...b, portada: { ...b.portada, video: v } }))} />
            <CampoArchivo label="Imagen de respaldo (poster)" hint="se ve mientras carga el video" valor={borrador.portada.poster} disabled={ro}
              onChange={(v) => tocar((b) => ({ ...b, portada: { ...b.portada, poster: v } }))} />
          </div>
          <div><label className="text-xs text-slate-500 block mb-1">Título</label>
            <input disabled={ro} className={inputCls} value={borrador.portada.titulo || ''} onChange={(e) => tocar((b) => ({ ...b, portada: { ...b.portada, titulo: e.target.value } }))} /></div>
          <div><label className="text-xs text-slate-500 block mb-1">Bajada</label>
            <textarea disabled={ro} rows={2} className={inputCls} value={borrador.portada.bajada || ''} onChange={(e) => tocar((b) => ({ ...b, portada: { ...b.portada, bajada: e.target.value } }))} /></div>
        </div>
      )}

      {/* ============ KPIs ============ */}
      {sec === 'kpis' && (
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          <div className="grid gap-2">
            {borrador.kpis.map((k, i) => (
              <FilaOrdenable key={i} i={i} total={borrador.kpis.length} disabled={ro} visible={k.visible}
                onMover={kpis.mover} onDragStart={kpis.dragStart} onDrop={kpis.drop} onVisible={() => kpis.visible(i)} onBorrar={() => kpis.borrar(i)}>
                <div className="grid grid-cols-[110px_1fr] gap-2">
                  <input disabled={ro} className={inputCls} placeholder="+6.000" value={k.valor || ''} onChange={(e) => kpis.set(i, { valor: e.target.value })} />
                  <input disabled={ro} className={inputCls} placeholder="familias abastecidas…" value={k.etiqueta || ''} onChange={(e) => kpis.set(i, { etiqueta: e.target.value })} />
                </div>
              </FilaOrdenable>
            ))}
            <button disabled={ro} onClick={() => kpis.agregar({ valor: '', etiqueta: '' })} className="flex items-center gap-1 text-sm text-coop-azul hover:underline disabled:opacity-40"><Plus size={15} /> Agregar indicador</button>
            <p className="text-xs text-slate-400">Se recomiendan de 2 a 4 indicadores.</p>
          </div>
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-400 mb-2">Vista previa</p>
            <div className="grid grid-cols-2 gap-2">
              {borrador.kpis.filter((k) => k.visible !== false).map((k, i) => (
                <div key={i} className="bg-coop-azul text-white rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold">{k.valor || '—'}</p>
                  <p className="text-xs opacity-80 leading-tight mt-1">{k.etiqueta || 'etiqueta'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============ PRODUCTOS ============ */}
      {sec === 'productos' && (
        <div className="grid gap-3">
          {borrador.productos.map((p, i) => (
            <FilaOrdenable key={i} i={i} total={borrador.productos.length} disabled={ro} visible={p.visible}
              onMover={prods.mover} onDragStart={prods.dragStart} onDrop={prods.drop} onVisible={() => prods.visible(i)} onBorrar={() => prods.borrar(i)}>
              <div className="grid gap-3">
                <div className="grid sm:grid-cols-3 gap-2">
                  <input disabled={ro} className={inputCls} placeholder="Nombre" value={p.nombre || ''} onChange={(e) => prods.set(i, { nombre: e.target.value })} />
                  <input disabled={ro} className={inputCls} placeholder="id (slug): reconecta, mas-agua…" list="landing-slugs" value={p.slug || ''} onChange={(e) => prods.set(i, { slug: e.target.value })} />
                  <input disabled={ro} className={inputCls} placeholder="Texto del botón (Consultar)" value={p.cta ?? 'Consultar'} onChange={(e) => prods.set(i, { cta: e.target.value })} />
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <CampoArchivo label="Logo" hint="el *_cuadrado.png" valor={p.logo} disabled={ro} onChange={(v) => prods.set(i, { logo: v })} />
                  <CampoArchivo label="Placa" hint="16:9" valor={p.placa} disabled={ro} onChange={(v) => prods.set(i, { placa: v })} />
                  <CampoArchivo label="Captura de plataforma" hint="opcional, 16:9" valor={p.captura} disabled={ro} onChange={(v) => prods.set(i, { captura: v })} />
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  <div>
                    <input disabled={ro} className={inputCls} placeholder="Resumen corto" maxLength={60} value={p.resumen || ''} onChange={(e) => prods.set(i, { resumen: e.target.value })} />
                    <p className="text-[10px] text-slate-300 text-right">{(p.resumen || '').length}/60</p>
                  </div>
                  <input disabled={ro} className={inputCls} placeholder="Video demo (URL de YouTube, opcional)" value={p.video || ''} onChange={(e) => prods.set(i, { video: e.target.value })} />
                </div>
                <div>
                  <textarea disabled={ro} rows={2} maxLength={300} className={inputCls} placeholder="Descripción" value={p.descripcion || ''} onChange={(e) => prods.set(i, { descripcion: e.target.value })} />
                  <p className="text-[10px] text-slate-300 text-right">{(p.descripcion || '').length}/300</p>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <input type="checkbox" disabled={ro} checked={p.simulador === true} onChange={(e) => prods.set(i, { simulador: e.target.checked })} />
                  Muestra el simulador de VM (solo CoopCloud)
                </label>
              </div>
            </FilaOrdenable>
          ))}
          <datalist id="landing-slugs">{SLUGS.map((s) => <option key={s} value={s} />)}</datalist>
          <button disabled={ro} onClick={() => prods.agregar({ nombre: '', slug: '', cta: 'Consultar', logo: null, placa: null, captura: null, video: '', resumen: '', descripcion: '', simulador: false })}
            className="flex items-center gap-1 text-sm text-coop-azul hover:underline disabled:opacity-40"><Plus size={15} /> Ficha nueva</button>
          <p className="text-xs text-slate-400">Una ficha nueva (p. ej. Núcleo Virtual) puede quedar con «Visible» apagado hasta que salga.</p>
        </div>
      )}

      {/* ============ CLIENTES ============ */}
      {sec === 'clientes' && (
        <div className="grid gap-2 max-w-2xl">
          {borrador.clientes.map((c, i) => (
            <FilaOrdenable key={i} i={i} total={borrador.clientes.length} disabled={ro} visible={c.visible}
              onMover={clis.mover} onDragStart={clis.dragStart} onDrop={clis.drop} onVisible={() => clis.visible(i)} onBorrar={() => clis.borrar(i)}>
              <div className="flex items-center gap-3">
                <Miniatura archivo={c.archivo} clase="w-12 h-12" />
                <div className="flex-1 grid gap-1">
                  <input disabled={ro} className={inputCls} placeholder="Nombre del cliente" value={c.nombre || ''} onChange={(e) => clis.set(i, { nombre: e.target.value })} />
                  <CampoArchivoInline disabled={ro} valor={c.archivo} onChange={(v) => clis.set(i, { archivo: v, ...(v && !c.nombre ? { nombre: sinExt(v.nombre) } : {}) })} />
                </div>
              </div>
            </FilaOrdenable>
          ))}
          <div className="flex items-center gap-3 flex-wrap">
            <button disabled={ro} onClick={() => clis.agregar({ archivo: null, nombre: '' })} className="flex items-center gap-1 text-sm text-coop-azul hover:underline disabled:opacity-40"><Plus size={15} /> Agregar cliente</button>
            <button disabled={ro} onClick={traerLogosClientes} className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-600 hover:border-coop-azul disabled:opacity-40">
              Traer los de la carpeta «Logos Clientes»
            </button>
          </div>
          <p className="text-xs text-slate-400">Publicada la primera versión, la web muestra SOLO esta lista (ya no la carpeta entera).</p>
        </div>
      )}


      {/* ============ ENTREVISTAS («En primera persona») ============ */}
      {sec === 'entrevistas' && (
        <div className="grid gap-2 max-w-2xl">
          {(borrador.entrevistas || []).map((e, i) => (
            <FilaOrdenable key={i} i={i} total={borrador.entrevistas.length} disabled={ro} visible={e.visible}
              onMover={entrs.mover} onDragStart={entrs.dragStart} onDrop={entrs.drop} onVisible={() => entrs.visible(i)} onBorrar={() => entrs.borrar(i)}>
              <div className="flex items-start gap-3">
                <div className="shrink-0"><CampoArchivo label="Foto" hint="del entrevistado" valor={e.foto} disabled={ro} onChange={(v) => entrs.set(i, { foto: v })} /></div>
                <div className="flex-1 grid gap-2">
                  <div className="grid sm:grid-cols-2 gap-2">
                    <input disabled={ro} className={inputCls} placeholder="Nombre (Franco Oliva)" value={e.nombre || ''} onChange={(ev) => entrs.set(i, { nombre: ev.target.value })} />
                    <input disabled={ro} className={inputCls} placeholder="Cooperativa (Coop. de Río Primero)" value={e.cooperativa || ''} onChange={(ev) => entrs.set(i, { cooperativa: ev.target.value })} />
                  </div>
                  <input disabled={ro} className={inputCls} placeholder="Link al video (URL completa — Instagram, YouTube…)" value={e.link || ''} onChange={(ev) => entrs.set(i, { link: ev.target.value })} />
                  <input disabled={ro} className={inputCls} maxLength={140} placeholder="Frase textual (opcional, ≤140)" value={e.frase || ''} onChange={(ev) => entrs.set(i, { frase: ev.target.value })} />
                </div>
              </div>
            </FilaOrdenable>
          ))}
          <button disabled={ro} onClick={() => entrs.agregar({ nombre: '', cooperativa: '', link: '', foto: null })}
            className="flex items-center gap-1 text-sm text-coop-azul hover:underline disabled:opacity-40"><Plus size={15} /> Agregar entrevista</button>
          <p className="text-xs text-slate-400">Son las tarjetas «En primera persona» de la web: al publicar, la landing muestra estas, en este orden — nada queda hardcodeado en la página.</p>
        </div>
      )}


      {/* ============ RECONOCIMIENTOS (carrusel de ADN) ============ */}
      {sec === 'reconocimientos' && (
        <div className="grid gap-2 max-w-2xl">
          {(borrador.reconocimientos || []).some((r) => /en validaci[oó]n/i.test(r.detalle || '')) && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Hay reconocimientos con «en validación» en el detalle — acordate de actualizarlos cuando salga la publicación definitiva.
            </p>
          )}
          {(borrador.reconocimientos || []).map((r, i) => (
            <FilaOrdenable key={i} i={i} total={borrador.reconocimientos.length} disabled={ro} visible={r.visible}
              onMover={recs.mover} onDragStart={recs.dragStart} onDrop={recs.drop} onVisible={() => recs.visible(i)} onBorrar={() => recs.borrar(i)}>
              <div className="flex items-start gap-3">
                <div className="shrink-0"><CampoArchivo label="Sello" hint="16:10, fondo blanco" valor={r.imagen} disabled={ro} onChange={(v) => recs.set(i, { imagen: v })} /></div>
                <div className="flex-1 grid gap-2">
                  <div className="grid grid-cols-[90px_1fr] gap-2">
                    <input disabled={ro} type="number" className={inputCls} placeholder="Año" value={r.anio ?? ''} onChange={(ev) => recs.set(i, { anio: ev.target.value === '' ? '' : Number(ev.target.value) })} />
                    <input disabled={ro} className={inputCls} list="landing-tipos-rec" placeholder="Tipo (Congreso, IEEE Xplore, Tesis…)" value={r.tipo || ''} onChange={(ev) => recs.set(i, { tipo: ev.target.value })} />
                  </div>
                  <div>
                    <input disabled={ro} className={inputCls} maxLength={60} placeholder="Título («RPIC 2023 · Oberá, Misiones»)" value={r.titulo || ''} onChange={(ev) => recs.set(i, { titulo: ev.target.value })} />
                    <p className="text-[10px] text-slate-300 text-right">{(r.titulo || '').length}/60</p>
                  </div>
                  <div>
                    <textarea disabled={ro} rows={2} maxLength={180} className={inputCls} placeholder="Detalle (1–2 oraciones)" value={r.detalle || ''} onChange={(ev) => recs.set(i, { detalle: ev.target.value })} />
                    <p className="text-[10px] text-slate-300 text-right">{(r.detalle || '').length}/180</p>
                  </div>
                  <input disabled={ro} className={inputCls} placeholder="Link a la publicación (opcional — sin link no aparece «Ver publicación»)" value={r.link || ''} onChange={(ev) => recs.set(i, { link: ev.target.value })} />
                </div>
              </div>
            </FilaOrdenable>
          ))}
          <datalist id="landing-tipos-rec">{TIPOS_RECONOCIMIENTO.map((t) => <option key={t} value={t} />)}</datalist>
          <div className="flex items-center gap-3 flex-wrap">
            <button disabled={ro} onClick={() => recs.agregar({ anio: new Date().getFullYear(), tipo: '', titulo: '', detalle: '', link: '', imagen: null })}
              className="flex items-center gap-1 text-sm text-coop-azul hover:underline disabled:opacity-40"><Plus size={15} /> Agregar reconocimiento</button>
            {(borrador.reconocimientos || []).length === 0 && (
              <button disabled={ro} onClick={() => tocar((b) => ({ ...b, reconocimientos: RECONOCIMIENTOS_INICIALES.map((r) => ({ ...r, imagen: null, visible: false })) }))}
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-600 hover:border-coop-azul disabled:opacity-40">
                Cargar los 8 iniciales (entran ocultos: falta subir cada sello a Marca)
              </button>
            )}
          </div>
          <p className="text-xs text-slate-400">En la web se ordenan por año (del más reciente al más antiguo); dentro del mismo año vale el orden de esta lista. Publicar exige el sello de cada uno visible.</p>
        </div>
      )}

      {/* ============ SUSTENTABILIDAD ============ */}
      {sec === 'sustentabilidad' && (
        <div className="grid gap-2 max-w-2xl">
          {borrador.sustentabilidad.map((h, i) => (
            <FilaOrdenable key={i} i={i} total={borrador.sustentabilidad.length} disabled={ro} visible={h.visible}
              onMover={hitos.mover} onDragStart={hitos.dragStart} onDrop={hitos.drop} onVisible={() => hitos.visible(i)} onBorrar={() => hitos.borrar(i)}>
              <div className="grid gap-2">
                <div className="flex items-start gap-3">
                  <div className="shrink-0"><CampoArchivo label="Imagen" valor={h.imagen} disabled={ro} onChange={(v) => hitos.set(i, { imagen: v })} /></div>
                  <div className="flex-1 grid gap-2">
                    <input disabled={ro} className={inputCls} placeholder="Título" value={h.titulo || ''} onChange={(e) => hitos.set(i, { titulo: e.target.value })} />
                    <input disabled={ro} className={inputCls} placeholder="Enlace (opcional)" value={h.link || ''} onChange={(e) => hitos.set(i, { link: e.target.value })} />
                  </div>
                </div>
                <textarea disabled={ro} rows={2} className={inputCls} placeholder="Descripción" value={h.descripcion || ''} onChange={(e) => hitos.set(i, { descripcion: e.target.value })} />
              </div>
            </FilaOrdenable>
          ))}
          <button disabled={ro} onClick={() => hitos.agregar({ imagen: null, titulo: '', descripcion: '', link: '' })} className="flex items-center gap-1 text-sm text-coop-azul hover:underline disabled:opacity-40"><Plus size={15} /> Agregar hito</button>
          <p className="text-xs text-slate-400">El importador desde coopmorteros.com/sustentabilidad queda para una fase 2.</p>
        </div>
      )}


      {/* ============ CONTACTO Y TEXTOS DE SECCIÓN ============ */}
      {sec === 'contacto' && (
        <div className="grid gap-4 max-w-2xl">
          <div className="bg-white rounded-xl border border-slate-200 p-4 grid gap-3">
            <h4 className="text-xs font-semibold text-coop-negro uppercase tracking-wide">Contacto y CTA</h4>
            <p className="text-xs text-slate-400 -mt-2">Todo opcional: lo vacío usa el valor por defecto de la web.</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {[['agendaLink', 'Link de «Agendá tu reunión» (URL)'], ['email', 'Email de contacto'], ['telefono', 'Teléfono'], ['whatsapp', 'WhatsApp (URL wa.me)'], ['direccion', 'Dirección'], ['instagram', 'Instagram (URL)'], ['linkedin', 'LinkedIn (URL)'], ['youtube', 'YouTube (URL)']].map(([campo, ph]) => (
                <input key={campo} disabled={ro} className={inputCls} placeholder={ph} value={borrador.contacto?.[campo] || ''}
                  onChange={(ev) => tocar((b) => ({ ...b, contacto: { ...(b.contacto || {}), [campo]: ev.target.value } }))} />
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 grid gap-3">
            <h4 className="text-xs font-semibold text-coop-negro uppercase tracking-wide">Títulos y bajadas de cada sección de la página</h4>
            <p className="text-xs text-slate-400 -mt-2">P. ej. «Cooperativas que ya crecen con CoopTech». Vacío = el texto por defecto de la web.</p>
            {TEXTOS_SECCIONES.map(({ clave, label }) => (
              <div key={clave} className="grid gap-1.5">
                <p className="text-xs text-slate-500">{label}</p>
                <input disabled={ro} className={inputCls} maxLength={80} placeholder="Título (≤80)" value={borrador.textos?.[clave]?.titulo || ''}
                  onChange={(ev) => tocar((b) => ({ ...b, textos: { ...(b.textos || {}), [clave]: { ...(b.textos?.[clave] || {}), titulo: ev.target.value } } }))} />
                <input disabled={ro} className={inputCls} maxLength={220} placeholder="Bajada (≤220, opcional)" value={borrador.textos?.[clave]?.bajada || ''}
                  onChange={(ev) => tocar((b) => ({ ...b, textos: { ...(b.textos || {}), [clave]: { ...(b.textos?.[clave] || {}), bajada: ev.target.value } } }))} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============ PRECIOS ============ */}
      {sec === 'precios' && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 max-w-md">
          <p className="text-sm text-slate-600 mb-3">Los precios monómicos se publican desde el <b>simulador CoopCloud</b> del CRM (botón «Publicar precios en la web», solo conducción). Acá se ve lo que la web está sirviendo ahora:</p>
          {monomicos === undefined ? <p className="text-sm text-slate-400">Cargando…</p>
            : !monomicos ? <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Todavía no se publicaron precios: la web usa sus valores por defecto.</p>
            : (
              <table className="w-full text-sm">
                <tbody>
                  {[['vCPU (por vCPU/mes)', 'vcpu'], ['RAM (por GB/mes)', 'ram'], ['SSD (por GB/mes)', 'ssd'], ['HDD (por GB/mes)', 'hdd'], ['IP pública (por IP/mes)', 'ip'], ['Ancho de banda (por Mbps/mes)', 'mbps']].map(([l, k]) => (
                    <tr key={k} className="border-b border-slate-100 last:border-0"><td className="py-1.5 text-slate-500">{l}</td><td className="py-1.5 text-right font-medium">US$ {monomicos[k]}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}

      {/* ============ MODAL: VER CAMBIOS ============ */}
      {verCambios && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-3" onMouseDown={(e) => e.target === e.currentTarget && setVerCambios(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-coop-negro">Borrador vs. {ultima ? `última publicación (v${ultima.numero})` : 'publicación (nunca se publicó)'}</h3>
              <button onClick={() => setVerCambios(false)} className="text-slate-500 hover:bg-slate-100 rounded px-2 py-1">✕</button>
            </div>
            <div className="grid gap-1.5">
              {cambios.map((c) => (
                <div key={c.label} className={`flex items-center justify-between text-sm rounded-lg px-3 py-2 ${c.igual ? 'bg-slate-50 text-slate-400' : 'bg-amber-50 text-amber-800'}`}>
                  <span>{c.label}{c.detalle && <span className="text-xs opacity-60"> · {c.detalle}</span>}</span>
                  <span className="text-xs">{c.igual ? 'sin cambios' : 'modificada'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============ MODAL: VERSIONES ============ */}
      {verVersiones && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-3" onMouseDown={(e) => e.target === e.currentTarget && setVerVersiones(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-coop-negro">Versiones publicadas</h3>
              <button onClick={() => setVerVersiones(false)} className="text-slate-500 hover:bg-slate-100 rounded px-2 py-1">✕</button>
            </div>
            {versiones === null ? <p className="text-sm text-slate-400">Cargando…</p>
              : versiones.length === 0 ? <p className="text-sm text-slate-300 text-center py-4">Nunca se publicó.</p>
              : (
                <div className="grid gap-1.5">
                  {versiones.map((v, i) => (
                    <div key={v.numero} className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-3 py-2">
                      <span className="font-medium">v{v.numero}</span>
                      <span className="text-xs text-slate-400">{new Date(v.createdAt).toLocaleString('es-AR')} · {v.publicadoPor || '—'}{v.notas && ` · ${v.notas}`}</span>
                      {i === 0 ? <span className="ml-auto text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">EN LA WEB</span>
                        : <button onClick={() => republicar(v.numero)} className="ml-auto text-xs text-coop-azul hover:underline">Republicar</button>}
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}

// Variante compacta del campo archivo (para filas de lista): solo el link.
function CampoArchivoInline({ valor, onChange, disabled }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-slate-400 truncate max-w-[200px]" title={valor?.nombre}>{valor?.nombre || 'sin logo'}</span>
      <button disabled={disabled} onClick={() => setAbierto(true)} className="text-coop-azul hover:underline disabled:opacity-40">Elegir…</button>
      {valor && <button disabled={disabled} onClick={() => onChange(null)} className="text-slate-400 hover:text-red-500 disabled:opacity-40">Quitar</button>}
      {abierto && <SelectorArchivo tipo="imagen" onElegir={(r) => { onChange(r); setAbierto(false); }} onCerrar={() => setAbierto(false)} />}
    </div>
  );
}
