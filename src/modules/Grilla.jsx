import { useState, useEffect, useCallback } from 'react';
import { Shield } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';
import StatusBadge from './StatusBadge.jsx';
import DayEditModal from './DayEditModal.jsx';
import WeeklyWipModal from './WeeklyWipModal.jsx';
import SwitchVista from '../components/SwitchVista.jsx';
import { mergeWeeks, findGuardiaByMonday, guardSetOf } from './guardiasUtils.js';
import {
  getMonday, addDays, fmtISO, fmtDDMM, getISOWeek, getWeekKey, DAYS_ES,
  isWorkingDay, computeDailyWipPct, computeWeeklyWipStats, fmtWipHours, dedicacionSemanalPct,
  collabsActiveInRange, buildEntriesMap, buildWipsMap,
} from './grillaUtils.js';

const ROLE_LABEL = { manager: 'Manager', gerencial: 'Gerencial', collaborator: 'Colaborador', externo: 'Externo', tercerizado: 'Tercerizado' };

export default function Grilla({ vista = 'grilla', setVista }) {
  const { api, colaboradores } = useData();
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [entries, setEntries] = useState({});
  const [wips, setWips] = useState({});
  const [feriadosMap, setFeriadosMap] = useState({});
  const [guardWeeks, setGuardWeeks] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [dayCtx, setDayCtx] = useState(null); // { collab, date }
  const [wipCtx, setWipCtx] = useState(null); // { collab }

  const weekEnd = addDays(weekStart, 6);
  const dates = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)); // lunes a viernes

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      const [ents, ws, fers, guds] = await Promise.all([
        api.grilla.list({ desde: fmtISO(weekStart), hasta: fmtISO(weekEnd) }),
        api.grilla.wips(),
        api.feriados.list(),
        api.guardias.list(weekStart.getFullYear()),
      ]);
      setEntries(buildEntriesMap(ents));
      setWips(buildWipsMap(ws));
      const fmap = {};
      for (const f of (fers.data || fers || [])) fmap[String(f.fecha).slice(0, 10)] = f.nombre;
      setFeriadosMap(fmap);
      setGuardWeeks(mergeWeeks(weekStart.getFullYear(), guds.data || guds || []));
    } finally {
      setCargando(false);
    }
  }, [api, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { recargar(); }, [recargar]);

  const guardarDia = async (payload) => {
    const { collab, date } = dayCtx;
    if (payload === null) {
      await api.grilla.deleteDay(collab.id, fmtISO(date));
    } else {
      await api.grilla.upsert({ colaboradorId: collab.id, fecha: fmtISO(date), ...payload });
    }
    setDayCtx(null);
    await recargar();
  };

  const guardarWip = async (texto) => {
    const { collab } = wipCtx;
    await api.grilla.setWip({
      colaboradorId: collab.id,
      anio: weekStart.getFullYear(),
      semanaIso: getISOWeek(weekStart),
      texto,
    });
    setWipCtx(null);
    await recargar();
  };

  const visibles = collabsActiveInRange(colaboradores, weekStart, weekEnd);
  const guardSet = guardSetOf(findGuardiaByMonday(guardWeeks, weekStart, weekStart.getFullYear()));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <SwitchVista vista={vista} setVista={setVista} />
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="px-2 py-1 rounded hover:bg-slate-100">‹</button>
          <span className="text-slate-600">{fmtDDMM(weekStart)} – {fmtDDMM(weekEnd)} · {weekStart.getFullYear()}</span>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="px-2 py-1 rounded hover:bg-slate-100">›</button>
          <button onClick={() => setWeekStart(getMonday(new Date()))} className="ml-1 px-2 py-1 rounded border border-slate-200 hover:bg-slate-50">Hoy</button>
        </div>
      </div>

      {cargando ? (
        <p className="text-slate-500">Cargando…</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm border-collapse table-fixed">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-left">
                <th className="px-3 py-2 font-medium sticky left-0 z-10 bg-slate-50 w-32 shadow-[2px_0_6px_-2px_rgba(15,23,42,0.12)]">Colaborador</th>
                {dates.map((d, i) => (
                  <th key={i} className="px-3 py-2 font-medium">
                    {DAYS_ES[i]} <span className="text-slate-400 font-normal">{fmtDDMM(d)}</span>
                  </th>
                ))}
                <th className="px-3 py-2 font-medium w-44">WIP de la semana</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.length === 0 && (
                <tr><td colSpan={dates.length + 2} className="px-3 py-8 text-center text-slate-400">No hay colaboradores activos esta semana.</td></tr>
              )}
              {visibles.map((c) => {
                const stats = computeWeeklyWipStats(c.id, weekStart, entries);
                const wipText = wips[getWeekKey(c.id, weekStart)] || '';
                const esGuardia = guardSet.has(c.id);
                return (
                  <tr key={c.id} className="hover:bg-slate-50/50 align-top">
                    {/* Fondo opaco: la celda es sticky y con transparencia se ve el contenido al scrollear */}
                    <td className={`px-3 py-2 align-top sticky left-0 z-10 shadow-[2px_0_6px_-2px_rgba(15,23,42,0.12)] ${esGuardia ? 'bg-[#fef4e9] border-l-4 border-coop-naranja' : 'bg-white'}`}>
                      <div className="flex items-start gap-1 font-medium text-slate-800 break-words">
                        {esGuardia && <Shield size={13} className="text-coop-naranja mt-0.5 shrink-0" />}
                        <span>{c.nombre}</span>
                      </div>
                      <div className={`text-[10px] uppercase tracking-wider mt-0.5 ${esGuardia ? 'text-coop-naranja font-semibold' : 'text-slate-400'}`}>
                        {esGuardia ? 'De guardia' : (ROLE_LABEL[c.tipo] || 'Colaborador')}
                      </div>
                    </td>
                    {dates.map((d, i) => {
                      const entry = entries[`${c.id}:${fmtISO(d)}`];
                      const its = (entry?.items || []).filter((it) => it && it.text && it.text.trim());
                      const feriadoName = feriadosMap[fmtISO(d)];
                      // Sin etiqueta = no contabiliza en horas por proyecto: marcar
                      // los días trabajados con actividades a las que les falta tag.
                      const sinTags = entry && isWorkingDay(entry.status) && its.length > 0
                        && its.filter((it) => !(Array.isArray(it.tags) && it.tags.length)).length;
                      return (
                        <td key={i} onClick={() => setDayCtx({ collab: c, date: d })} className={`relative px-2 py-2 align-top cursor-pointer hover:bg-slate-50 ${feriadoName ? 'bg-slate-100' : ''}`}>
                          {sinTags ? (
                            <span
                              title={`${sinTags} actividad${sinTags > 1 ? 'es' : ''} sin etiqueta (no suma a horas por proyecto)`}
                              className="absolute top-1 right-1 w-4 h-4 rounded-full bg-amber-100 text-amber-600 text-[10px] font-bold leading-4 text-center select-none">
                              !
                            </span>
                          ) : null}
                          <div className="text-left">
                            {entry ? (
                              <div className="space-y-1">
                                <StatusBadge status={entry.status} entryTime={entry.entry_time} viajeLabel={entry.viaje_label} />
                                {its.length > 0 && (
                                  <ul className="text-xs text-slate-600 leading-tight">
                                    {its.map((it, idx) => (
                                      <li key={idx} className="flex items-start gap-1">
                                        <span className={it.wip ? 'text-emerald-500' : 'text-slate-300'}>•</span>
                                        <span className="break-words min-w-0">{it.text}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            ) : feriadoName ? (
                              <div className="space-y-1 opacity-75">
                                <StatusBadge status="feriado" />
                                <div className="text-[11px] text-slate-500 italic leading-tight break-words">{feriadoName}</div>
                              </div>
                            ) : (
                              <span className="text-slate-300 text-xs">+ cargar</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2">
                      <button onClick={() => setWipCtx({ collab: c })} className="block w-full text-left text-xs">
                        {wipText ? <span className="text-slate-700">{wipText}</span> : <span className="text-slate-300">+ definir foco</span>}
                        {stats.wipPctAvg !== null && (
                          <div className="text-coop-azul font-mono mt-1">{Math.round(dedicacionSemanalPct(stats) * 100)}% · {fmtWipHours(stats)}</div>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <DayEditModal
        open={!!dayCtx}
        collaborator={dayCtx?.collab}
        date={dayCtx?.date}
        entry={dayCtx ? entries[`${dayCtx.collab.id}:${fmtISO(dayCtx.date)}`] : null}
        weeklyWipText={dayCtx ? wips[getWeekKey(dayCtx.collab.id, weekStart)] || '' : ''}
        feriadoName={dayCtx ? feriadosMap[fmtISO(dayCtx.date)] || null : null}
        onClose={() => setDayCtx(null)}
        onSave={guardarDia}
        onReunionCreada={() => { setDayCtx(null); recargar(); }}
      />

      <WeeklyWipModal
        open={!!wipCtx}
        collab={wipCtx?.collab}
        currentWip={wipCtx ? wips[getWeekKey(wipCtx.collab.id, weekStart)] || '' : ''}
        onClose={() => setWipCtx(null)}
        onSave={guardarWip}
      />
    </div>
  );
}
