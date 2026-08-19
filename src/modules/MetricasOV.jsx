// Métricas Oficina Virtual (ola 1, 18/08) — pedido de Gerencia de Operaciones.
// Diseño congelado: OficinaVirtual_tickets_diseno_18_08.md + maqueta validada.
// Tres vistas: Tablero ejecutivo (7 KPIs + 6 gráficas) · Bandeja de
// clasificación (con sugerencias por palabras clave) · Detalle (control
// cruzado). Unidad: 1 ítem de grilla = 1 ticket (mide intervenciones).
// Horas: reales si el ítem las tiene; el resto prorrateo de la jornada
// (calculado en el backend) — SIEMPRE etiquetado como estimación.
// Nada entra al tablero sin clasificar: el KPI "Sin clasificar" evita que
// el tablero mienta por omisión.
import { useEffect, useMemo, useState } from 'react';
import { useData } from '../data/DataContext.jsx';

// Paleta institucional validada (diseño §9) — orden FIJO por causa.
const CAUSAS = [
  { id: 'ov_interna', label: 'Operación interna OV', color: '#3F5BD6' },
  { id: 'interna_otra', label: 'Otra causa interna', color: '#DA5224' },
  { id: 'procoop', label: 'Procoop y dependencias', color: '#0E9C86' },
  { id: 'terceros', label: 'Software de terceros', color: '#A94FA6' },
];
const CAUSA = Object.fromEntries(CAUSAS.map((c) => [c.id, c]));
const TIPOS = [
  { id: 'incidente', label: 'Incidente', color: '#D6453F' },
  { id: 'solicitud', label: 'Solicitud', color: '#4A8FBF' },
];
const TIPO = Object.fromEntries(TIPOS.map((t) => [t.id, t]));

const PERIODOS = [
  { v: 1, t: 'Último mes' },
  { v: 3, t: 'Últimos 3 meses' },
  { v: 6, t: 'Últimos 6 meses' },
  { v: 12, t: 'Últimos 12 meses' },
];

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const fmtH = (h) => (h >= 100 ? Math.round(h) : Math.round(h * 10) / 10);
const fmtFecha = (f) => String(f).slice(0, 10).split('-').reverse().join('/');
const isoDia = (d) => d.toISOString().slice(0, 10);

// Lunes de la semana de una fecha (para la evolución semanal).
const lunesDe = (fecha) => {
  const d = new Date(String(fecha).slice(0, 10) + 'T00:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return isoDia(d);
};

export default function MetricasOV() {
  const { api } = useData();
  const [vista, setVista] = useState('tablero'); // tablero | bandeja | detalle
  const [meses, setMeses] = useState(3);         // default: últimos 3 meses (pedido de Operaciones)
  const [tickets, setTickets] = useState([]);
  const [reglas, setReglas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [fTipo, setFTipo] = useState('');
  const [fCausa, setFCausa] = useState('');
  const [fResp, setFResp] = useState('');
  const [guardando, setGuardando] = useState(null); // itemId en vuelo
  const [seleccion, setSeleccion] = useState({});   // itemId -> { tipo, causa } (bandeja)
  // Editor del Detalle (19/08, pedido de Leonardo: re-clasificar sin volver a
  // la bandeja): itemId en edición + su borrador { tipo, causa }.
  const [editando, setEditando] = useState(null);
  const [borrador, setBorrador] = useState({ tipo: '', causa: '' });
  const [aplicandoTodas, setAplicandoTodas] = useState(false);

  const hoy = new Date();
  const desde = useMemo(() => {
    const d = new Date(hoy); d.setMonth(d.getMonth() - meses);
    return isoDia(d);
  }, [meses]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasta = isoDia(hoy);

  const cargar = () => {
    setCargando(true);
    api.analisisOv.tickets(desde, hasta)
      .then((r) => setTickets(Array.isArray(r?.tickets) ? r.tickets : []))
      .catch(() => setTickets([]))
      .finally(() => setCargando(false));
  };
  useEffect(() => { cargar(); }, [desde]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    api.analisisOv.reglas().then((r) => setReglas(Array.isArray(r?.reglas) ? r.reglas : [])).catch(() => {});
  }, [api]);

  // --- Particiones del universo (diseño §4) ---
  const activos = tickets.filter((t) => !t.ovDescartado);
  const clasificados = activos.filter((t) => t.ovTipo && t.ovCausa);
  const pendientes = activos.filter((t) => !(t.ovTipo && t.ovCausa));

  // Filtros del tablero/detalle (solo sobre clasificados).
  const visibles = clasificados.filter((t) => (
    (!fTipo || t.ovTipo === fTipo) && (!fCausa || t.ovCausa === fCausa) && (!fResp || t.colaborador === fResp)
  ));
  const responsables = [...new Set(activos.map((t) => t.colaborador))].sort();

  // --- Agregaciones ---
  const porCausa = CAUSAS.map((c) => {
    const del = visibles.filter((t) => t.ovCausa === c.id);
    return {
      ...c,
      n: del.length,
      horas: del.reduce((a, t) => a + (t.horas || 0), 0),
      incidentes: del.filter((t) => t.ovTipo === 'incidente').length,
      solicitudes: del.filter((t) => t.ovTipo === 'solicitud').length,
    };
  });
  const totIncidentes = visibles.filter((t) => t.ovTipo === 'incidente').length;
  const totHoras = visibles.reduce((a, t) => a + (t.horas || 0), 0);
  const personas = [...new Set(visibles.map((t) => t.colaborador))];
  const causaDominante = [...porCausa].sort((a, b) => b.n - a.n)[0];

  // Evolución semanal (lunes → conteo por causa).
  const semanas = useMemo(() => {
    const mapa = new Map();
    for (const t of visibles) {
      const w = lunesDe(t.fecha);
      if (!mapa.has(w)) mapa.set(w, { semana: w, total: 0 });
      const fila = mapa.get(w);
      fila[t.ovCausa] = (fila[t.ovCausa] || 0) + 1;
      fila.total += 1;
    }
    return [...mapa.values()].sort((a, b) => a.semana.localeCompare(b.semana));
  }, [visibles]);
  const maxSemana = Math.max(1, ...semanas.map((s) => s.total));

  // Por responsable (apilado por causa).
  const porResp = useMemo(() => {
    const mapa = new Map();
    for (const t of visibles) {
      if (!mapa.has(t.colaborador)) mapa.set(t.colaborador, { nombre: t.colaborador, total: 0 });
      const fila = mapa.get(t.colaborador);
      fila[t.ovCausa] = (fila[t.ovCausa] || 0) + 1;
      fila.total += 1;
    }
    return [...mapa.values()].sort((a, b) => b.total - a.total);
  }, [visibles]);
  const maxResp = Math.max(1, ...porResp.map((r) => r.total));

  // Asuntos que más se repiten (texto normalizado).
  const topAsuntos = useMemo(() => {
    const mapa = new Map();
    for (const t of visibles) {
      const k = norm(t.text);
      if (!mapa.has(k)) mapa.set(k, { texto: t.text, n: 0, causa: t.ovCausa });
      mapa.get(k).n += 1;
    }
    return [...mapa.values()].filter((a) => a.n > 1).sort((a, b) => b.n - a.n).slice(0, 10);
  }, [visibles]);

  // --- Sugerencias por palabras clave (motor en el frontend; reglas del server) ---
  const sugerir = (texto) => {
    const t = norm(texto);
    let tipo = ''; let causa = '';
    for (const r of reglas) {
      if (!r.contiene) continue;
      if (!t.includes(norm(r.contiene))) continue;
      if (!tipo && r.tipo) tipo = r.tipo;
      if (!causa && r.causa) causa = r.causa;
      if (tipo && causa) break;
    }
    return { tipo, causa };
  };

  const setSel = (itemId, campo, valor) => setSeleccion((s) => ({ ...s, [itemId]: { ...(s[itemId] || {}), [campo]: valor } }));
  const seleccionDe = (t) => {
    const s = seleccion[t.itemId] || {};
    const sug = sugerir(t.text);
    return { tipo: s.tipo ?? (t.ovTipo || sug.tipo || ''), causa: s.causa ?? (t.ovCausa || sug.causa || '') };
  };

  const clasificar = async (t, tipo, causa) => {
    if (!tipo || !causa) return;
    setGuardando(t.itemId);
    try {
      await api.analisisOv.clasificar({ entradaId: t.entradaId, itemId: t.itemId, tipo, causa });
      setTickets((ls) => ls.map((x) => (x.itemId === t.itemId ? { ...x, ovTipo: tipo, ovCausa: causa, ovDescartado: false } : x)));
    } catch (e) { alert(e.message || 'No se pudo clasificar'); }
    finally { setGuardando(null); }
  };
  const descartar = async (t) => {
    setGuardando(t.itemId);
    try {
      await api.analisisOv.descartar({ entradaId: t.entradaId, itemId: t.itemId });
      setTickets((ls) => ls.map((x) => (x.itemId === t.itemId ? { ...x, ovDescartado: true } : x)));
    } catch (e) { alert(e.message || 'No se pudo descartar'); }
    finally { setGuardando(null); }
  };
  const aplicarTodas = async () => {
    const listas = pendientes.map((t) => ({ t, sel: seleccionDe(t) })).filter(({ sel }) => sel.tipo && sel.causa);
    if (!listas.length) { alert('Ninguna pendiente tiene sugerencia completa (tipo + causa).'); return; }
    if (!confirm(`Se van a clasificar ${listas.length} ticket(s) con su sugerencia actual. ¿Continuar?`)) return;
    setAplicandoTodas(true);
    try {
      for (const { t, sel } of listas) {
        // secuencial: cada uno hace merge puntual sobre su entrada
        // eslint-disable-next-line no-await-in-loop
        await api.analisisOv.clasificar({ entradaId: t.entradaId, itemId: t.itemId, tipo: sel.tipo, causa: sel.causa });
      }
      cargar();
    } catch (e) { alert(e.message || 'Se interrumpió la aplicación (los ya clasificados quedaron)'); cargar(); }
    finally { setAplicandoTodas(false); }
  };

  // --- Piezas de UI ---
  const Kpi = ({ label, valor, sub, onClick, alerta }) => (
    <div onClick={onClick}
      className={`bg-white border rounded-xl p-3 ${onClick ? 'cursor-pointer hover:border-coop-azul' : ''} ${alerta ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}>
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={`text-xl font-semibold ${alerta ? 'text-amber-600' : 'text-coop-negro'}`}>{valor}</p>
      {sub && <p className="text-[10.5px] text-slate-400">{sub}</p>}
    </div>
  );
  const Leyenda = () => (
    <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
      {CAUSAS.map((c) => (
        <span key={c.id} className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: c.color }} />{c.label}
        </span>
      ))}
    </div>
  );
  const Tarjeta = ({ titulo, nota, children }) => (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <h3 className="text-sm font-medium text-slate-700">{titulo}</h3>
      {nota && <p className="text-[10.5px] text-slate-400 mb-2">{nota}</p>}
      {!nota && <div className="mb-2" />}
      {children}
    </div>
  );

  const chipTag = (t, i) => (
    <span key={i} className="inline-block px-1.5 py-0.5 rounded bg-coop-azul/10 text-coop-azul text-[10px] mr-1">{t}</span>
  );

  return (
    <div className="p-4">
      <div className="flex items-end justify-between flex-wrap gap-2 mb-1">
        <h2 className="text-lg font-semibold text-slate-800">Métricas Oficina Virtual <span className="text-sm font-normal text-slate-400">· tickets clasificados por tipo × causa</span></h2>
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'tablero', label: 'Tablero ejecutivo' },
            { id: 'bandeja', label: `Bandeja de clasificación${pendientes.length ? ` (${pendientes.length})` : ''}` },
            { id: 'detalle', label: 'Detalle' },
          ].map((s) => (
            <button key={s.id} onClick={() => setVista(s.id)}
              className={`px-3 py-1.5 text-sm rounded-full border whitespace-nowrap ${vista === s.id ? 'bg-coop-azul text-white border-coop-azul font-medium' : 'bg-white text-slate-600 border-slate-200 hover:border-coop-azul'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-3">
        1 ítem de grilla = 1 ticket (mide intervenciones, no pedidos únicos). Las horas combinan las cargadas en la grilla con un prorrateo de la jornada — <b>es una estimación, no un parte de horas</b>.
      </p>

      {/* Filtros en una sola fila (rigen tablero y detalle) */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={meses} onChange={(e) => setMeses(Number(e.target.value))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
          {PERIODOS.map((p) => <option key={p.v} value={p.v}>{p.t}</option>)}
        </select>
        <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
          <option value="">Tipo: todos</option>
          {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <select value={fCausa} onChange={(e) => setFCausa(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
          <option value="">Causa: todas</option>
          {CAUSAS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={fResp} onChange={(e) => setFResp(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
          <option value="">Responsable: todos</option>
          {responsables.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {cargando && <span className="text-xs text-slate-400">⏳ Cargando…</span>}
      </div>

      {/* ============ TABLERO EJECUTIVO ============ */}
      {vista === 'tablero' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2 mb-3">
            <Kpi label="Tickets" valor={visibles.length} sub={`${desde ? `desde ${fmtFecha(desde)}` : ''}`} />
            <Kpi label="Incidentes" valor={totIncidentes} sub={visibles.length ? `${Math.round((totIncidentes / visibles.length) * 100)}% del total` : '—'} />
            <Kpi label="Solicitudes" valor={visibles.length - totIncidentes} sub={visibles.length ? `${100 - Math.round((totIncidentes / visibles.length) * 100)}% del total` : '—'} />
            <Kpi label="Horas estimadas" valor={fmtH(totHoras)} sub="reales + prorrateo" />
            <Kpi label="Personas involucradas" valor={personas.length} sub={personas.length ? `${(visibles.length / personas.length).toFixed(1)} tickets/persona` : '—'} />
            <Kpi label="Causa dominante" valor={causaDominante?.n ? CAUSA[causaDominante.id].label.split(' ')[0] : '—'} sub={causaDominante?.n ? `${causaDominante.n} tickets` : 'sin datos'} />
            <Kpi label="Sin clasificar" valor={pendientes.length} sub={pendientes.length ? 'ir a la bandeja →' : 'todo clasificado ✓'} alerta={pendientes.length > 0} onClick={() => setVista('bandeja')} />
          </div>

          <div className="grid lg:grid-cols-2 gap-3">
            <Tarjeta titulo="Evolución semanal por causa" nota="cantidad de tickets por semana (lunes a domingo)">
              <div className="flex items-end gap-1 h-40">
                {semanas.map((s) => (
                  <div key={s.semana} className="flex-1 flex flex-col justify-end gap-px" title={`Semana del ${fmtFecha(s.semana)}: ${s.total} tickets`}>
                    {CAUSAS.map((c) => (s[c.id] ? (
                      <div key={c.id} style={{ height: `${(s[c.id] / maxSemana) * 100}%`, background: c.color }} className="rounded-sm min-h-[2px]" />
                    ) : null))}
                  </div>
                ))}
                {semanas.length === 0 && <p className="text-xs text-slate-400 m-auto">Sin tickets clasificados en el período.</p>}
              </div>
              {semanas.length > 0 && (
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>{fmtFecha(semanas[0].semana)}</span><span>{fmtFecha(semanas[semanas.length - 1].semana)}</span>
                </div>
              )}
              <div className="mt-2"><Leyenda /></div>
            </Tarjeta>

            <Tarjeta titulo="¿De dónde vienen los tickets?" nota="ranking por causa, % del total clasificado">
              {porCausa.filter((c) => c.n).sort((a, b) => b.n - a.n).map((c) => (
                <div key={c.id} className="mb-2">
                  <div className="flex justify-between text-xs text-slate-600 mb-0.5">
                    <span>{c.label}</span><span className="text-slate-400">{c.n} · {visibles.length ? Math.round((c.n / visibles.length) * 100) : 0}%</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${visibles.length ? (c.n / visibles.length) * 100 : 0}%`, background: c.color }} />
                  </div>
                </div>
              ))}
              {!visibles.length && <p className="text-xs text-slate-400">Sin datos con estos filtros.</p>}
            </Tarjeta>

            <Tarjeta titulo="Incidente vs. solicitud" nota="composición por causa — cuanto más rojo, más apagar incendios">
              {porCausa.filter((c) => c.n).map((c) => (
                <div key={c.id} className="mb-2">
                  <div className="flex justify-between text-xs text-slate-600 mb-0.5">
                    <span>{c.label}</span>
                    <span className="text-slate-400">{c.incidentes} inc · {c.solicitudes} sol</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                    <div style={{ width: `${(c.incidentes / c.n) * 100}%`, background: TIPO.incidente.color }} />
                    <div style={{ width: `${(c.solicitudes / c.n) * 100}%`, background: TIPO.solicitud.color }} />
                  </div>
                </div>
              ))}
              <div className="flex gap-3 text-[11px] text-slate-500 mt-1">
                {TIPOS.map((t) => <span key={t.id} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: t.color }} />{t.label}</span>)}
              </div>
            </Tarjeta>

            <Tarjeta titulo="Esfuerzo por causa" nota="horas estimadas (reales + prorrateo) — acá se ve el «pocos tickets, muchas horas»">
              {(() => {
                const maxH = Math.max(1, ...porCausa.map((c) => c.horas));
                return porCausa.filter((c) => c.horas > 0).sort((a, b) => b.horas - a.horas).map((c) => (
                  <div key={c.id} className="mb-2">
                    <div className="flex justify-between text-xs text-slate-600 mb-0.5">
                      <span>{c.label}</span><span className="text-slate-400">{fmtH(c.horas)} h</span>
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(c.horas / maxH) * 100}%`, background: c.color }} />
                    </div>
                  </div>
                ));
              })()}
              {!totHoras && <p className="text-xs text-slate-400">Sin horas en el período.</p>}
            </Tarjeta>

            <Tarjeta titulo="Quién lo atiende" nota="tickets por responsable, apilados por causa">
              {porResp.map((r) => (
                <div key={r.nombre} className="mb-2">
                  <div className="flex justify-between text-xs text-slate-600 mb-0.5">
                    <span>{r.nombre}</span><span className="text-slate-400">{r.total}</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex" style={{ width: `${(r.total / maxResp) * 100}%` }}>
                    {CAUSAS.map((c) => (r[c.id] ? <div key={c.id} style={{ width: `${(r[c.id] / r.total) * 100}%`, background: c.color }} /> : null))}
                  </div>
                </div>
              ))}
              {!porResp.length && <p className="text-xs text-slate-400">Sin datos con estos filtros.</p>}
            </Tarjeta>

            <Tarjeta titulo="Asuntos que más se repiten" nota="top 10 de textos repetidos — la lista corta de dónde poner la mano">
              {topAsuntos.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-xs border-t border-slate-100 py-1 first:border-t-0">
                  <span className="w-6 h-6 rounded-full text-white flex items-center justify-center text-[11px] shrink-0" style={{ background: CAUSA[a.causa]?.color || '#94a3b8' }}>{a.n}</span>
                  <span className="text-slate-600">{a.texto}</span>
                </div>
              ))}
              {!topAsuntos.length && <p className="text-xs text-slate-400">Sin asuntos repetidos en el período (o falta clasificar).</p>}
            </Tarjeta>
          </div>
        </>
      )}

      {/* ============ BANDEJA DE CLASIFICACIÓN ============ */}
      {vista === 'bandeja' && (
        <div>
          <div className="flex items-start justify-between flex-wrap gap-2 mb-2">
            <p className="text-sm text-slate-500 flex-1 min-w-[260px]">
              Pendientes de clasificar: <b>{pendientes.length}</b>. Los selectores vienen precargados con la <b>sugerencia por palabras clave</b> — confirmá o corregí. Los de solo «Coopmorteros» llevan el chip ámbar: validá si son de Oficina Virtual.
            </p>
            <button onClick={aplicarTodas} disabled={aplicandoTodas || !pendientes.length}
              className="px-3 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90 disabled:opacity-40 shrink-0">
              {aplicandoTodas ? '⏳ Aplicando…' : '⚡ Aplicar todas las sugerencias'}
            </button>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {pendientes.map((t) => {
              const sel = seleccionDe(t);
              return (
                <div key={t.itemId} className="p-2.5 flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-[240px]">
                    <p className="text-xs text-slate-400">{fmtFecha(t.fecha)} · {t.colaborador}{!t.directo && <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px]">validar si es de OV</span>}</p>
                    <p className="text-sm text-slate-700">{t.text}</p>
                    <div className="mt-0.5">{t.tags.map(chipTag)}</div>
                  </div>
                  <select value={sel.tipo} onChange={(e) => setSel(t.itemId, 'tipo', e.target.value)}
                    className={`border rounded-lg px-2 py-1.5 text-xs ${sel.tipo ? 'border-slate-300' : 'border-amber-300 bg-amber-50'}`}>
                    <option value="">— Tipo —</option>
                    {TIPOS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select>
                  <select value={sel.causa} onChange={(e) => setSel(t.itemId, 'causa', e.target.value)}
                    className={`border rounded-lg px-2 py-1.5 text-xs ${sel.causa ? 'border-slate-300' : 'border-amber-300 bg-amber-50'}`}>
                    <option value="">— Causa —</option>
                    {CAUSAS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select>
                  <button onClick={() => clasificar(t, sel.tipo, sel.causa)} disabled={!sel.tipo || !sel.causa || guardando === t.itemId}
                    className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:opacity-90 disabled:opacity-40">
                    {guardando === t.itemId ? '…' : 'Confirmar'}
                  </button>
                  <button onClick={() => descartar(t)} disabled={guardando === t.itemId}
                    className="px-3 py-1.5 text-xs border border-red-200 text-red-500 rounded-lg hover:bg-red-50 disabled:opacity-40">
                    No es de OV
                  </button>
                </div>
              );
            })}
            {!pendientes.length && <p className="p-6 text-center text-sm text-slate-400">🎉 Bandeja vacía: todo lo del período está clasificado.</p>}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            «No es de OV» saca el ítem del tablero (reversible desde el Detalle). Las reglas de sugerencia viven en el servidor y se pueden ampliar sin redeploy. Consejo: clasificá desde el editor del día al cargar la grilla — el ticket nace clasificado y esta bandeja no acumula.
          </p>
        </div>
      )}

      {/* ============ DETALLE ============ */}
      {vista === 'detalle' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 bg-slate-50">
                  <th className="px-2 py-1.5 font-medium">Fecha</th>
                  <th className="px-2 py-1.5 font-medium">Responsable</th>
                  <th className="px-2 py-1.5 font-medium">Ticket</th>
                  <th className="px-2 py-1.5 font-medium">Tipo</th>
                  <th className="px-2 py-1.5 font-medium">Causa</th>
                  <th className="px-2 py-1.5 font-medium text-right">Horas</th>
                  <th className="px-2 py-1.5 font-medium">Clasificó</th>
                  <th className="px-2 py-1.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((t) => {
                  const enEdicion = editando === t.itemId;
                  return (
                  <tr key={t.itemId} className={`border-t border-slate-100 ${enEdicion ? 'bg-amber-50/50' : ''}`}>
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-500">{fmtFecha(t.fecha)}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{t.colaborador}</td>
                    <td className="px-2 py-1.5">{t.text}<div>{t.tags.map(chipTag)}</div></td>
                    {/* Re-clasificación EN LA FILA (19/08): el ✎ convierte los
                        chips en selectores — sin volver a la bandeja. */}
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {enEdicion ? (
                        <select value={borrador.tipo} onChange={(e) => setBorrador((b) => ({ ...b, tipo: e.target.value }))}
                          className="border border-slate-300 rounded px-1 py-0.5 text-[11px] bg-white">
                          {TIPOS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                        </select>
                      ) : <span className="px-1.5 py-0.5 rounded text-white text-[10px]" style={{ background: TIPO[t.ovTipo]?.color }}>{TIPO[t.ovTipo]?.label}</span>}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {enEdicion ? (
                        <select value={borrador.causa} onChange={(e) => setBorrador((b) => ({ ...b, causa: e.target.value }))}
                          className="border border-slate-300 rounded px-1 py-0.5 text-[11px] bg-white">
                          {CAUSAS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                        </select>
                      ) : <span className="px-1.5 py-0.5 rounded text-white text-[10px]" style={{ background: CAUSA[t.ovCausa]?.color }}>{CAUSA[t.ovCausa]?.label}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">{fmtH(t.horas)}{t.horasReales ? '' : ' *'}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-400">{t.ovPor || '—'}{t.ovFecha ? ` · ${fmtFecha(t.ovFecha)}` : ''}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-right">
                      {enEdicion ? (
                        <span className="inline-flex items-center gap-1">
                          <button onClick={async () => { await clasificar(t, borrador.tipo, borrador.causa); setEditando(null); }}
                            disabled={guardando === t.itemId || !borrador.tipo || !borrador.causa}
                            className="px-2 py-0.5 text-[11px] rounded bg-coop-azul text-white disabled:opacity-40">{guardando === t.itemId ? '…' : 'Guardar'}</button>
                          <button onClick={async () => { await descartar(t); setEditando(null); }} disabled={guardando === t.itemId}
                            title="Lo saca de las métricas (reversible desde «Ver descartados»)"
                            className="px-2 py-0.5 text-[11px] rounded border border-slate-300 text-slate-500 hover:bg-slate-50">No es de OV</button>
                          <button onClick={() => setEditando(null)} className="px-1.5 py-0.5 text-[11px] rounded text-slate-400 hover:text-slate-600">✕</button>
                        </span>
                      ) : (
                        <button onClick={() => { setEditando(t.itemId); setBorrador({ tipo: t.ovTipo || '', causa: t.ovCausa || '' }); }}
                          title="Re-clasificar este ticket" className="px-1.5 py-0.5 text-[12px] rounded text-slate-400 hover:text-coop-azul hover:bg-slate-100">✎</button>
                      )}
                    </td>
                  </tr>
                  );
                })}
                {!visibles.length && <tr><td colSpan={8} className="p-6 text-center text-slate-400">Sin tickets clasificados con estos filtros.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2 px-2 py-1.5 border-t border-slate-100">
            <p className="text-[10.5px] text-slate-400">* horas por prorrateo de la jornada (estimación). Descartados en el período: {tickets.filter((t) => t.ovDescartado).length}.</p>
            {tickets.some((t) => t.ovDescartado) && (
              <details>
                <summary className="text-[10.5px] text-slate-400 cursor-pointer">Ver descartados (reversible)</summary>
                <div className="mt-1 space-y-1">
                  {tickets.filter((t) => t.ovDescartado).map((t) => (
                    <div key={t.itemId} className="flex items-center gap-2 text-[11px] text-slate-500">
                      <span>{fmtFecha(t.fecha)} · {t.colaborador} · {t.text}</span>
                      <button onClick={async () => { await api.analisisOv.descartar({ entradaId: t.entradaId, itemId: t.itemId, descartado: false }); cargar(); }}
                        className="text-coop-azul hover:underline">restaurar</button>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
