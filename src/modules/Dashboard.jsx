import { useState, useEffect, useCallback, useMemo } from 'react';
import { useData } from '../data/DataContext.jsx';
import { MONTHS_ES } from './fechasUtils.js';
import { calcMonthlyTrends } from './costosUtils.js';
import { resolveObjetivoPct } from './objetivosUtils.js';
import { useMetricasCRM } from './CRMMetricas.jsx';
import ObjetivoDetalleModal from './ObjetivoDetalleModal.jsx';
import { Eye } from 'lucide-react';

const fmtN = (n) => Math.round(Number(n || 0)).toLocaleString('es-AR');
const fmtARS = (n) => '$ ' + fmtN(n);
const fmtUSD = (n) => 'US$ ' + fmtN(n);

function VarBadge({ value, inverse }) {
  if (value == null) return null;
  const positivo = inverse ? value < 0 : value >= 0;
  const sign = value >= 0 ? '+' : '';
  return <span className={`text-xs font-mono ml-1 ${positivo ? 'text-emerald-600' : 'text-rose-500'}`}>{sign}{value.toFixed(0)}%</span>;
}

function Kpi({ titulo, valor, sub, badge }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="text-xs text-slate-500">{titulo}</div>
      <div className="mt-1 flex items-baseline">
        <span className="font-mono text-2xl font-semibold text-slate-800">{valor}</span>
        {badge}
      </div>
      {sub && <div className="text-[11px] text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { api, colaboradores } = useData();
  const [anio, setAnio] = useState(() => new Date().getFullYear());
  const [periodMode, setPeriodMode] = useState('month');
  const [monthKey, setMonthKey] = useState(() => new Date().toISOString().slice(0, 7));
  const [feriadosMap, setFeriadosMap] = useState({});
  const [entries, setEntries] = useState([]);
  const [costos, setCostos] = useState({});
  const [objetivos, setObjetivos] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [leads, setLeads] = useState([]);
  const [detalleCtx, setDetalleCtx] = useState(null); // objetivo para la presentación (solo lectura)
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      const [fers, ents, cos, objs, proys, tars, lds] = await Promise.all([
        api.feriados.list(),
        api.grilla.list({ desde: `${anio}-01-01`, hasta: `${anio}-12-31` }),
        api.costos.list(), api.objetivos.list(), api.proyectos.list(), api.tareas.list(), api.leads.list(),
      ]);
      const fmap = {};
      for (const f of (fers.data || fers || [])) fmap[String(f.fecha).slice(0, 10)] = f.nombre;
      setFeriadosMap(fmap);
      setEntries(ents.data || ents || []);
      const cmap = {};
      for (const c of (cos.data || cos || [])) cmap[c.mes] = { costoLaboral: c.costoLaboral, cotizacionDolar: c.cotizacionDolar, asignaciones: c.asignaciones || {} };
      setCostos(cmap);
      setObjetivos(objs.data || objs || []);
      setProyectos(proys.data || proys || []);
      setTareas(tars.data || tars || []);
      setLeads(lds.data || lds || []);
    } finally { setCargando(false); }
  }, [api, anio]);
  useEffect(() => { recargar(); }, [recargar]);

  const entriesMap = useMemo(() => {
    const m = {};
    for (const e of entries) m[`${e.colaboradorId}:${String(e.fecha).slice(0, 10)}`] = e;
    return m;
  }, [entries]);

  const trends = useMemo(() => calcMonthlyTrends(anio, costos, colaboradores, feriadosMap, entriesMap, MONTHS_ES), [anio, costos, colaboradores, feriadosMap, entriesMap]);

  let costoLab = 0, cotiz = 1, horasAct = 0, diasProd = 0, diasPotencial = 0, prevTrend = null;
  if (periodMode === 'month') {
    const idx = trends.findIndex((t) => t.monthKey === monthKey);
    const t = trends[idx];
    if (t) { costoLab = t.costoLab; cotiz = t.cotiz; horasAct = t.horasActivables; diasProd = t.diasProd; diasPotencial = t.diasPotencial; }
    prevTrend = idx > 0 ? trends[idx - 1] : null;
  } else {
    costoLab = trends.reduce((s, t) => s + t.costoLab, 0);
    horasAct = trends.reduce((s, t) => s + t.horasActivables, 0);
    diasProd = trends.reduce((s, t) => s + t.diasProd, 0);
    diasPotencial = trends.reduce((s, t) => s + t.diasPotencial, 0);
    const w = trends.filter((t) => t.costoLab > 0);
    cotiz = w.length ? w.reduce((s, t) => s + t.cotiz * t.costoLab, 0) / w.reduce((s, t) => s + t.costoLab, 0) : 1;
  }
  const ocupacion = diasPotencial > 0 ? diasProd / diasPotencial : 0;
  const variation = (curr, prev) => (prev > 0 ? ((curr - prev) / prev) * 100 : null);
  const varCosto = periodMode === 'month' && prevTrend ? variation(costoLab, prevTrend.costoLab) : null;
  const varHoras = periodMode === 'month' && prevTrend ? variation(horasAct, prevTrend.horasActivables) : null;
  const varOcup = periodMode === 'month' && prevTrend ? variation(ocupacion * 100, prevTrend.ocupacionPct * 100) : null;

  const objetivosDetalle = useMemo(() => objetivos
    .filter((o) => (Number(o.anio) || anio) === anio)
    .map((o) => ({
      id: o.id,
      codigo: o.codigo,
      titulo: o.titulo,
      peso: Number(o.peso) || 0,
      comentarios: o.comentarios || '',
      ...resolveObjetivoPct(o, proyectos, tareas, leads), // { pct, source, detalle }
    })), [objetivos, proyectos, tareas, leads, anio]);

  // Comercial: leads iniciados en el año seleccionado (primer contacto o alta).
  const leadsAnio = useMemo(() => (leads || []).filter((l) => {
    const f = l.fechaPrimerContacto || l.createdAt;
    return f && new Date(f).getFullYear() === anio;
  }), [leads, anio]);
  const crm = useMetricasCRM(leadsAnio);

  const objetivosAvance = useMemo(() => {
    if (!objetivosDetalle.length) return null;
    // Para el promedio general cada objetivo aporta como máximo 100% (el excedente no infla el total).
    const pesoSum = objetivosDetalle.reduce((s, o) => s + o.peso, 0);
    if (pesoSum > 0) {
      const weighted = objetivosDetalle.reduce((s, o) => s + Math.min(100, o.pct) * o.peso, 0);
      return Math.round(weighted / pesoSum);
    }
    // Sin pesos cargados: promedio simple para que igual se vea.
    return Math.round(objetivosDetalle.reduce((s, o) => s + Math.min(100, o.pct), 0) / objetivosDetalle.length);
  }, [objetivosDetalle]);

  // Composición del costo por mes del año: Cooptech (azul) vs operación Coopmorteros (naranja), en US$.
  const comp = useMemo(() => {
    const meses = trends.map((t) => {
      const coopUsd = t.cotiz > 0 ? t.costoCooptech / t.cotiz : 0;
      const operUsd = t.cotiz > 0 ? t.costoOperacion / t.cotiz : 0;
      return { label: MONTHS_ES[t.monthIdx].slice(0, 3), coopArs: t.costoCooptech, operArs: t.costoOperacion, coopUsd, operUsd, totalUsd: coopUsd + operUsd };
    });
    const maxTotal = Math.max(1, ...meses.map((m) => m.totalUsd));
    const totalAnioUsd = meses.reduce((s, m) => s + m.totalUsd, 0);
    const totalAnioArs = meses.reduce((s, m) => s + m.coopArs + m.operArs, 0);
    return { meses, maxTotal, totalAnioUsd, totalAnioArs, hayDatos: totalAnioUsd > 0 };
  }, [trends]);

  const aBadge = (v, inv) => (v != null ? <VarBadge value={v} inverse={inv} /> : null);
  const mesLabel = MONTHS_ES[Number(monthKey.slice(5, 7)) - 1];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h2 className="text-xl font-semibold text-coop-negro">Dashboard <span className="text-sm font-normal text-slate-400">gerencial · {anio}</span></h2>
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => setAnio(anio - 1)} className="px-2 py-1 rounded hover:bg-slate-100">‹</button>
          <span className="text-slate-600">{anio}</span>
          <button onClick={() => setAnio(anio + 1)} className="px-2 py-1 rounded hover:bg-slate-100">›</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 my-4">
        <button onClick={() => setPeriodMode('month')} className={`text-sm px-3 py-1.5 rounded-lg ${periodMode === 'month' ? 'bg-coop-azul text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Mes</button>
        <button onClick={() => setPeriodMode('year')} className={`text-sm px-3 py-1.5 rounded-lg ${periodMode === 'year' ? 'bg-coop-azul text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Año</button>
        {periodMode === 'month' && (
          <select value={monthKey} onChange={(e) => setMonthKey(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
            {trends.map((t) => <option key={t.monthKey} value={t.monthKey}>{MONTHS_ES[t.monthIdx]} {anio}</option>)}
          </select>
        )}
      </div>

      {cargando ? <p className="text-slate-500">Cargando…</p> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            {/* Orden del relato gerencial: objetivos → operación → costos */}
            <Kpi titulo={`Avance objetivos ${anio}`} valor={objetivosAvance != null ? `${objetivosAvance}%` : '—'} sub="promedio ponderado por peso" />
            <Kpi titulo="Ocupación productiva" valor={`${Math.round(ocupacion * 100)}%`} sub={`${fmtN(diasProd)} / ${fmtN(diasPotencial)} días`} badge={aBadge(varOcup)} />
            <Kpi titulo="Horas activables (Cooptech)" valor={`${fmtN(horasAct)} h`} sub="tiempo propio facturable" badge={aBadge(varHoras)} />
            <Kpi titulo={`Costo laboral ${periodMode === 'month' ? 'del mes' : 'del año'}`} valor={fmtARS(costoLab).replace('$ ', '$')} sub={cotiz > 0 ? `≈ ${fmtUSD(costoLab / cotiz)}` : null} badge={aBadge(varCosto, true)} />
          </div>

          {objetivosDetalle.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-600 mb-2">Objetivos {anio}</div>
              <div className="space-y-2">
                {objetivosDetalle.map((o) => (
                  <div key={o.id} className="flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-400 w-12 shrink-0">{o.codigo}</span>
                    <span className="text-sm text-slate-700 flex-1 truncate">{o.titulo}</span>
                    <span className="hidden sm:block text-[11px] text-slate-400 w-24 text-right shrink-0">
                      {o.source === 'manual' ? 'manual' : o.source === 'auto' ? 'por proyectos' : o.source === 'leads' ? 'por leads' : o.source === 'monto' ? 'por monto' : 'sin datos'}
                    </span>
                    <div className="w-16 sm:w-28 h-2 bg-slate-100 rounded-full overflow-hidden shrink-0">
                      <div className="h-full bg-coop-azul" style={{ width: `${Math.min(100, o.pct)}%` }} />
                    </div>
                    <span className="font-mono text-sm text-slate-700 w-10 text-right shrink-0">{o.pct}%</span>
                    <button onClick={() => setDetalleCtx(o)} className="p-1 rounded hover:bg-slate-100 text-slate-400 shrink-0" title="Ver comentarios y fotos"><Eye size={15} /></button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-3">El avance sale del modo de cálculo de cada objetivo (manual, proyectos vinculados, leads/eventos o monto ganado). El ojo abre los comentarios y fotos de seguimiento.</p>
            </div>
          )}

          {/* Comercial (ingresos) entre objetivos y costos: el panorama completo
              del área queda avance → ingresos → costos. Mismo cálculo que las
              métricas del CRM (hook compartido), sobre los leads del año. */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 mt-4">
            <div className="flex flex-wrap items-center justify-between gap-1 mb-3">
              <span className="text-sm font-semibold text-slate-600">Comercial · {anio}</span>
              <span className="text-xs text-slate-400">{leadsAnio.length} lead{leadsAnio.length === 1 ? '' : 's'} iniciados en {anio}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi titulo="Monto ganado" valor={'US$ ' + Math.round(crm.montoGanado).toLocaleString('es-AR')} sub={`${crm.ganadosCount} lead${crm.ganadosCount === 1 ? '' : 's'} ganado${crm.ganadosCount === 1 ? '' : 's'}`} />
              <Kpi titulo="Pipeline activo" valor={'US$ ' + Math.round(crm.pipeline).toLocaleString('es-AR')} sub="en juego, sin cerrar" />
              <Kpi titulo="Conversión global" valor={crm.convGlobal == null ? '—' : `${Math.round(crm.convGlobal * 100)}%`} sub={`${crm.ganadosCount} de ${crm.total} leads`} />
              <Kpi titulo="Ticket promedio" valor={'US$ ' + Math.round(crm.ticket).toLocaleString('es-AR')} sub="por lead ganado" />
            </div>
            <p className="text-xs text-slate-400 mt-3">Mismos indicadores que las métricas del CRM; el detalle completo (embudo, fuentes, tiempos) vive en esa solapa.</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 mt-4">
            <div className="flex flex-wrap items-center justify-between gap-1 mb-3">
              <span className="text-sm font-semibold text-slate-600">Composición del costo · {anio}</span>
              <span className="text-xs text-slate-400"><span style={{ color: '#F28F20' }}>● operación Coopmorteros</span> · <span style={{ color: '#243E91' }}>● Cooptech</span></span>
            </div>
            {comp.hayDatos ? (() => {
              const W = 760, H = 340, padX = 28, padTop = 18, padBot = 40;
              const areaH = H - padTop - padBot, yBase = padTop + areaH;
              const xStep = (W - padX * 2) / 12, barW = xStep * 0.6;
              return (
                <>
                  <div className="overflow-x-auto">
                  <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" style={{ maxHeight: 340 }}>
                    {comp.meses.map((m, i) => {
                      const x = padX + i * xStep + (xStep - barW) / 2, cx = x + barW / 2;
                      const hCoop = (m.coopUsd / comp.maxTotal) * areaH;
                      const hOper = (m.operUsd / comp.maxTotal) * areaH;
                      const yCoop = yBase - hCoop, yOper = yCoop - hOper;
                      return (
                        <g key={i}>
                          {hCoop > 0 && <rect x={x} y={yCoop} width={barW} height={hCoop} fill="#243E91" />}
                          {hOper > 0 && <rect x={x} y={yOper} width={barW} height={hOper} fill="#F28F20" />}
                          {hCoop > 36 && <text x={cx} y={yCoop + hCoop / 2} transform={`rotate(-90 ${cx} ${yCoop + hCoop / 2})`} textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="600" fill="#fff">{fmtUSD(m.coopUsd)}</text>}
                          {hOper > 36 && <text x={cx} y={yOper + hOper / 2} transform={`rotate(-90 ${cx} ${yOper + hOper / 2})`} textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="600" fill="#fff">{fmtUSD(m.operUsd)}</text>}
                          <text x={cx} y={yBase + 16} textAnchor="middle" fontSize="11" fill="#94a3b8">{m.label}</text>
                        </g>
                      );
                    })}
                    <line x1={padX} y1={yBase} x2={W - padX} y2={yBase} stroke="#e2e8f0" strokeWidth="1" />
                  </svg>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">Total {anio}: <span className="font-mono text-slate-600">{fmtUSD(comp.totalAnioUsd)}</span> <span className="text-slate-400">· {fmtARS(comp.totalAnioArs)}</span></p>
                </>
              );
            })() : <p className="text-slate-400 text-sm">Sin datos de costo cargados para este año.</p>}
          </div>

          {periodMode === 'month' && <p className="text-xs text-slate-400 mt-3">Variación de {mesLabel} respecto del mes anterior.</p>}
        </>
      )}

      {detalleCtx && (
        <ObjetivoDetalleModal
          open={!!detalleCtx}
          objetivo={detalleCtx}
          pct={detalleCtx.pct}
          api={api}
          readOnly
          onClose={() => setDetalleCtx(null)}
        />
      )}
    </div>
  );
}
