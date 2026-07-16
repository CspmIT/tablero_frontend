import { Fragment, useState, useEffect, useCallback, useMemo } from 'react';
import { useData } from '../data/DataContext.jsx';
import { descargarArchivo } from '../api/client.js';
import { MONTHS_ES } from './fechasUtils.js';
import { computeCostosAnio, distribucionMes, cooptechPctUnidades, sumUnidades, weeksOfMonth, UNIDADES } from './costosUtils.js';
import { isInterno, addDays, fmtISO, isActiveCollab, activeDaysInRange } from './grillaUtils.js';
import { Settings, Download } from 'lucide-react';
import { exportarMesXlsx } from './costosExport.js';

const fmtN = (n) => Math.round(Number(n || 0)).toLocaleString('es-AR');
const fmtARS = (n) => '$ ' + fmtN(n);
const pct = (v) => ((Number(v) || 0) * 100).toFixed(2);
const pct1 = (v) => ((Number(v) || 0) * 100).toFixed(2);
const fmtMoney2 = (n) => '$ ' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd2 = (n) => 'US$ ' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Dias no laborables que se muestran como aviso para asignar pesos.
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
const ESTADO_LABEL = { vacaciones: 'Vacaciones', licencia: 'Licencia', franco: 'Franco', franco_cumple: 'Franco cumple', feriado: 'Feriado' };
const NO_LABORABLE = new Set(['vacaciones', 'licencia', 'franco', 'franco_cumple', 'feriado']);

export default function Costos() {
  const { api, colaboradores } = useData();
  const [anio, setAnio] = useState(() => new Date().getFullYear());
  const [subtab, setSubtab] = useState('capacidad');
  const [feriadosMap, setFeriadosMap] = useState({});
  const [entries, setEntries] = useState([]);
  const [costos, setCostos] = useState({}); // mes -> { costoLaboral, cotizacionDolar, asignaciones }
  const [cargando, setCargando] = useState(true);
  const [mesDist, setMesDist] = useState(() => new Date().toISOString().slice(0, 7));
  const [semanaIdx, setSemanaIdx] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [colSel, setColSel] = useState('');

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      const [fers, ents, cos] = await Promise.all([
        api.feriados.list(),
        api.grilla.list({ desde: `${anio}-01-01`, hasta: `${anio}-12-31` }),
        api.costos.list(),
      ]);
      const fmap = {};
      for (const f of (fers.data || fers || [])) fmap[String(f.fecha).slice(0, 10)] = f.nombre;
      setFeriadosMap(fmap);
      setEntries(ents.data || ents || []);
      const cmap = {};
      for (const c of (cos.data || cos || [])) cmap[c.mes] = { costoLaboral: c.costoLaboral ?? '', cotizacionDolar: c.cotizacionDolar ?? '', asignaciones: c.asignaciones || {} };
      setCostos(cmap);
    } finally {
      setCargando(false);
    }
  }, [api, anio]);
  useEffect(() => { recargar(); }, [recargar]);

  const entriesMap = useMemo(() => {
    const m = {};
    for (const e of entries) m[`${e.colaboradorId}:${String(e.fecha).slice(0, 10)}`] = e;
    return m;
  }, [entries]);

  const r = computeCostosAnio(colaboradores, entries, feriadosMap, anio);
  const meses = Array.from({ length: 12 }, (_, m) => `${anio}-${String(m + 1).padStart(2, '0')}`);
  const totalLaboralAnio = meses.reduce((s, mes) => s + Number(costos[mes]?.costoLaboral || 0), 0);
  const cotizPromedio = (() => {
    const vals = meses.map((mes) => Number(costos[mes]?.cotizacionDolar || 0)).filter((v) => v > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  })();
  const costoDiaActivoARS = r.nar > 0 ? totalLaboralAnio / r.nar : 0;

  const setCampo = (mes, campo, valor) => setCostos((c) => ({ ...c, [mes]: { ...c[mes], [campo]: valor } }));
  const setUnidadSemana = (mes, cid, weekIdx, uid, valorPct, nWeeks) => setCostos((c) => {
    const cur = c[mes] || {};
    const asign = { ...(cur.asignaciones || {}) };
    const fila = { ...(asign[cid] || {}) };
    const weeks = Array.from({ length: nWeeks }, (_, i) => ({ summary: fila.weeks?.[i]?.summary || '', unidades: { ...(fila.weeks?.[i]?.unidades || {}) } }));
    weeks[weekIdx].unidades[uid] = (Number(valorPct) || 0) / 100;
    fila.weeks = weeks;
    asign[cid] = fila;
    return { ...c, [mes]: { ...cur, asignaciones: asign } };
  });
  // Resumen semanal propio de costos (no toca la grilla).
  const setSummarySemana = (mes, cid, weekIdx, texto, nWeeks) => setCostos((c) => {
    const cur = c[mes] || {};
    const asign = { ...(cur.asignaciones || {}) };
    const fila = { ...(asign[cid] || {}) };
    const weeks = Array.from({ length: nWeeks }, (_, i) => ({ summary: fila.weeks?.[i]?.summary || '', unidades: { ...(fila.weeks?.[i]?.unidades || {}) } }));
    weeks[weekIdx].summary = texto;
    fila.weeks = weeks;
    asign[cid] = fila;
    return { ...c, [mes]: { ...cur, asignaciones: asign } };
  });
  const setPeso = (mes, cid, valorPct) => setCostos((c) => {
    const cur = c[mes] || {};
    const asign = { ...(cur.asignaciones || {}) };
    asign[cid] = { ...(asign[cid] || {}), peso_pct: (Number(valorPct) || 0) / 100 };
    return { ...c, [mes]: { ...cur, asignaciones: asign } };
  });
  const guardarMes = async (mes) => {
    const row = costos[mes] || {};
    try {
      await api.costos.set(mes, {
        costoLaboral: row.costoLaboral === '' || row.costoLaboral == null ? null : Number(row.costoLaboral),
        cotizacionDolar: row.cotizacionDolar === '' || row.cotizacionDolar == null ? null : Number(row.cotizacionDolar),
        asignaciones: row.asignaciones || {},
      });
    } catch (e) { alert('No se pudo guardar el mes: ' + (e.message || '')); }
  };

  // Aplica y persiste los settings del mes: costo laboral total, cotización y peso por colaborador.
  const guardarSettings = async ({ costoLaboral, cotizacionDolar, pesos }) => {
    const cur = costos[mesDist] || {};
    const asign = { ...(cur.asignaciones || {}) };
    for (const c of internosMes) {
      asign[c.id] = { ...(asign[c.id] || {}), peso_pct: (Number(pesos[c.id]) || 0) / 100 };
    }
    const cl = costoLaboral === '' || costoLaboral == null ? '' : Number(costoLaboral);
    const cd = cotizacionDolar === '' || cotizacionDolar == null ? '' : Number(cotizacionDolar);
    setCostos((c) => ({ ...c, [mesDist]: { ...c[mesDist], costoLaboral: cl, cotizacionDolar: cd, asignaciones: asign } }));
    try {
      await api.costos.set(mesDist, {
        costoLaboral: cl === '' ? null : cl,
        cotizacionDolar: cd === '' ? null : cd,
        asignaciones: asign,
      });
    } catch (e) { alert('No se pudo guardar el mes: ' + (e.message || '')); }
    setShowSettings(false);
  };

  const exportarMes = () => {
    exportarMesXlsx({
      mesLabel: `${MONTHS_ES[Number(mesDist.slice(5, 7)) - 1]} ${anio}`,
      mesKey: mesDist,
      clMes, cdMes, usdMes,
      dist, weeks,
      asignaciones: costos[mesDist]?.asignaciones || {},
      totAsignOp, totCooptechPct, totImpactoUnidad,
      promOp, promCoop, idDPct, residualPct,
    });
  };

  const Nivel = ({ sigla, nombre, valor, detalle, color }) => (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold" style={{ color }}>{sigla}</span>
        <span className="font-mono text-xl font-semibold text-slate-800">{fmtN(valor)}</span>
      </div>
      <div className="text-xs text-slate-500 mt-0.5">{nombre}</div>
      <div className="text-[11px] text-slate-400 mt-1">{detalle}</div>
    </div>
  );

  const internos = colaboradores.filter(isInterno);
  const [mesY, mesM] = mesDist.split('-').map(Number);
  const mesStart = new Date(mesY, mesM - 1, 1);
  const mesEnd = new Date(mesY, mesM, 0);
  // Activos para el mes analizado: con al menos un día de período dentro del mes (no importa si hoy están de baja).
  const internosMes = internos.filter((c) => activeDaysInRange(c, mesStart, mesEnd) > 0);
  const dist = distribucionMes(mesDist, internosMes, costos[mesDist]?.asignaciones || {}, costos[mesDist]?.costoLaboral, feriadosMap, entriesMap);
  // Totales en % del costo total del mes (para el pie del consolidado).
  const totAsignOp = dist.rows.reduce((s, r) => s + sumUnidades(r.unidades) * r.peso, 0);
  const totCooptechPct = dist.rows.reduce((s, r) => s + r.cpt * r.peso, 0);
  const totImpactoUnidad = {};
  UNIDADES.forEach((u) => { totImpactoUnidad[u.id] = dist.rows.reduce((s, r) => s + (r.unidades[u.id] || 0) * r.peso, 0); });
  const vertStyle = { writingMode: 'vertical-rl', transform: 'rotate(180deg)' };
  const nCol = dist.rows.length || 1;
  const sumHorasOp = dist.rows.reduce((s, r) => s + sumUnidades(r.unidades), 0);
  const promOp = sumHorasOp / nCol;
  const promCoop = dist.rows.reduce((s, r) => s + r.cpt, 0) / nCol;
  // Desglose del Cooptech: desarrollo (I+D) vs funcionamiento (comercial + organizacion), ponderado por peso.
  let idDPct = 0, comPct = 0, orgPct = 0;
  dist.rows.forEach((r) => {
    const f = internosMes.find((c) => String(c.id) === String(r.id))?.funcionCosto || 'desarrollo';
    const pond = r.cpt * r.peso;
    if (f === 'comercial') comPct += pond;
    else if (f === 'organizacion') orgPct += pond;
    else { idDPct += pond; }
  });
  const residualPct = comPct + orgPct;
  const mesDistIdx = Number(mesDist.split('-')[1]) - 1;
  const clMes = Number(costos[mesDist]?.costoLaboral || 0);
  const cdMes = Number(costos[mesDist]?.cotizacionDolar || 0);
  const usdMes = clMes > 0 && cdMes > 0 ? clMes / cdMes : null;
  const weeks = useMemo(() => weeksOfMonth(mesDist), [mesDist]);
  const pesoSemana = weeks.length ? 1 / weeks.length : 0;
  const wIdx = Math.min(semanaIdx, Math.max(0, weeks.length - 1));
  const rangoSemana = (w) => w ? `${w.monday.getDate()}/${w.monday.getMonth() + 1}–${w.sunday.getDate()}/${w.sunday.getMonth() + 1}` : '';
  const colActual = internosMes.find((c) => String(c.id) === String(colSel)) || internosMes[0] || null;
  // Tareas que el colaborador cargó en la grilla esa semana (lun-vie), para mostrar y autocompletar el resumen.
  const tareasDeSemana = (cid, weekMonday) => {
    const out = [];
    for (let i = 0; i < 5; i++) {
      const e = entriesMap[`${cid}:${fmtISO(addDays(weekMonday, i))}`];
      if (!e) continue;
      for (const it of (e.items || [])) {
        const t = typeof it === 'string' ? it : it?.text;
        if (t && t.trim()) out.push(t.trim());
      }
    }
    return out;
  };

  // Dias no trabajados del colaborador esa semana (lun-vie): vacaciones, licencia, franco o feriado.
  const diasNoTrabajados = (cid, weekMonday) => {
    const out = [];
    for (let i = 0; i < 5; i++) {
      const fISO = fmtISO(addDays(weekMonday, i));
      const e = entriesMap[`${cid}:${fISO}`];
      let tipo = null;
      const st = e && (e.estado ?? e.status);
      if (st && NO_LABORABLE.has(st)) tipo = st;
      else if (feriadosMap[fISO]) tipo = 'feriado';
      if (tipo) out.push({ dia: DIAS_CORTOS[i], tipo: ESTADO_LABEL[tipo] || tipo });
    }
    return out;
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h2 className="text-xl font-semibold text-coop-negro">Costos <span className="text-sm font-normal text-slate-400">{anio}</span></h2>
        <button
          onClick={() => descargarArchivo(`/costos/exportar-excel?anio=${anio}`, `Costos_Operacion_Cooptech_${anio}.xlsx`)
            .catch((e) => alert(e.message || 'No se pudo exportar'))}
          title="Descarga el anualizado en el formato exacto del Excel de administración: reemplazar y listo. Meses sin datos quedan en blanco."
          className="text-sm border border-coop-azul text-coop-azul px-3 py-1.5 rounded-lg hover:bg-coop-azul/5">
          ⬇ Exportar Excel anualizado
        </button>
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => setAnio(anio - 1)} className="px-2 py-1 rounded hover:bg-slate-100">‹</button>
          <span className="text-slate-600">{anio}</span>
          <button onClick={() => setAnio(anio + 1)} className="px-2 py-1 rounded hover:bg-slate-100">›</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 my-4">
        <button onClick={() => setSubtab('capacidad')} className={`text-sm px-3 py-1.5 rounded-lg ${subtab === 'capacidad' ? 'bg-coop-azul text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Capacidad</button>
        <button onClick={() => setSubtab('distribucion')} className={`text-sm px-3 py-1.5 rounded-lg ${subtab === 'distribucion' ? 'bg-coop-azul text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Distribución por unidad</button>
        <button onClick={() => setSubtab('consolidado')} className={`text-sm px-3 py-1.5 rounded-lg ${subtab === 'consolidado' ? 'bg-coop-azul text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Resumen mensual</button>
      </div>

      {cargando ? <p className="text-slate-500">Cargando…</p> : subtab === 'capacidad' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
            <Nivel sigla="CMT" nombre="Capacidad Máx. Teórica" valor={r.cmt} detalle={`${r.headcount} personas · FTE ${r.fteEquivalente.toFixed(1)}`} color="#243E91" />
            <Nivel sigla="CMP" nombre="Capacidad Máx. Práctica" valor={r.cmp} detalle={`CMT − ${fmtN(r.totalVacaciones)} vacaciones`} color="#1F76BB" />
            <Nivel sigla="NAP" nombre="Nivel Actividad Previsto" valor={r.nap} detalle={`CMP − ${fmtN(r.weekendPD)} findes − ${fmtN(r.feriadosPD)} feriados`} color="#2f9e8c" />
            <Nivel sigla="NAR" nombre="Nivel Actividad Real" valor={r.nar} detalle={`NAP − ${fmtN(r.ausentismoReal)} francos/licencias`} color="#F28F20" />
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
            <div className="text-sm font-semibold text-slate-600 mb-2">Ociosidad</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              <div><div className="text-[11px] text-slate-400">Anticipada (estructural)</div><div className="font-mono text-lg text-slate-700">{fmtN(r.ociosidadAnticipada)}</div><div className="text-[11px] text-slate-400">findes + feriados</div></div>
              <div><div className="text-[11px] text-slate-400">Operativa (gestionable)</div><div className="font-mono text-lg text-slate-700">{fmtN(r.ociosidadOperativa)}</div><div className="text-[11px] text-slate-400">francos + licencias</div></div>
              <div><div className="text-[11px] text-slate-400">Total</div><div className="font-mono text-lg text-coop-naranja">{fmtN(r.ociosidadTotal)}</div><div className="text-[11px] text-slate-400">{r.ociosidadPct}% de la CMP</div></div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-2">
            <h3 className="text-sm font-semibold text-slate-600">Insumos mensuales</h3>
            <div className="text-xs text-slate-500">
              Costo laboral {anio}: <span className="font-mono">{fmtARS(totalLaboralAnio)}</span>
              {r.nar > 0 && totalLaboralAnio > 0 && <> · costo por día activo (NAR): <span className="font-mono">{fmtARS(costoDiaActivoARS)}</span>{cotizPromedio > 0 && <> ≈ US$ {fmtN(costoDiaActivoARS / cotizPromedio)}</>}</>}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead><tr className="bg-slate-50 text-slate-500 text-left"><th className="px-3 py-2 font-medium">Mes</th><th className="px-3 py-2 font-medium text-right">Costo laboral (ARS)</th><th className="px-3 py-2 font-medium text-right">Cotización USD</th><th className="px-3 py-2 font-medium text-right">Costo USD</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {meses.map((mes, m) => {
                  const row = costos[mes] || {};
                  const usd = Number(row.costoLaboral || 0) > 0 && Number(row.cotizacionDolar || 0) > 0 ? Number(row.costoLaboral) / Number(row.cotizacionDolar) : null;
                  return (
                    <tr key={mes} className="hover:bg-slate-50 cursor-pointer" onClick={() => { setMesDist(mes); setSemanaIdx(0); setShowSettings(true); }} title="Cargar los insumos de este mes">
                      <td className="px-3 py-1.5 text-slate-600">{MONTHS_ES[m]}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-700">{Number(row.costoLaboral || 0) > 0 ? fmtARS(row.costoLaboral) : '—'}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-500">{Number(row.cotizacionDolar || 0) > 0 ? row.cotizacionDolar : '—'}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-500">{usd != null ? 'US$ ' + fmtN(usd) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 mt-2">Tocá un mes para cargar su costo laboral, cotización y los pesos por colaborador.</p>
        </>
      ) : subtab === 'consolidado' ? (
        <>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <select value={mesDist} onChange={(e) => { setMesDist(e.target.value); setSemanaIdx(0); }} className="w-full sm:w-auto border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
              {meses.map((mes, m) => <option key={mes} value={mes}>{MONTHS_ES[m]} {anio}</option>)}
            </select>
            <button onClick={() => setShowSettings(true)} className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
              <Settings size={15} /> Settings del mes
            </button>
            <button onClick={exportarMes} className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-coop-azul text-white hover:opacity-90">
              <Download size={15} /> Exportar a Excel
            </button>
          </div>
          <div className="flex flex-wrap items-baseline gap-4 mb-3 text-sm">
            <span className="text-slate-500">Costo laboral del mes: <span className="font-mono text-slate-800">{clMes > 0 ? fmtARS(clMes) : '—'}</span></span>
            {usdMes != null && <span className="text-slate-400">≈ <span className="font-mono">US$ {fmtN(usdMes)}</span> (cotización {cdMes})</span>}
            <span className="text-slate-400">Peso asignado: <span className={`font-mono ${Math.round(dist.pesoTotal * 100) === 100 ? 'text-emerald-600' : 'text-rose-500'}`}>{pct(dist.pesoTotal)}%</span></span>
            <span className="text-slate-400">Horas activables (Cooptech): <span className="font-mono text-coop-azul">{fmtN(dist.horasActivables)} h</span></span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="text-sm w-full">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-left">
                  <th rowSpan={2} className="px-3 py-2 font-medium sticky left-0 bg-[#e9eefb] shadow-[2px_0_6px_-2px_rgba(15,23,42,0.12)] align-bottom">Colaborador</th>
                  <th rowSpan={2} className="px-1 py-2 font-medium align-bottom" style={vertStyle} title="Costo laboral del colaborador como % del total del mes (settings)">Costo Lab. %</th>
                  <th rowSpan={2} className="px-1 py-2 font-medium align-bottom" style={vertStyle} title="Suma de unidades: % del tiempo del colaborador asignado a operación">Horas asig.</th>
                  <th rowSpan={2} className="px-1 py-2 font-medium align-bottom" style={vertStyle} title="Horas asignadas × peso: % del costo total del mes que va a operación">Asignado op.</th>
                  {UNIDADES.map((u, ui) => <th key={u.id} colSpan={2} className={`px-2 py-1 font-medium text-center whitespace-nowrap border-l border-slate-200 ${ui % 2 ? 'bg-slate-100/60' : ''}`} title={u.full}>{u.label}</th>)}
                  <th rowSpan={2} className="px-3 py-2 font-medium text-right text-coop-azul align-bottom border-l border-slate-200">Cooptech</th>
                  <th rowSpan={2} className="px-3 py-2 font-medium text-left align-bottom border-l border-slate-200 min-w-[230px]">Tareas (resumen semanal)</th>
                </tr>
                <tr className="bg-slate-50 text-slate-400 text-[10px]">
                  {UNIDADES.map((u, ui) => (
                    <Fragment key={u.id}>
                      <th className={`px-2 py-1 font-medium text-center border-l border-slate-200 ${ui % 2 ? 'bg-slate-100/60' : ''}`} title="% del tiempo del colaborador">Hs. asig.</th>
                      <th className={`px-2 py-1 font-medium text-center ${ui % 2 ? 'bg-slate-100/60' : ''}`} title="% del costo total del mes">Impacto</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dist.rows.map((r0) => {
                  const sumU = sumUnidades(r0.unidades);
                  const wks = costos[mesDist]?.asignaciones?.[r0.id]?.weeks || [];
                  return (
                    <tr key={r0.id} className="border-t border-slate-100 hover:bg-slate-50/50 align-top">
                      <td className="px-3 py-1.5 text-slate-700 whitespace-nowrap sticky left-0 bg-[#e9eefb] shadow-[2px_0_6px_-2px_rgba(15,23,42,0.12)]">{r0.nombre}</td>
                      <td className="px-1 py-1.5 text-center font-mono text-slate-500">{pct1(r0.peso)}%</td>
                      <td className="px-1 py-1.5 text-center font-mono text-slate-700">{pct(sumU)}%</td>
                      <td className="px-1 py-1.5 text-center font-mono text-slate-700">{pct(sumU * r0.peso)}%</td>
                      {UNIDADES.map((u, ui) => {
                        const hs = r0.unidades[u.id] || 0;
                        const z = ui % 2 ? 'bg-slate-100/60' : '';
                        return (
                          <Fragment key={u.id}>
                            <td className={`px-2 py-1.5 text-center font-mono border-l border-slate-100 ${z}`}>{hs > 0 ? pct(hs) + '%' : '·'}</td>
                            <td className={`px-2 py-1.5 text-center font-mono text-slate-500 ${z}`}>{hs > 0 ? pct(hs * r0.peso) + '%' : '·'}</td>
                          </Fragment>
                        );
                      })}
                      <td className="px-3 py-1.5 text-right font-mono text-coop-azul border-l border-slate-100">{pct(r0.cpt)}%</td>
                      <td className="px-3 py-1.5 text-left text-[11px] text-slate-500 leading-snug border-l border-slate-100 min-w-[230px]">
                        {wks.map((wk, i) => (wk?.summary && wk.summary.trim()) ? (
                          <div key={i}><span className="font-semibold text-slate-600">Sem {i + 1}:</span> {wk.summary.trim()}</div>
                        ) : null)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-medium border-t-2 border-slate-200">
                  <td className="px-3 py-2 sticky left-0 bg-[#e9eefb] shadow-[2px_0_6px_-2px_rgba(15,23,42,0.12)]">Total</td>
                  <td className="px-1 py-2 text-center font-mono">{pct1(dist.pesoTotal)}%</td>
                  <td className="px-1 py-2 text-center font-mono text-slate-300">—</td>
                  <td className="px-1 py-2 text-center font-mono">{pct1(totAsignOp)}%</td>
                  {UNIDADES.map((u, ui) => {
                    const z = ui % 2 ? 'bg-slate-100/60' : '';
                    return (
                    <Fragment key={u.id}>
                      <td className={`px-2 py-2 text-center font-mono text-slate-300 border-l border-slate-200 ${z}`}>—</td>
                      <td className={`px-2 py-2 text-center font-mono ${z}`}>{pct1(totImpactoUnidad[u.id])}%</td>
                    </Fragment>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-mono text-coop-azul border-l border-slate-200">{pct1(totCooptechPct)}%</td>
                  <td className="px-3 py-2 border-l border-slate-200"></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-slate-400 mt-2">Valores en porcentaje. <b>Hs. asig.</b>: % del tiempo del colaborador en esa unidad. <b>Impacto</b>: % del costo total del mes. <b>Asignado op.</b>: total a clientes internos (suma de unidades). <b>Cooptech</b>: lo no asignado a unidades (incluye vacaciones, licencias, francos y semanas parciales).</p>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <h3 className="text-sm font-bold text-coop-azul mb-3">Costo laboral {MONTHS_ES[mesDistIdx]} {anio}</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { titulo: 'Operación (clientes internos)', color: 'text-slate-600', tot: totAsignOp, prom: promOp },
                { titulo: 'Cooptech (interno)', color: 'text-coop-azul', tot: totCooptechPct, prom: promCoop },
              ].map((b) => (
                <div key={b.titulo} className="bg-white rounded-lg border border-slate-200 p-3">
                  <div className={`text-xs font-semibold uppercase tracking-wide mb-2 ${b.color}`}>{b.titulo}</div>
                  <dl className="space-y-1.5 text-sm">
                    {/* Etiquetas corregidas (auditoría Excel↔app con Nadia, 16/07):
                        horas = promedio simple de horas asignadas; dinero =
                        horas ponderadas por el peso salarial de cada uno. Los
                        montos siempre usaron la ponderada (por eso coincidían). */}
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-500" title="Suma de horas asignadas dividida por la cantidad de colaboradores">Asignación total horas</dt>
                      <dd className="font-mono text-slate-700">{pct1(b.prom)}%</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-500" title="Horas asignadas ponderadas por el peso salarial de cada colaborador">Asignación en % de dinero</dt>
                      <dd className="font-mono text-slate-700">{pct1(b.tot)}%</dd>
                    </div>
                    <div className="flex items-start justify-between gap-3 pt-1.5 border-t border-slate-100">
                      <dt className="text-slate-500">Costo</dt>
                      <dd className="text-right">
                        <div className="font-mono text-slate-800">{clMes > 0 ? fmtMoney2(clMes * b.tot) : '—'}</div>
                        {clMes > 0 && cdMes > 0 && <div className="font-mono text-xs text-slate-400">{fmtUsd2((clMes * b.tot) / cdMes)}</div>}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>

            <div className="mt-4 bg-white rounded-lg border border-slate-200 p-3">
              <div className="text-xs font-semibold text-coop-azul uppercase tracking-wide mb-2">Desglose del Cooptech ({pct1(totCooptechPct)}%)</div>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div className="rounded-md bg-slate-50 border border-slate-100 p-3">
                  <div className="mb-1"><span className="font-semibold text-slate-800">Horas</span> <span className="text-coop-azul font-medium">I+D a activar</span></div>
                  <div className="font-mono text-base text-slate-800">{pct1(idDPct)}%{clMes > 0 && <span className="text-slate-500"> · {fmtMoney2(clMes * idDPct)}</span>}</div>
                  {clMes > 0 && cdMes > 0 && <div className="font-mono text-[11px] text-slate-400">{fmtUsd2((clMes * idDPct) / cdMes)}</div>}
                </div>
                <div className="rounded-md bg-slate-50 border border-slate-100 p-3">
                  <div className="mb-1 font-semibold text-slate-800">Horas asignadas a gasto</div>
                  <div className="font-mono text-base text-slate-800">{pct1(residualPct)}%{clMes > 0 && <span className="text-slate-500"> · {fmtMoney2(clMes * residualPct)}</span>}</div>
                  {clMes > 0 && cdMes > 0 && <div className="font-mono text-[11px] text-slate-400">{fmtUsd2((clMes * residualPct) / cdMes)}</div>}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <select value={mesDist} onChange={(e) => { setMesDist(e.target.value); setSemanaIdx(0); }} className="w-full sm:w-auto border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
              {meses.map((mes, m) => <option key={mes} value={mes}>{MONTHS_ES[m]} {anio}</option>)}
            </select>
            <select value={colActual?.id ?? ''} onChange={(e) => setColSel(e.target.value)} className="w-full sm:w-auto border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
              {internosMes.map((c) => {
                const cargado = (costos[mesDist]?.asignaciones?.[c.id]?.weeks || []).some((wk) => wk?.summary && wk.summary.trim());
                return <option key={c.id} value={c.id}>{cargado ? '✓ ' : ''}{c.nombre}</option>;
              })}
            </select>
            <button onClick={() => setShowSettings(true)} className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
              <Settings size={15} /> Settings del mes
            </button>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400 mb-3 flex-wrap">
            <span>Horas activables del mes (Cooptech): <span className="font-mono text-coop-azul">{fmtN(dist.horasActivables)} h</span></span>
            <span>Peso asignado del mes: <span className={`font-mono ${Math.round(dist.pesoTotal * 100) === 100 ? 'text-emerald-600' : 'text-rose-500'}`}>{pct(dist.pesoTotal)}%</span></span>
            {colActual && <span>Peso de {colActual.nombre.split(' ')[0]}: <span className="font-mono text-slate-600">{pct(costos[mesDist]?.asignaciones?.[colActual.id]?.peso_pct)}%</span></span>}
          </div>

          {!colActual ? (
            <p className="text-slate-400 text-sm">No hay colaboradores internos para asignar.</p>
          ) : (
            <>
              <p className="text-xs text-slate-400 mb-3">El mes de <b>{colActual.nombre}</b>, semana por semana. Cada semana vale <b>{pct(pesoSemana)}%</b> del mes ({weeks.length} semanas). Dentro de ese peso, asigná el % a cada unidad de negocio; lo que no asignás queda como <b>Cooptech</b> (vacaciones, licencias y francos incluidos). Las tareas vienen de la grilla; el resumen es propio de costos y no la modifica.</p>
              {weeks.map((w, wi) => {
                const asign = costos[mesDist]?.asignaciones?.[colActual.id] || {};
                const wk = asign.weeks?.[wi] || {};
                const semUnidades = wk.unidades || {};
                const tareas = tareasDeSemana(colActual.id, w.monday);
                return (
                  <div key={wi} className="bg-white rounded-xl border border-slate-200 p-4 mb-3">
                    <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
                      <span className="text-sm font-semibold text-slate-700">Semana {w.num} <span className="font-normal text-slate-400">({rangoSemana(w)}) · peso {pct(pesoSemana)}% del mes</span></span>
                      <span className="text-xs font-mono text-coop-azul">Cooptech: {pct(cooptechPctUnidades(semUnidades, pesoSemana))}%</span>
                    </div>
                    {(() => {
                      const nt = diasNoTrabajados(colActual.id, w.monday);
                      if (nt.length === 0) return null;
                      const tipos = [...new Set(nt.map((d) => d.tipo))];
                      const todaUnTipo = nt.length === 5 && tipos.length === 1;
                      return (
                        <div className={`mb-3 rounded-lg px-3 py-2 text-xs ${nt.length === 5 ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-amber-50 text-amber-700'}`}>
                          {todaUnTipo ? (
                            <span className="font-semibold">Semana completa de {nt[0].tipo.toLowerCase()} — no corresponde asignar pesos.</span>
                          ) : (
                            <>
                              <span className="font-medium">Días no trabajados:</span> {nt.map((d) => `${d.dia} (${d.tipo})`).join(' · ')}
                              {nt.length === 5 && ' — no corresponde asignar pesos.'}
                            </>
                          )}
                        </div>
                      );
                    })()}
                    <div className="grid md:grid-cols-2 gap-3 mb-3">
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-1">Tareas de la grilla</div>
                        {tareas.length > 0 ? (
                          <ul className="text-xs text-slate-600 leading-relaxed list-disc pl-4 space-y-0.5">
                            {tareas.map((t, ti) => <li key={ti}>{t}</li>)}
                          </ul>
                        ) : <p className="text-xs text-slate-300 italic">Sin tareas cargadas en la grilla esta semana.</p>}
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-slate-500">Resumen de la semana</span>
                          {tareas.length > 0 && <button onClick={() => setSummarySemana(mesDist, colActual.id, wi, tareas.join('; '), weeks.length)} className="text-[11px] text-coop-azul hover:underline">Traer de la grilla</button>}
                        </div>
                        <textarea value={wk.summary || ''} onChange={(e) => setSummarySemana(mesDist, colActual.id, wi, e.target.value, weeks.length)} onBlur={() => guardarMes(mesDist)} rows={3} className="w-full border border-slate-200 rounded px-2 py-1 text-xs" placeholder="Resumen propio de costos (no afecta la grilla)…" />
                      </div>
                    </div>
                    <div className="text-xs font-medium text-slate-500 mb-1">Asignación por unidad (%)</div>
                    <div className="flex flex-wrap gap-2">
                      {UNIDADES.map((u) => (
                        <label key={u.id} className="text-center" title={u.full}>
                          <span className="block text-[10px] text-slate-400 mb-0.5">{u.label}</span>
                          <input type="number" min="0" max={pct(pesoSemana)} value={pct(semUnidades[u.id])} onChange={(e) => setUnidadSemana(mesDist, colActual.id, wi, u.id, e.target.value, weeks.length)} onBlur={() => guardarMes(mesDist)} className="w-14 border border-slate-200 rounded px-1 py-0.5 text-center font-mono text-xs" />
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}

              {(() => {
                const asignCol = costos[mesDist]?.asignaciones?.[colActual.id] || {};
                const unidadMes = {};
                UNIDADES.forEach((u) => { unidadMes[u.id] = 0; });
                (asignCol.weeks || []).forEach((wk) => UNIDADES.forEach((u) => { unidadMes[u.id] += parseFloat(wk?.unidades?.[u.id]) || 0; }));
                const sumU = UNIDADES.reduce((s, u) => s + unidadMes[u.id], 0);
                const cooptechMes = Math.max(0, 1 - sumU);
                const totalPct = sumU + cooptechMes;
                const pesoCol = Number(asignCol.peso_pct) || 0;
                const costoIndiv = clMes * pesoCol;
                return (
                  <div className="rounded-xl border-2 border-coop-azul bg-coop-azul/5 p-4 mb-3">
                    <div className="flex flex-wrap items-center justify-between gap-1 mb-3">
                      <span className="text-sm font-bold text-coop-azul uppercase tracking-wide">Resumen del mes · {colActual.nombre}</span>
                      <span className={`text-xs font-mono ${pct(totalPct) === 100 ? 'text-slate-500' : 'text-rose-500'}`}>Total: {pct(totalPct)}%</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-xs">
                        <thead>
                          <tr className="text-slate-400 border-b border-coop-azul/20">
                            {UNIDADES.map((u) => <th key={u.id} className="px-2 py-1 text-center font-medium" title={u.full}>{u.label}</th>)}
                            <th className="px-3 py-1 text-center font-medium text-slate-600 whitespace-nowrap" title="Suma de la dedicación a unidades de negocio. Izquierda: % del tiempo del colaborador. Derecha: % del costo total del mes (dedicación × su peso).">Horas asignadas a operación</th>
                            <th className="px-2 py-1 text-center font-medium text-coop-azul">Cooptech</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="font-mono text-slate-700">
                            {UNIDADES.map((u) => <td key={u.id} className="px-2 py-1.5 text-center">{pct(unidadMes[u.id])}%</td>)}
                            <td className="px-3 py-1.5 text-center">
                              <span className="inline-flex items-end justify-center gap-3">
                                <span><span className="block font-semibold text-slate-700">{pct(sumU)}%</span><span className="block text-[9px] font-sans text-slate-400 leading-none">del colab.</span></span>
                                <span><span className="block text-slate-600">{pct(sumU * pesoCol)}%</span><span className="block text-[9px] font-sans text-slate-400 leading-none">del total</span></span>
                              </span>
                            </td>
                            <td className="px-2 py-1.5 text-center text-coop-azul font-semibold">{pct(cooptechMes)}%</td>
                          </tr>
                          {costoIndiv > 0 && (
                            <tr className="font-mono text-[11px] text-slate-500 border-t border-coop-azul/10">
                              {UNIDADES.map((u) => <td key={u.id} className="px-2 py-1 text-center">{fmtARS(costoIndiv * unidadMes[u.id])}</td>)}
                              <td className="px-3 py-1 text-center text-slate-600">{fmtARS(costoIndiv * sumU)}</td>
                              <td className="px-2 py-1 text-center text-coop-azul">{fmtARS(costoIndiv * cooptechMes)}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {costoIndiv > 0 && <div className="text-[11px] text-slate-400 mt-2">Costo de {colActual.nombre.split(' ')[0]} este mes: {fmtARS(costoIndiv)} ({pct(pesoCol)}% del costo laboral).</div>}
                  </div>
                );
              })()}

              {Number(costos[mesDist]?.costoLaboral || 0) > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-semibold text-slate-600 mb-2">Distribución del costo del mes ({fmtARS(costos[mesDist].costoLaboral)}) <span className="font-normal text-slate-400">· todas las personas, suma de las {weeks.length} semanas</span></div>
                  <div className="flex flex-wrap gap-3">
                    {UNIDADES.map((u) => (
                      <div key={u.id} className="text-sm"><span className="text-slate-400">{u.label}:</span> <span className="font-mono">{fmtARS(dist.totalesPorUnidad[u.id])}</span></div>
                    ))}
                    <div className="text-sm"><span className="text-coop-azul">Cooptech:</span> <span className="font-mono text-coop-azul">{fmtARS(dist.cooptechCosto)}</span></div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {showSettings && (
        <SettingsMesModal
          mesLabel={`${MONTHS_ES[Number(mesDist.slice(5, 7)) - 1]} ${anio}`}
          internos={internosMes}
          valores={costos[mesDist] || {}}
          onGuardar={guardarSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

// Modal de settings del reporte mensual: costo laboral total, cotización del dólar
// y el peso del costo laboral de cada colaborador. Edita un borrador local y, al guardar,
// lo aplica y persiste vía el handler del padre. Cancelar descarta sin tocar nada.
function SettingsMesModal({ mesLabel, internos, valores, onGuardar, onClose }) {
  const [cl, setCl] = useState(valores.costoLaboral ?? '');
  const [cd, setCd] = useState(valores.cotizacionDolar ?? '');
  const [pesos, setPesos] = useState(() => {
    const m = {};
    for (const c of internos) m[c.id] = Math.round((Number(valores.asignaciones?.[c.id]?.peso_pct) || 0) * 10000) / 100;
    return m;
  });
  const totalPesos = internos.reduce((s, c) => s + (Number(pesos[c.id]) || 0), 0);
  const usd = Number(cl || 0) > 0 && Number(cd || 0) > 0 ? Number(cl) / Number(cd) : null;
  const fmt = (n) => Math.round(Number(n || 0)).toLocaleString('es-AR');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <h3 className="text-lg font-semibold text-coop-negro mb-1">Settings del mes</h3>
        <p className="text-sm text-slate-400 mb-4">{mesLabel}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
          <label className="text-sm">
            <span className="block text-slate-500 mb-1">Costo laboral total (ARS)</span>
            <input type="number" value={cl} onChange={(e) => setCl(e.target.value)} className="w-full border border-slate-200 rounded px-2 py-1.5 font-mono text-sm" placeholder="—" />
          </label>
          <label className="text-sm">
            <span className="block text-slate-500 mb-1">Cotización del dólar</span>
            <input type="number" step="0.01" value={cd} onChange={(e) => setCd(e.target.value)} className="w-full border border-slate-200 rounded px-2 py-1.5 font-mono text-sm" placeholder="—" />
          </label>
        </div>
        <div className="text-xs text-slate-400 mb-4">{usd != null ? <>Equivale a <span className="font-mono text-slate-600">US$ {fmt(usd)}</span> al tipo de cambio cargado.</> : 'Cargá costo y cotización para ver el equivalente en dólares.'}</div>

        <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
          <span className="text-sm font-semibold text-slate-600">Peso del costo laboral por colaborador</span>
          <span className={`text-xs font-mono ${Math.abs(totalPesos - 100) < 0.01 ? 'text-emerald-600' : 'text-rose-500'}`}>Total: {totalPesos.toFixed(2)}%</span>
        </div>
        <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 mb-4">
          {internos.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-3 py-1.5">
              <span className="text-sm text-slate-700">{c.nombre}</span>
              <div className="flex items-center gap-1">
                <input type="number" min="0" max="100" step="0.01" value={pesos[c.id] ?? 0} onChange={(e) => setPesos((p) => ({ ...p, [c.id]: e.target.value }))} className="w-16 border border-slate-200 rounded px-1 py-0.5 text-right font-mono text-sm" />
                <span className="text-xs text-slate-400">%</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
          <button onClick={() => onGuardar({ costoLaboral: cl, cotizacionDolar: cd, pesos })} className="px-4 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90">Guardar</button>
        </div>
      </div>
    </div>
  );
}
