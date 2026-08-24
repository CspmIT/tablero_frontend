// Inbox → solapa Tickets (20/08) — mini sistema de tickets espejo de la Mesa
// de ayuda de la cooperativa (mismos campos y estados que su formulario).
// La carga puede ser MANUAL (el equipo digitaliza los reclamos del WhatsApp de
// guardia) o AUTOMÁTICA: el conector de la Mesa de ayuda (24/08) trae los
// tickets del área «Oficina Virtual» cada 5 minutos vía la API de Guillermo
// (origen=mesa_ayuda, upsert por externalId). La config del conector (URL +
// token) la cargan los gestores desde el botón ⚙ de esta vista; el token vive
// SOLO en el backend.
// Extra nuestro: clasificación OV (tipo × causa, alimenta Métricas OV),
// categoría de falla a/b/c (mandato M1) y vínculo a un ítem de grilla
// (antidoble-conteo: manda el ticket, el ítem aporta las horas).
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Paperclip, Send, Trash2, Link2, MessageSquare, Download, Pencil } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';
import { getImage, saveImage } from '../api/minio.js';
import { comprimirImagen } from '../lib/comprimirImagen.js';

const ESTADOS = {
  abierto:    { label: 'Abierto',    cls: 'bg-slate-100 text-slate-600',    dot: 'bg-slate-400' },
  en_proceso: { label: 'En proceso', cls: 'bg-amber-100 text-amber-700',    dot: 'bg-amber-400' },
  resuelto:   { label: 'Resuelto',   cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  cerrado:    { label: 'Cerrado',    cls: 'bg-slate-200 text-slate-500',    dot: 'bg-slate-300' },
};
const ORDEN_ESTADOS = ['abierto', 'en_proceso', 'resuelto', 'cerrado'];
const TIPOS_MESA = ['Incidente', 'Solicitud'];             // desplegable TIPO de la Mesa de ayuda
const PRIORIDADES = ['Baja', 'Media', 'Alta', 'Urgente'];  // desplegable PRIORIDAD
const ORIGEN = {
  manual:     { label: 'Manual',        cls: 'bg-slate-100 text-slate-500' },
  whatsapp:   { label: 'WhatsApp',      cls: 'bg-emerald-50 text-emerald-600' },
  mesa_ayuda: { label: 'Mesa de ayuda', cls: 'bg-blue-50 text-blue-600' },
};
const OV_TIPO_LABEL = { incidente: 'Incidente', solicitud: 'Solicitud' };
const OV_CAUSA_LABEL = { ov_interna: 'Falla OV (interna)', interna_otra: 'Otra causa interna', procoop: 'Procoop', terceros: 'Terceros' };
const CAT_LABEL = { a: 'a · Desarrollo propio', b: 'b · Integración ERP', c: 'c · Botón de pago' };

const dstr = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

const FORM_DEF = {
  sector: '', titulo: '', tipo: 'Incidente', prioridad: 'Media', copiarA: '',
  descripcion: '', solicitante: '', origen: 'whatsapp', ocurridoAt: '',
  ovTipo: '', ovCausa: '', categoriaFalla: '',
};

export default function TicketsInbox() {
  const { api, me } = useData();
  const esGestor = ['manager', 'gerencial'].includes(me?.tipo);
  const [tickets, setTickets] = useState(null);
  const [filtro, setFiltro] = useState('todos');
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);      // FORM_DEF | null
  const [detalle, setDetalle] = useState(null); // ticket abierto (panel)
  const [colabs, setColabs] = useState([]);
  // Orden (20/08, feedback de Juan: las cargas retroactivas del WhatsApp
  // desordenan la lista). Default: fecha REAL del reclamo (ocurridoAt||createdAt).
  const [orden, setOrden] = useState('fecha'); // fecha | carga
  const [errorGlobal, setErrorGlobal] = useState('');
  // Conector Mesa de ayuda (24/08): estado + config (gestores) + sincronizar.
  const [sync, setSync] = useState(null);        // estado del conector | null
  const [syncCfg, setSyncCfg] = useState(null);  // modal config { url, token, area } | null
  const [sincronizando, setSincronizando] = useState(false);
  useEffect(() => {
    if (esGestor) api.tickets.syncEstado().then(setSync).catch(() => {}); // backend viejo: sin conector
  }, [api, esGestor]);
  const sincronizar = async () => {
    setSincronizando(true);
    try {
      const r = await api.tickets.syncAhora();
      if (r?.error) setErrorGlobal(`Sincronización: ${r.error}`);
      await cargar();
      api.tickets.syncEstado().then(setSync).catch(() => {});
    } catch (e) { setErrorGlobal(e.message || 'No se pudo sincronizar'); }
    finally { setSincronizando(false); }
  };
  const guardarSyncCfg = async () => {
    try {
      const r = await api.tickets.syncConfig({
        url: syncCfg.url,
        area: syncCfg.area,
        ...(syncCfg.token.trim() ? { token: syncCfg.token.trim() } : {}), // vacío = conservar el guardado
      });
      setSync(r); setSyncCfg(null);
    } catch (e) { setErrorGlobal(e.message || 'No se pudo guardar la configuración'); }
  };

  const cargar = useCallback(async () => {
    try { const r = await api.tickets.list(); setTickets(r.tickets || []); }
    catch { setTickets([]); }
  }, [api]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    api.colaboradores.list?.().then((r) => setColabs((r.data || r || []).filter((c) => c.activo !== false))).catch(() => {});
  }, [api]);

  const lista = tickets || [];
  const porEstado = useMemo(() => {
    const c = { todos: lista.length };
    for (const e of ORDEN_ESTADOS) c[e] = lista.filter((t) => t.estado === e).length;
    return c;
  }, [lista]);
  const sinResolver = lista.filter((t) => ['abierto', 'en_proceso'].includes(t.estado)).length;

  const visibles = lista.filter((t) => {
    if (filtro !== 'todos' && t.estado !== filtro) return false;
    if (q.trim()) {
      const n = norm(q);
      return [t.titulo, t.descripcion, t.solicitante, t.sector, `#${t.id}`].some((x) => norm(x).includes(n));
    }
    return true;
  }).sort((a, b) => (orden === 'carga'
    ? b.id - a.id
    : String(b.ocurridoAt || b.createdAt || '').localeCompare(String(a.ocurridoAt || a.createdAt || '')) || b.id - a.id));

  const patch = async (t, body) => {
    try {
      const { mesaAviso, ...r } = await api.tickets.update(t.id, body);
      setTickets((ls) => ls.map((x) => (x.id === t.id ? { ...x, ...r } : x)));
      if (detalle?.id === t.id) setDetalle((d) => ({ ...d, ...r }));
      // Ciclo completo (24/08): si el estado no llegó a la Mesa de ayuda, avisar
      // — la próxima sincronización podría volver a traer el estado viejo.
      if (mesaAviso && !mesaAviso.ok && mesaAviso.motivo !== 'sin_config') {
        setErrorGlobal(`El estado se guardó acá pero NO llegó a la Mesa de ayuda (${mesaAviso.motivo}) — puede volver a abrirse en la próxima sincronización. Reintentá cambiando el estado de nuevo.`);
      }
      return true;
    } catch (e) { setErrorGlobal(e.message || 'No se pudo actualizar'); return false; }
  };

  return (
    <div>
      {/* ── Barra: chips de estado (como "Mis tickets" de la Mesa de ayuda) + buscador + nuevo ── */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {['todos', ...ORDEN_ESTADOS].map((e) => {
          const est = ESTADOS[e];
          return (
            <button key={e} onClick={() => setFiltro(e)}
              className={`px-3 py-1 rounded-full text-xs flex items-center gap-1.5 border ${filtro === e ? 'bg-coop-azul text-white border-coop-azul' : `bg-white border-slate-200 text-slate-600 hover:border-coop-azul`}`}>
              {est && <span className={`w-2 h-2 rounded-full ${filtro === e ? 'bg-white/70' : est.dot}`} />}
              {e === 'todos' ? 'Todos' : est.label} · {porEstado[e] ?? 0}
            </button>
          );
        })}
        <span className="text-xs text-slate-400">{sinResolver} sin resolver</span>
        <div className="flex-1" />
        {esGestor && sync && (
          <span className="flex items-center gap-1">
            <button onClick={sincronizar} disabled={sincronizando || !sync.configurado}
              title={sync.configurado
                ? `Traer ahora los tickets del área ${sync.area} de la Mesa de ayuda${sync.ultimo ? ` · última: ${sync.ultimo.ok ? '✓' : '✗'} ${String(sync.ultimo.fin || '').slice(0, 16).replace('T', ' ')} (+${sync.ultimo.creados}/${sync.ultimo.actualizados})` : ''}`
                : 'Configurá URL y token de la Mesa de ayuda (engranaje)'}
              className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 bg-white text-slate-600 hover:border-coop-azul hover:text-coop-azul disabled:opacity-40">
              {sincronizando ? '⟳ Sincronizando…' : `⟳ Mesa de ayuda${sync.ultimo && !sync.ultimo.ok ? ' ⚠' : ''}`}
            </button>
            <button onClick={() => setSyncCfg({ url: sync.url || '', token: '', area: sync.area || 'Oficina Virtual' })}
              title="Configurar el conector (URL + token)"
              className="px-2 py-1 text-xs rounded-lg border border-slate-200 text-slate-400 hover:border-coop-azul hover:text-coop-azul">⚙</button>
          </span>
        )}
        <select value={orden} onChange={(e) => setOrden(e.target.value)} title="Ordenar la lista"
          className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-600">
          <option value="fecha">Por fecha del reclamo</option>
          <option value="carga">Por N° de carga</option>
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ticket…"
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-44" />
        <button onClick={() => setForm({ ...FORM_DEF })}
          className="bg-coop-naranja text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90">+ Nuevo ticket</button>
      </div>
      <p className="text-xs text-slate-400 mb-3">
        Digitalizá acá los reclamos que llegan por el WhatsApp de guardia o que el cliente interno no cargó en la Mesa de ayuda.
        Con el conector configurado (⟳), los tickets del área «Oficina Virtual» de la Mesa de ayuda entran solos cada 5 minutos.
      </p>
      {errorGlobal && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 flex items-center justify-between gap-2">
          <span>{errorGlobal}</span>
          <button onClick={() => setErrorGlobal('')} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {tickets !== null && lista.length === 0 && (
        <div className="text-center text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl p-8">
          Sin tickets todavía. Cargá el primero con «+ Nuevo ticket».
        </div>
      )}

      {/* ── Lista ── */}
      <div className="space-y-2">
        {visibles.map((t) => {
          const est = ESTADOS[t.estado] || ESTADOS.abierto;
          const org = ORIGEN[t.origen] || ORIGEN.manual;
          const clasificado = t.ovTipo && t.ovCausa;
          const faltaCat = t.ovTipo === 'incidente' && !t.categoriaFalla;
          return (
            <div key={t.id} className="bg-white rounded-xl border border-slate-200 p-3.5 cursor-pointer hover:border-coop-azul/50"
              onClick={() => setDetalle(t)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-400">#{t.id}</span>
                    <span className="font-medium text-slate-800 break-words">{t.titulo}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${est.cls}`}>{est.label}</span>
                    <span className={`text-[10.5px] px-1.5 py-0.5 rounded ${org.cls}`}>{org.label}</span>
                    {t.prioridad === 'Alta' || t.prioridad === 'Urgente' ? (
                      <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-red-50 text-red-600">{t.prioridad}</span>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t.solicitante ? `${t.solicitante} · ` : ''}{t.sector ? `${t.sector} · ` : ''}
                    {dstr(t.ocurridoAt || t.createdAt)}{t.asignadoA ? ` · asignado a ${t.asignadoA}` : ''}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {clasificado ? (
                      <>
                        <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-coop-azul/10 text-coop-azul">{OV_TIPO_LABEL[t.ovTipo]}</span>
                        <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-coop-azul/10 text-coop-azul">{OV_CAUSA_LABEL[t.ovCausa]}</span>
                        {t.categoriaFalla && <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{CAT_LABEL[t.categoriaFalla]}</span>}
                      </>
                    ) : (
                      <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">Sin clasificar (no suma a Métricas OV)</span>
                    )}
                    {faltaCat && <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">Falta categoría a/b/c (reporte semanal)</span>}
                    {t.grillaItemId && <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 flex items-center gap-1"><Link2 size={10} /> vinculado a grilla</span>}
                  </div>
                </div>
                <select value={t.estado} onClick={(e) => e.stopPropagation()}
                  onChange={(e) => patch(t, { estado: e.target.value })}
                  className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600 shrink-0">
                  {ORDEN_ESTADOS.map((e) => <option key={e} value={e}>{ESTADOS[e].label}</option>)}
                </select>
              </div>
            </div>
          );
        })}
      </div>

      {/* Config del conector Mesa de ayuda (gestores). El token se escribe pero
          nunca se relee: el campo vacío significa «conservar el guardado». */}
      {syncCfg && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setSyncCfg(null)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-1">Conector Mesa de ayuda</h3>
            <p className="text-xs text-slate-400 mb-3">Los datos que te pase Guillermo. El token queda guardado en el servidor y no vuelve a mostrarse.</p>
            <div className="space-y-2.5">
              <div>
                <label className="text-xs font-medium text-slate-500">URL de la Mesa</label>
                <input value={syncCfg.url} onChange={(e) => setSyncCfg((c) => ({ ...c, url: e.target.value }))}
                  placeholder="https://mesadeayuda.coopmorteros.coop" className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Token {sync?.tieneToken && <span className="text-emerald-600">(hay uno guardado — dejá vacío para conservarlo)</span>}</label>
                <input type="password" value={syncCfg.token} onChange={(e) => setSyncCfg((c) => ({ ...c, token: e.target.value }))}
                  placeholder={sync?.tieneToken ? '••••••••' : 'Bearer token de servicio'} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Área a traer</label>
                <input value={syncCfg.area} onChange={(e) => setSyncCfg((c) => ({ ...c, area: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
              </div>
              {sync?.ultimo && (
                <p className={`text-xs ${sync.ultimo.ok ? 'text-slate-400' : 'text-red-500'}`}>
                  Última corrida ({sync.ultimo.disparo}): {sync.ultimo.ok ? `✓ ${sync.ultimo.creados} nuevos, ${sync.ultimo.actualizados} actualizados` : `✗ ${sync.ultimo.error}`}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setSyncCfg(null)} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-500">Cancelar</button>
              <button onClick={guardarSyncCfg} disabled={!syncCfg.url.trim()} className="px-3 py-1.5 text-sm rounded-lg bg-coop-azul text-white disabled:opacity-40">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {form && <NuevoTicketModal api={api} form={form} setForm={setForm} onDone={() => { setForm(null); cargar(); }} />}
      {detalle && (
        <DetalleTicket api={api} me={me} esGestor={esGestor} colabs={colabs}
          ticket={detalle} onPatch={patch} onClose={() => setDetalle(null)}
          onDelete={async () => { setDetalle(null); await cargar(); }} />
      )}
    </div>
  );
}

// ─────────────────────────── Alta manual (espejo de la Mesa de ayuda) ───────────────────────────
function NuevoTicketModal({ api, form, setForm, onDone }) {
  const [archivos, setArchivos] = useState([]);   // File[] (hasta 5)
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm({ ...form, [k]: v });
  const ok = form.titulo.trim() && form.descripcion.trim();

  const crear = async () => {
    setCreando(true); setError('');
    try {
      const t = await api.tickets.create({ ...form, ovTipo: form.ovTipo || undefined, ovCausa: form.ovCausa || undefined, categoriaFalla: form.categoriaFalla || undefined, ocurridoAt: form.ocurridoAt || undefined });
      // Adjuntos: al gateway (misma vía que Documentación) + referencia con contexto 'ticket'.
      // Las imágenes se comprimen antes de subir (20/08, sugerencia de Juan).
      for (const f0 of archivos.slice(0, 5)) {
        try {
          const f = await comprimirImagen(f0);
          const key = await saveImage(f);
          await api.archivos.create({ key, nombre: f.name, mime: f.type || null, tamano: f.size, contexto: 'ticket', url: `ticket:${t.id}` });
        } catch { setError((e) => e || 'El ticket se creó pero algún adjunto no se pudo subir — reintentá desde el detalle.'); }
      }
      onDone();
    } catch (e) { setError(e.message || 'No se pudo crear el ticket'); }
    finally { setCreando(false); }
  };

  const campo = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm';
  const label = 'block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1';
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setForm(null)}>
      <div className="bg-white rounded-xl w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-1">Nuevo ticket</h3>
        <p className="text-xs text-slate-400 mb-4">Mismos campos que la Mesa de ayuda de la cooperativa + la clasificación nuestra.</p>
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>Solicitante (cliente interno)</label>
              <input value={form.solicitante} onChange={(e) => set('solicitante', e.target.value)} placeholder="Quién reclama / pide" className={campo} />
            </div>
            <div>
              <label className={label}>Su sector</label>
              <input value={form.sector} onChange={(e) => set('sector', e.target.value)} placeholder="Ej: ADMINISTRACIÓN" className={campo} />
            </div>
          </div>
          <div>
            <label className={label}>Título</label>
            <input value={form.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="Resumí el problema en una línea" className={campo} />
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className={label}>Tipo</label>
              <select value={form.tipo} onChange={(e) => set('tipo', e.target.value)} className={campo}>
                {TIPOS_MESA.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Prioridad</label>
              <select value={form.prioridad} onChange={(e) => set('prioridad', e.target.value)} className={campo}>
                {PRIORIDADES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Área que lo resolverá</label>
              <input value="Oficina Virtual" disabled className={`${campo} bg-slate-50 text-slate-400`} />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>Cómo llegó</label>
              <select value={form.origen} onChange={(e) => set('origen', e.target.value)} className={campo}>
                <option value="whatsapp">WhatsApp de guardia</option>
                <option value="manual">Otro canal (mail, pasillo…)</option>
              </select>
            </div>
            <div>
              <label className={label}>Fecha real del reclamo (si no es hoy)</label>
              <input type="date" value={form.ocurridoAt} onChange={(e) => set('ocurridoAt', e.target.value)} className={campo} />
            </div>
          </div>
          <div>
            <label className={label}>Copiar a <span className="normal-case font-normal">(opcional, emails separados por coma)</span></label>
            <input value={form.copiarA} onChange={(e) => set('copiarA', e.target.value)} placeholder="persona@coopmorteros.coop" className={campo} />
          </div>
          <div>
            <label className={label}>Descripción</label>
            <textarea rows={4} value={form.descripcion} onChange={(e) => set('descripcion', e.target.value)}
              placeholder="Contá qué pasa, desde cuándo, en qué equipo/sector…" className={campo} />
          </div>
          <div>
            <label className={label}>Adjuntos (opcional)</label>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 cursor-pointer hover:border-coop-azul flex items-center gap-1.5 text-slate-600">
                <Paperclip size={14} /> Adjuntar archivos
                <input type="file" multiple accept="image/*,application/pdf" className="hidden"
                  onChange={(e) => setArchivos((a) => [...a, ...Array.from(e.target.files || [])].slice(0, 5))} />
              </label>
              <span className="text-xs text-slate-400">Imágenes o PDF · hasta 5</span>
            </div>
            {archivos.length > 0 && (
              <div className="mt-1.5 flex gap-1.5 flex-wrap">
                {archivos.map((f, i) => (
                  <span key={i} className="text-xs bg-slate-100 rounded px-2 py-1 flex items-center gap-1.5">
                    {f.name}
                    <button onClick={() => setArchivos((a) => a.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500">✕</button>
                  </span>
                ))}
              </div>
            )}
          </div>
          {/* Clasificación nuestra (alimenta Métricas OV) */}
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Clasificación OV (alimenta las métricas — se puede hacer después)</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <select value={form.ovTipo} onChange={(e) => set('ovTipo', e.target.value)} className={campo}>
                <option value="">Tipo OV…</option>
                {Object.entries(OV_TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select value={form.ovCausa} onChange={(e) => set('ovCausa', e.target.value)} className={campo}>
                <option value="">Causa…</option>
                {Object.entries(OV_CAUSA_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select value={form.categoriaFalla} onChange={(e) => set('categoriaFalla', e.target.value)} className={campo}
                disabled={form.ovTipo !== 'incidente'} title={form.ovTipo !== 'incidente' ? 'Solo para incidentes' : ''}>
                <option value="">Categoría (mandato)…</option>
                {Object.entries(CAT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
        </div>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setForm(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
          <button onClick={crear} disabled={!ok || creando}
            className="px-5 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90 disabled:opacity-40">
            {creando ? 'Creando…' : 'Crear ticket'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Detalle: hilo, adjuntos, clasificación y vínculo ───────────────────────────
function DetalleTicket({ api, me, esGestor, colabs, ticket, onPatch, onClose, onDelete }) {
  const t = ticket;
  const [mensajes, setMensajes] = useState(null);
  const [texto, setTexto] = useState('');
  const [adjuntos, setAdjuntos] = useState([]);
  const [confirmaBorrar, setConfirmaBorrar] = useState(false);
  const [vinculo, setVinculo] = useState(null); // null | { candidatos, cargando }
  const [err, setErr] = useState('');
  // Edición del texto (20/08, feedback de Juan: errores ortográficos): solo el
  // autor que digitalizó + manager/gerencial (el backend acompaña con 403).
  const puedeEditarTexto = esGestor || (t.creadoPorId != null && t.creadoPorId === me?.colaboradorId);
  const [editando, setEditando] = useState(null); // null | { titulo, descripcion }
  const guardarTexto = async () => {
    const tit = editando.titulo.trim(), desc = editando.descripcion.trim();
    if (!tit || !desc) { setErr('El título y la descripción no pueden quedar vacíos.'); return; }
    const ok = await onPatch(t, { titulo: tit, descripcion: desc });
    if (ok) { setEditando(null); setErr(''); }
  };

  useEffect(() => {
    api.tickets.get(t.id).then((r) => setMensajes(r.mensajes || [])).catch(() => setMensajes([]));
    api.archivos.list({ contexto: 'ticket' }).then((r) => {
      const todos = r.data || r.archivos || r || [];
      setAdjuntos((Array.isArray(todos) ? todos : []).filter((a) => a.url === `ticket:${t.id}`));
    }).catch(() => {});
  }, [api, t.id]);

  const enviarMensaje = async () => {
    if (!texto.trim()) return;
    try {
      const m = await api.tickets.mensaje(t.id, texto.trim());
      setMensajes((ms) => [...(ms || []), m]); setTexto('');
    } catch (e) { setErr(e.message || 'No se pudo enviar'); }
  };

  const verAdjunto = async (a) => {
    try {
      const url = await getImage(a.key);
      const w = window.open(url, '_blank');
      if (!w) setErr('El navegador bloqueó la ventana — habilitá popups para ver el adjunto.');
    } catch { setErr('No se pudo descargar el adjunto'); }
  };

  const subirAdjunto = async (files) => {
    for (const f0 of Array.from(files || []).slice(0, 5 - adjuntos.length)) {
      try {
        const f = await comprimirImagen(f0); // imágenes se achican antes de subir
        const key = await saveImage(f);
        const ref = await api.archivos.create({ key, nombre: f.name, mime: f.type || null, tamano: f.size, contexto: 'ticket', url: `ticket:${t.id}` });
        setAdjuntos((as) => [...as, ref]);
      } catch (e) { setErr(e.message || `No se pudo subir ${f.name}`); }
    }
  };

  // Vincular a ítem de grilla: candidatos = ítems OV/Coopmorteros ±10 días de la fecha del ticket.
  const abrirVinculo = async () => {
    setVinculo({ candidatos: null });
    try {
      const base = new Date(t.ocurridoAt || t.createdAt);
      const d = (n) => new Date(base.getTime() + n * 86400000).toISOString().slice(0, 10);
      const r = await api.analisisOv.tickets(d(-10), d(10));
      setVinculo({ candidatos: (r.tickets || []).filter((x) => (x.origen || 'grilla') === 'grilla' && !x.ovDescartado) });
    } catch { setVinculo({ candidatos: [] }); }
  };

  const label = 'text-xs font-medium text-slate-500 uppercase tracking-wide';
  const sel = 'border border-slate-300 rounded-lg px-2 py-1.5 text-sm';
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="font-semibold flex items-center gap-2 min-w-0">
            <span className="break-words">#{t.id} · {t.titulo}</span>
            {puedeEditarTexto && !editando && (
              <button onClick={() => setEditando({ titulo: t.titulo, descripcion: t.descripcion })}
                title="Corregir título y descripción" className="text-slate-300 hover:text-coop-azul shrink-0">
                <Pencil size={14} />
              </button>
            )}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          {(ORIGEN[t.origen] || ORIGEN.manual).label} · {t.solicitante || 'sin solicitante'}{t.sector ? ` (${t.sector})` : ''} ·
          {' '}{dstr(t.ocurridoAt || t.createdAt)} · {t.tipo} · prioridad {t.prioridad}
          {t.creadoPor ? ` · digitalizó ${t.creadoPor}` : ''}
        </p>
        {err && (
          <div className="mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 flex items-center justify-between gap-2">
            <span>{err}</span>
            <button onClick={() => setErr('')} className="text-red-400 hover:text-red-600">✕</button>
          </div>
        )}
        {editando ? (
          <div className="border border-coop-azul/40 rounded-lg p-3 mb-3 space-y-2 bg-blue-50/30">
            <input value={editando.titulo} onChange={(e) => setEditando((ed) => ({ ...ed, titulo: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-medium" placeholder="Título" />
            <textarea value={editando.descripcion} onChange={(e) => setEditando((ed) => ({ ...ed, descripcion: e.target.value }))}
              rows={5} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" placeholder="Descripción" />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setEditando(null); setErr(''); }} className="px-3 py-1 text-xs rounded-lg border border-slate-300 text-slate-500">Cancelar</button>
              <button onClick={guardarTexto} className="px-3 py-1 text-xs rounded-lg bg-coop-azul text-white">Guardar</button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-700 whitespace-pre-wrap break-words bg-slate-50 border border-slate-100 rounded-lg p-3 mb-3">{t.descripcion}</p>
        )}
        {t.copiarA && <p className="text-xs text-slate-400 mb-3">Copiar a: {t.copiarA}</p>}

        {/* Estado + asignación */}
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <div>
            <span className={label}>Estado </span>
            <select value={t.estado} onChange={(e) => onPatch(t, { estado: e.target.value })} className={sel}>
              {ORDEN_ESTADOS.map((e) => <option key={e} value={e}>{ESTADOS[e].label}</option>)}
            </select>
          </div>
          <div>
            <span className={label}>Asignado a </span>
            <select value={t.asignadoAId || ''} className={sel}
              onChange={(e) => onPatch(t, { asignadoAId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Sin asignar</option>
              {esGestor
                ? colabs.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)
                : <option value={me?.colaboradorId}>Yo</option>}
            </select>
          </div>
          {t.resueltoAt && <span className="text-xs text-slate-400">Resuelto el {dstr(t.resueltoAt)}</span>}
        </div>

        {/* Clasificación OV */}
        <div className="border border-slate-100 rounded-lg p-3 mb-3">
          <p className={`${label} mb-2`}>Clasificación OV (alimenta Métricas Oficina Virtual)</p>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={t.ovTipo || ''} onChange={(e) => onPatch(t, { ovTipo: e.target.value || null })} className={sel}>
              <option value="">Tipo…</option>
              {Object.entries(OV_TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={t.ovCausa || ''} onChange={(e) => onPatch(t, { ovCausa: e.target.value || null })} className={sel}>
              <option value="">Causa…</option>
              {Object.entries(OV_CAUSA_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={t.categoriaFalla || ''} onChange={(e) => onPatch(t, { categoriaFalla: e.target.value || null })}
              className={sel} disabled={t.ovTipo !== 'incidente'}>
              <option value="">Categoría a/b/c…</option>
              {Object.entries(CAT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          {!(t.ovTipo && t.ovCausa) && <p className="text-[11px] text-amber-600 mt-1.5">Sin tipo y causa el ticket no suma a las métricas.</p>}
          {t.ovTipo === 'incidente' && !t.categoriaFalla && <p className="text-[11px] text-amber-600 mt-1">La categoría a/b/c hace falta para el reporte semanal a Gerencia.</p>}

          {/* Vínculo a ítem de grilla */}
          <div className="mt-2 pt-2 border-t border-slate-100">
            {t.grillaItemId ? (
              <p className="text-xs text-emerald-600 flex items-center gap-1.5">
                <Link2 size={12} /> Vinculado a un ítem de grilla (cuenta uno solo; el ítem aporta las horas).
                <button onClick={() => onPatch(t, { grillaEntradaId: null, grillaItemId: null })} className="text-slate-400 hover:text-red-500 underline">Desvincular</button>
              </p>
            ) : vinculo ? (
              <div>
                <p className="text-xs text-slate-500 mb-1">Elegí el ítem de grilla que corresponde a este mismo caso (±10 días):</p>
                {vinculo.candidatos === null ? <p className="text-xs text-slate-400">Buscando…</p>
                  : vinculo.candidatos.length === 0 ? <p className="text-xs text-slate-400">No hay ítems candidatos en ese rango. <button onClick={() => setVinculo(null)} className="underline">cerrar</button></p>
                  : (
                    <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
                      {vinculo.candidatos.map((c) => (
                        <button key={c.itemId} onClick={async () => { await onPatch(t, { grillaEntradaId: c.entradaId, grillaItemId: c.itemId }); setVinculo(null); }}
                          className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-slate-50">
                          <span className="text-slate-700">{c.text}</span>
                          <span className="text-slate-400"> · {c.colaborador} · {dstr(c.fecha)} · {c.horas} h{c.horasReales ? '' : ' (est.)'}</span>
                        </button>
                      ))}
                    </div>
                  )}
              </div>
            ) : (
              <button onClick={abrirVinculo} className="text-xs text-coop-azul hover:underline flex items-center gap-1">
                <Link2 size={12} /> Vincular a un ítem de grilla (evita el doble conteo)
              </button>
            )}
          </div>
        </div>

        {/* Adjuntos */}
        <div className="mb-3">
          <p className={`${label} mb-1.5`}>Adjuntos</p>
          <div className="flex items-center gap-2 flex-wrap">
            {adjuntos.map((a) => (
              <button key={a.id} onClick={() => verAdjunto(a)}
                className="text-xs bg-slate-100 hover:bg-slate-200 rounded px-2 py-1 flex items-center gap-1.5" title="Ver / descargar">
                <Download size={11} /> {a.nombre}
              </button>
            ))}
            {adjuntos.length < 5 && (
              <label className="text-xs border border-dashed border-slate-300 rounded px-2 py-1 cursor-pointer text-slate-500 hover:border-coop-azul flex items-center gap-1">
                <Paperclip size={11} /> agregar
                <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => subirAdjunto(e.target.files)} />
              </label>
            )}
          </div>
        </div>

        {/* Hilo de mensajes */}
        <div className="mb-2">
          <p className={`${label} mb-1.5 flex items-center gap-1`}><MessageSquare size={12} /> Mensajes</p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {(mensajes || []).map((m) => (
              <div key={m.id} className="text-sm bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
                <p className="text-[10.5px] text-slate-400">{m.autor || 'externo'} · {dstr(m.createdAt)}</p>
                <p className="text-slate-700 whitespace-pre-wrap break-words">{m.texto}</p>
              </div>
            ))}
            {mensajes !== null && mensajes.length === 0 && <p className="text-xs text-slate-300">Sin mensajes.</p>}
          </div>
          <div className="flex gap-2 mt-2">
            <input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enviarMensaje()}
              placeholder="Escribí una novedad del ticket…" className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
            <button onClick={enviarMensaje} disabled={!texto.trim()}
              className="px-3 py-1.5 bg-coop-azul text-white rounded-lg text-sm disabled:opacity-40"><Send size={14} /></button>
          </div>
        </div>

        {esGestor && (
          <div className="flex justify-end pt-2 border-t border-slate-100">
            {confirmaBorrar ? (
              <span className="text-xs text-red-600 flex items-center gap-2">
                ¿Borrar el ticket #{t.id} y sus mensajes?
                <button onClick={async () => { try { await api.tickets.del(t.id); onDelete(); } catch (e) { setErr(e.message || 'No se pudo borrar'); } }}
                  className="bg-red-600 text-white rounded px-2 py-1">Sí, borrar</button>
                <button onClick={() => setConfirmaBorrar(false)} className="text-slate-500 underline">Cancelar</button>
              </span>
            ) : (
              <button onClick={() => setConfirmaBorrar(true)} className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1">
                <Trash2 size={12} /> Borrar ticket
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
