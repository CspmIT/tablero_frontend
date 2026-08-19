import { useEffect, useRef, useState } from 'react';
import { useData } from '../data/DataContext.jsx';
import { getImage, saveImage } from '../api/minio.js';
// Visor PDF PROPIO con pdf.js (18/08): en Android el visor nativo embebido
// (iframe/embed) NO renderiza PDFs — el técnico de campo con celu es el caso
// principal de esta solapa, así que el PDF se dibuja en canvas dentro de la
// app y se ve igual en PC, Tauri y celular, sin descargar nada.
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Los PDF viven en el MISMO lugar que los binarios de firmware: el gateway
// storageov → MinIO (que digiere PDFs sin drama — es el formato que usamos
// para camuflar los .bin). El backend solo guarda la referencia en el modelo
// Archivo con este contexto. CERO migraciones.
// CARPETAS (18/08): la carpeta de cada PDF viaja en el campo `url` de su
// referencia (libre en este contexto); la lista de carpetas es una clave JSON
// en Configuracion (multivac_doc_carpetas) para que existan aunque estén vacías.
const CONTEXTO = 'multivac_doc';
const SIN_CARPETA = '(sin carpeta)';

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
// Búsqueda tolerante: sin tildes, sin mayúsculas (mismo criterio que los tags OV).
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const sha256Hex = async (buf) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)))
    .map((b) => b.toString(16).padStart(2, '0')).join('');

// ---------- Página individual: render perezoso (los manuales pueden tener
// cientos de páginas; solo se dibujan las que se acercan al viewport) --------
function PaginaPdf({ pdf, num, escala, anchoBase }) {
  const cajaRef = useRef(null);
  const canvasRef = useRef(null);
  const [visible, setVisible] = useState(num <= 2); // las 2 primeras, de una
  const [alto, setAlto] = useState(Math.round(anchoBase * escala * 1.414)); // placeholder A4

  useEffect(() => {
    if (visible) return;
    const el = cajaRef.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); }
    }, { rootMargin: '800px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !pdf) return;
    let cancelado = false;
    (async () => {
      const page = await pdf.getPage(num);
      const vp0 = page.getViewport({ scale: 1 });
      const scale = (anchoBase / vp0.width) * escala;
      const vp = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas || cancelado) return;
      // Nitidez en pantallas de celular (dpr 2-3): canvas físico más grande,
      // tope 2 para no reventar memoria con manuales largos.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(vp.width * dpr);
      canvas.height = Math.floor(vp.height * dpr);
      canvas.style.width = `${Math.floor(vp.width)}px`;
      canvas.style.height = `${Math.floor(vp.height)}px`;
      setAlto(Math.floor(vp.height));
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise;
    })().catch(() => { /* página que falla: queda el placeholder */ });
    return () => { cancelado = true; };
  }, [visible, pdf, num, escala, anchoBase]);

  return (
    <div ref={cajaRef} className="mx-auto mb-3 bg-white shadow border border-slate-200" style={{ width: Math.floor(anchoBase * escala), minHeight: visible ? undefined : alto }}>
      {visible ? <canvas ref={canvasRef} className="block" /> : (
        <div className="flex items-center justify-center text-xs text-slate-300" style={{ height: alto }}>página {num}…</div>
      )}
    </div>
  );
}

export default function MultivacDocs() {
  const { api, me } = useData();
  // Curaduría de la biblioteca (borrar, mover, carpetas): manager/gerencial.
  const puedeCurar = ['manager', 'gerencial'].includes(me?.tipo);

  const [docs, setDocs] = useState(null); // null = cargando
  const [carpetas, setCarpetas] = useState([]);
  const [error, setError] = useState('');
  const cargar = async () => {
    try {
      const [r, rc] = await Promise.all([
        api.archivos.list({ contexto: CONTEXTO }),
        api.multivac.docsCarpetas().catch(() => null), // backend viejo: sin carpetas, la solapa sigue
      ]);
      setDocs(Array.isArray(r?.data) ? r.data : []);
      if (rc && Array.isArray(rc.carpetas)) setCarpetas(rc.carpetas);
      setError('');
    } catch (e) { setDocs([]); setError(e.message || 'No se pudo cargar la biblioteca'); }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Carpetas visibles = las creadas + las que aparezcan en documentos (por si
  // se borró una de la lista con documentos adentro: nada queda inaccesible).
  const carpetasDeDocs = Array.from(new Set((docs || []).map((d) => (d.url || '').trim()).filter(Boolean)));
  const todasCarpetas = Array.from(new Set([...carpetas, ...carpetasDeDocs]));
  const carpetaDe = (d) => (d.url || '').trim();

  // ---------- Navegación: carpeta seleccionada + buscador ----------
  const [carpetaSel, setCarpetaSel] = useState(null); // null = Todas | SIN_CARPETA | nombre
  const [busqueda, setBusqueda] = useState('');
  const nb = norm(busqueda.trim());
  // El buscador manda: con texto, busca en TODAS las carpetas (título y carpeta).
  const visibles = (docs || []).filter((d) => {
    if (nb) return norm(d.nombre).includes(nb) || norm(carpetaDe(d)).includes(nb);
    if (carpetaSel === null) return true;
    if (carpetaSel === SIN_CARPETA) return !carpetaDe(d);
    return carpetaDe(d) === carpetaSel;
  });
  const cuenta = (c) => (docs || []).filter((d) => (c === SIN_CARPETA ? !carpetaDe(d) : carpetaDe(d) === c)).length;

  // ---------- Administración de carpetas (manager/gerencial) ----------
  const [nuevaCarpeta, setNuevaCarpeta] = useState('');
  const crearCarpeta = async () => {
    const nombre = nuevaCarpeta.trim();
    if (!nombre) return;
    if (todasCarpetas.some((c) => norm(c) === norm(nombre))) { setError(`La carpeta "${nombre}" ya existe.`); return; }
    try {
      const r = await api.multivac.guardarDocsCarpetas([...carpetas, nombre]);
      setCarpetas(Array.isArray(r?.carpetas) ? r.carpetas : [...carpetas, nombre]);
      setNuevaCarpeta(''); setCarpetaSel(nombre); setError('');
    } catch (e) { setError(e.message || 'No se pudo crear la carpeta'); }
  };
  const eliminarCarpeta = async (nombre) => {
    if (cuenta(nombre) > 0) { setError(`"${nombre}" tiene documentos: movelos antes de eliminarla.`); return; }
    try {
      const resto = carpetas.filter((c) => c !== nombre);
      const r = await api.multivac.guardarDocsCarpetas(resto);
      setCarpetas(Array.isArray(r?.carpetas) ? r.carpetas : resto);
      if (carpetaSel === nombre) setCarpetaSel(null);
      setError('');
    } catch (e) { setError(e.message || 'No se pudo eliminar la carpeta'); }
  };
  const mover = async (doc, destino) => {
    try {
      await api.archivos.update(doc.id, { url: destino || null });
      setDocs((ds) => (ds || []).map((d) => (d.id === doc.id ? { ...d, url: destino || null } : d)));
      setError('');
    } catch (e) { setError(e.message || 'No se pudo mover el documento'); }
  };

  // ---------- Subida (todos pueden subir) ----------
  const [archivoSel, setArchivoSel] = useState(null);
  const [titulo, setTitulo] = useState('');
  const [carpetaSubida, setCarpetaSubida] = useState('');
  const [subida, setSubida] = useState(null); // { txt, ok? } | { err }
  const inputRef = useRef(null);
  // Si estás parado en una carpeta, el PDF nuevo cae ahí por defecto.
  useEffect(() => { setCarpetaSubida(carpetaSel && carpetaSel !== SIN_CARPETA ? carpetaSel : ''); }, [carpetaSel]);

  const subir = async () => {
    const f = archivoSel;
    if (!f) return;
    if (!/\.pdf$/i.test(f.name)) { setSubida({ err: 'Solo PDF en esta biblioteca.' }); return; }
    setSubida({ txt: 'Subiendo al almacenamiento…' });
    try {
      const buf = await f.arrayBuffer();
      const sha256 = await sha256Hex(buf);
      const key = await saveImage(f);
      // Verificación de ida y vuelta (mismo patrón que los releases de
      // firmware): se baja lo recién subido y se compara la huella — si el
      // gateway alteró un bit, no se publica la referencia.
      setSubida({ txt: 'Verificando la copia subida…' });
      const objUrl = await getImage(key);
      const vuelta = await (await fetch(objUrl)).arrayBuffer();
      URL.revokeObjectURL(objUrl);
      if (await sha256Hex(vuelta) !== sha256) {
        throw new Error('El almacenamiento devolvió el PDF alterado (huella distinta). No se publicó — avisar a Juan (gateway storageov).');
      }
      await api.archivos.create({ key, nombre: (titulo.trim() || f.name), mime: 'application/pdf', tamano: f.size, contexto: CONTEXTO, url: carpetaSubida || undefined });
      setArchivoSel(null); setTitulo('');
      if (inputRef.current) inputRef.current.value = '';
      setSubida({ txt: `✓ "${titulo.trim() || f.name}" publicado${carpetaSubida ? ` en "${carpetaSubida}"` : ' en la biblioteca'}.`, ok: true });
      cargar();
    } catch (e) {
      const msg = /413|entity too large|Failed to fetch/i.test(e.message || '')
        ? `${e.message} — probablemente el PDF supera el límite del gateway de almacenamiento (pedir a Juan subir client_max_body_size).`
        : (e.message || 'No se pudo subir el PDF');
      setSubida({ err: msg });
    }
  };

  // ---------- Visor ----------
  const [docSel, setDocSel] = useState(null);     // referencia Archivo elegida
  const [visor, setVisor] = useState(null);       // {estado:'cargando'|'ok'|'error', pdf?, paginas?, msg?}
  const [escala, setEscala] = useState(1);
  const [anchoBase, setAnchoBase] = useState(700);
  const marcoRef = useRef(null);

  useEffect(() => {
    const medir = () => {
      const el = marcoRef.current;
      if (el) setAnchoBase(Math.max(280, Math.min(900, el.clientWidth - 16)));
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [docSel]);

  const abrir = async (doc) => {
    setDocSel(doc); setEscala(1); setVisor({ estado: 'cargando' });
    try {
      const objUrl = await getImage(doc.key);
      const data = await (await fetch(objUrl)).arrayBuffer();
      URL.revokeObjectURL(objUrl);
      const pdf = await pdfjsLib.getDocument({ data }).promise;
      setVisor({ estado: 'ok', pdf, paginas: pdf.numPages });
    } catch (e) {
      setVisor({ estado: 'error', msg: e.message || 'No se pudo abrir el PDF' });
    }
  };
  const cerrarVisor = () => {
    try { visor?.pdf?.destroy(); } catch { /* nada */ }
    setDocSel(null); setVisor(null);
  };

  // ---------- Borrado en 2 pasos (NUNCA confirm() nativo — lección 13/08) ----
  const [confirmandoId, setConfirmandoId] = useState(null);
  const borrar = async (doc) => {
    try {
      await api.archivos.remove(doc.id);
      setConfirmandoId(null);
      if (docSel?.id === doc.id) cerrarVisor();
      cargar();
    } catch (e) { setError(e.message || 'No se pudo eliminar'); setConfirmandoId(null); }
  };

  // =================== VISTA: VISOR ===================
  if (docSel) {
    return (
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button onClick={cerrarVisor} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-600 hover:border-coop-azul hover:text-coop-azul">← Biblioteca</button>
          <span className="text-sm font-medium text-slate-700 truncate max-w-[50vw]" title={docSel.nombre}>{docSel.nombre}</span>
          {carpetaDe(docSel) && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">📁 {carpetaDe(docSel)}</span>}
          {visor?.estado === 'ok' && <span className="text-xs text-slate-400">{visor.paginas} pág. · {fmtTam(docSel.tamano)}</span>}
          <span className="flex-1" />
          <div className="flex items-center gap-1">
            <button onClick={() => setEscala((e) => Math.max(0.6, +(e - 0.2).toFixed(1)))} className="w-8 h-8 rounded-lg border border-slate-300 bg-white text-slate-600 hover:border-coop-azul">−</button>
            <button onClick={() => setEscala(1)} className="px-2 h-8 rounded-lg border border-slate-300 bg-white text-xs text-slate-500 hover:border-coop-azul">{Math.round(escala * 100)}%</button>
            <button onClick={() => setEscala((e) => Math.min(3, +(e + 0.2).toFixed(1)))} className="w-8 h-8 rounded-lg border border-slate-300 bg-white text-slate-600 hover:border-coop-azul">＋</button>
          </div>
        </div>
        <div ref={marcoRef} className="bg-slate-100 border border-slate-200 rounded-xl p-2 overflow-auto" style={{ maxHeight: '75vh' }}>
          {visor?.estado === 'cargando' && <p className="text-sm text-slate-500 p-6 text-center">Cargando el documento…</p>}
          {visor?.estado === 'error' && <p className="text-sm text-red-600 p-6 text-center">{visor.msg}</p>}
          {visor?.estado === 'ok' && Array.from({ length: visor.paginas }, (_, i) => (
            <PaginaPdf key={i + 1} pdf={visor.pdf} num={i + 1} escala={escala} anchoBase={anchoBase} />
          ))}
        </div>
      </div>
    );
  }

  // =================== VISTA: BIBLIOTECA ===================
  return (
    <div className="space-y-4">
      {/* ---- 1 · Subir documentación (todos) ---- */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">1 · Subir documentación</h3>
        <p className="text-xs text-slate-500 mb-3">Manuales, hojas de datos y guías de uso frecuente, en PDF. Quedan compartidos para todo el equipo (también desde el celular). Ordenar y eliminar queda reservado a la conducción.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={(e) => { setArchivoSel(e.target.files?.[0] || null); setSubida(null); }}
            className="text-xs text-slate-600 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-slate-300 file:bg-white file:text-slate-600 file:text-xs" />
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título visible (opcional)"
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-52" />
          <select value={carpetaSubida} onChange={(e) => setCarpetaSubida(e.target.value)}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-600">
            <option value="">📁 Sin carpeta</option>
            {todasCarpetas.map((c) => <option key={c} value={c}>📁 {c}</option>)}
          </select>
          <button onClick={subir} disabled={!archivoSel || (subida && subida.txt && !subida.ok)}
            className="px-4 py-1.5 text-sm rounded-lg bg-coop-azul text-white disabled:opacity-40">Subir PDF</button>
        </div>
        {subida?.txt && <p className={`text-xs mt-2 ${subida.ok ? 'text-green-600' : 'text-slate-500'}`}>{subida.txt}</p>}
        {subida?.err && <p className="text-xs mt-2 text-red-600">{subida.err}</p>}
      </div>

      {/* ---- 2 · Biblioteca ---- */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-slate-700">2 · Biblioteca</h3>
          <span className="flex-1" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="🔍 Buscar en toda la biblioteca…"
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-64 max-w-full" />
        </div>

        {/* Carpetas como píldoras (mismo lenguaje que las solapas). El buscador
            recorre TODA la biblioteca, ignorando la carpeta seleccionada. */}
        {!nb && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {[{ id: null, label: `Todas (${(docs || []).length})` },
              ...todasCarpetas.map((c) => ({ id: c, label: `📁 ${c} (${cuenta(c)})` })),
              ...((docs || []).some((d) => !carpetaDe(d)) && todasCarpetas.length ? [{ id: SIN_CARPETA, label: `Sin carpeta (${cuenta(SIN_CARPETA)})` }] : []),
            ].map((c) => (
              <span key={c.id ?? '__todas__'} className="inline-flex items-center">
                <button onClick={() => setCarpetaSel(c.id)}
                  className={`px-3 py-1 text-xs rounded-full border whitespace-nowrap transition-colors ${carpetaSel === c.id ? 'bg-coop-azul text-white border-coop-azul font-medium' : 'bg-white text-slate-600 border-slate-200 hover:border-coop-azul hover:text-coop-azul'}`}>
                  {c.label}
                </button>
                {puedeCurar && c.id && c.id !== SIN_CARPETA && cuenta(c.id) === 0 && (
                  <button onClick={() => eliminarCarpeta(c.id)} title={`Eliminar carpeta vacía "${c.id}"`}
                    className="ml-0.5 w-5 h-5 text-[10px] rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50">✕</button>
                )}
              </span>
            ))}
            {puedeCurar && (
              <span className="inline-flex items-center gap-1 ml-1">
                <input value={nuevaCarpeta} onChange={(e) => setNuevaCarpeta(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') crearCarpeta(); }}
                  placeholder="Nueva carpeta…" className="border border-dashed border-slate-300 rounded-full px-3 py-1 text-xs w-32" />
                <button onClick={crearCarpeta} disabled={!nuevaCarpeta.trim()}
                  className="px-2.5 py-1 text-xs rounded-full border border-slate-300 bg-white text-slate-600 hover:border-coop-azul hover:text-coop-azul disabled:opacity-40">＋ Crear</button>
              </span>
            )}
          </div>
        )}

        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        {docs === null && <p className="text-sm text-slate-500">Cargando…</p>}
        {docs !== null && visibles.length === 0 && (
          <p className="text-sm text-slate-400">
            {nb ? `Sin resultados para "${busqueda.trim()}".` : carpetaSel ? 'Esta carpeta está vacía.' : 'Todavía no hay documentos. Subí el primero arriba.'}
          </p>
        )}
        {docs !== null && visibles.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {[...visibles].reverse().map((d) => (
              <li key={d.id} className="py-2 flex flex-wrap items-center gap-2">
                <button onClick={() => abrir(d)} className="text-sm text-coop-azul hover:underline text-left flex-1 min-w-[12rem] truncate" title={d.nombre}>
                  📄 {d.nombre}
                </button>
                {/* Con el buscador activo o mirando "Todas", cada resultado dice dónde vive. */}
                {(nb || carpetaSel === null) && carpetaDe(d) && (
                  <button onClick={() => { setBusqueda(''); setCarpetaSel(carpetaDe(d)); }}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200" title="Ir a la carpeta">📁 {carpetaDe(d)}</button>
                )}
                <span className="text-xs text-slate-400 whitespace-nowrap">{fmtTam(d.tamano)} · {fmtFecha(d.createdAt)}</span>
                <button onClick={() => abrir(d)} className="px-3 py-1 text-xs rounded-lg border border-slate-300 bg-white text-slate-600 hover:border-coop-azul hover:text-coop-azul">Ver</button>
                {puedeCurar && (
                  <select value={carpetaDe(d)} onChange={(e) => mover(d, e.target.value)} title="Mover a carpeta"
                    className="border border-slate-200 rounded-lg px-1.5 py-1 text-[11px] bg-white text-slate-500 max-w-[9rem]">
                    <option value="">Sin carpeta</option>
                    {todasCarpetas.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                {puedeCurar && (confirmandoId === d.id ? (
                  <span className="flex items-center gap-1">
                    <span className="text-xs text-red-600">¿Eliminar?</span>
                    <button onClick={() => borrar(d)} className="px-2 py-1 text-xs rounded-lg bg-red-600 text-white">Sí</button>
                    <button onClick={() => setConfirmandoId(null)} className="px-2 py-1 text-xs rounded-lg border border-slate-300 text-slate-500">No</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmandoId(d.id)} className="px-2 py-1 text-xs rounded-lg border border-red-200 text-red-500 hover:bg-red-50">Eliminar</button>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
