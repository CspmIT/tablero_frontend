import { useState, useEffect, useCallback } from 'react';
import { Shield } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';
import StatusBadge from './StatusBadge.jsx';
import DayEditModal from './DayEditModal.jsx';
import WeeklyWipModal from './WeeklyWipModal.jsx';
import { pushEstado, activarNotificaciones } from '../utils/pushClient.js';
import SwitchVista from '../components/SwitchVista.jsx';
import { mergeWeeks, findGuardiaByMonday, guardSetOf } from './guardiasUtils.js';
import {
  getMonday, addDays, fmtISO, fmtDDMM, getISOWeek, getWeekKey, DAYS_ES,
  isWorkingDay, computeDailyWipPct, computeWeeklyWipStats, fmtWipHours, dedicacionSemanalPct,
  collabsActiveInRange, buildEntriesMap, buildWipsMap,
} from './grillaUtils.js';

const ROLE_LABEL = { manager: 'Manager', gerencial: 'Gerencial', collaborator: 'Colaborador', externo: 'Externo', tercerizado: 'Tercerizado' };

export default function Grilla({ vista = 'grilla', setVista }) {
  const { api, colaboradores, me } = useData();
  // 28/08 (caso Mirko, RRHH): los externos con la solapa Grilla otorgada la ven
  // de SOLO LECTURA — necesitan los horarios de ingreso, no cargar actividades.
  const soloLectura = me?.tipo === 'externo';
  const [pushMsg, setPushMsg] = useState(null); // resultado de activar notificaciones (banner inline)
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [entries, setEntries] = useState({});
  const [wips, setWips] = useState({});
  const [feriadosMap, setFeriadosMap] = useState({});
  // Grilla típica: { colaboradorId: { '1'..'5': { estado, entryTime } } }.
  // Solo VISUAL en días sin carga; feriado y carga real la pisan (orden del render).
  const [tipica, setTipica] = useState({});
  const tipicaDe = (colabId, d) => tipica?.[colabId]?.[String(((d.getDay() + 6) % 7) + 1)] || null;
  const [guardWeeks, setGuardWeeks] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [dayCtx, setDayCtx] = useState(null); // { collab, date }
  const [wipCtx, setWipCtx] = useState(null); // { collab }
  const [resumenes, setResumenes] = useState({}); // resumen semanal de costos, por colabId
  // Invitaciones a reuniones pendientes de respuesta (ola respuestas 29/07):
  // el banner vive acá porque la Grilla es la pantalla diaria de todos.
  const [invitaciones, setInvitaciones] = useState([]);
  const cargarInvitaciones = useCallback(async () => {
    try {
      const r = await api.reuniones.list();
      setInvitaciones((r.reuniones || []).filter(x => x.miRespuesta === null));
    } catch { setInvitaciones([]); }
  }, [api]);
  useEffect(() => { cargarInvitaciones(); }, [cargarInvitaciones]);
  // Sync inverso (30/07): trae a MI grilla mis reuniones de Outlook de la
  // semana visible. Apretarlo ES el opt-in (acción explícita, sin switches).
  const [syncing, setSyncing] = useState(false);
  const sincronizarOutlook = async () => {
    setSyncing(true);
    try {
      const iso = (d) => fmtISO(d);
      const r = await api.reuniones.syncOutlook(iso(weekStart), iso(weekEnd));
      const partes = [];
      if (r.agregadas) partes.push(`${r.agregadas} nueva${r.agregadas > 1 ? 's' : ''}`);
      if (r.actualizadas) partes.push(`${r.actualizadas} actualizada${r.actualizadas > 1 ? 's' : ''}`);
      if (r.eliminadas) partes.push(`${r.eliminadas} quitada${r.eliminadas > 1 ? 's' : ''}`);
      alert(partes.length ? `Outlook sincronizado: ${partes.join(', ')}.` : 'Outlook sincronizado: tu semana ya estaba al día.');
      recargar();
    } catch (e) { alert(e.message || 'No se pudo sincronizar con Outlook'); }
    finally { setSyncing(false); }
  };

  const responderInvitacion = async (id, respuesta) => {
    try {
      const r = await api.reuniones.responder(id, respuesta);
      if (r.graphError) alert(r.graphError);
      cargarInvitaciones(); recargar();
    } catch (e) { alert(e.message || 'No se pudo responder'); }
  };

  const weekEnd = addDays(weekStart, 6);
  const dates = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)); // lunes a viernes

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      const [ents, ws, fers, guds, rs, tip] = await Promise.all([
        api.grilla.list({ desde: fmtISO(weekStart), hasta: fmtISO(weekEnd) }),
        api.grilla.wips(),
        api.feriados.list(),
        api.guardias.list(weekStart.getFullYear()),
        api.grilla.resumenSemana(fmtISO(weekStart)).catch(() => ({ resumenes: {}, cooptechPct: {} })),
        // Grilla típica (19/08): default visual por colaborador y día de semana.
        api.grilla.tipica().catch(() => ({ tipica: {} })),
      ]);
      setTipica(tip?.tipica || {});
      setResumenes(rs.resumenes || {});
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

  const guardarResumen = async (colaboradorId, summary) => {
    try {
      await api.grilla.setResumenSemana({ colaboradorId, lunes: fmtISO(weekStart), summary });
    } catch (e) { alert(e.message || 'No se pudo guardar el resumen'); }
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
      {/* 28/08: alert() nativo sobreviviente de la barrida del 27/08 → banner inline. */}
      {pushEstado() === 'default' && !pushMsg && (
        <button
          onClick={() => activarNotificaciones(api).then(() => setPushMsg({ ok: true, txt: 'Notificaciones activadas: vas a recibir invitaciones y cambios de reuniones aunque la app esté cerrada.' })).catch((e) => setPushMsg({ ok: false, txt: e.message }))}
          className="w-full text-left text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mb-3 hover:border-coop-azul/40">
          🔔 Activá las notificaciones para enterarte de invitaciones y cambios de reuniones aunque la app esté cerrada (recomendado en el celular con la app instalada).
        </button>
      )}
      {pushMsg && (
        <div className={`text-xs rounded-xl px-3 py-2 mb-3 border flex items-center justify-between gap-2 ${pushMsg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          <span>{pushMsg.txt}</span>
          <button onClick={() => setPushMsg(null)} className="opacity-60 hover:opacity-100">✕</button>
        </div>
      )}
      {invitaciones.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
          <p className="text-sm font-medium text-amber-800 mb-2">📅 Tenés {invitaciones.length === 1 ? 'una invitación pendiente' : `${invitaciones.length} invitaciones pendientes`}</p>
          <ul className="space-y-2">
            {invitaciones.map((r) => (
              <li key={r.id} className="flex items-center gap-2 flex-wrap text-sm">
                <span className="text-xs text-slate-500 whitespace-nowrap">{String(r.fecha).slice(0, 10).split('-').reverse().join('/')} · {r.horaInicio}–{r.horaFin}</span>
                <span className="min-w-0 flex-1 break-words">
                  {r.tipo === 'cliente' ? `Videollamada · ${r.titulo}` : r.titulo}
                  {r.modalidad === 'presencial' && r.lugar ? <span className="text-slate-400"> · {r.lugar}</span> : null}
                </span>
                <span className="flex gap-1.5 shrink-0">
                  <button onClick={() => responderInvitacion(r.id, 'aceptada')} className="text-xs px-2.5 py-1 rounded-lg bg-emerald-600 text-white hover:opacity-90">Aceptar</button>
                  <button onClick={() => responderInvitacion(r.id, 'provisional')} className="text-xs px-2.5 py-1 rounded-lg border border-amber-400 text-amber-700 hover:bg-amber-100">Provisional</button>
                  <button onClick={() => responderInvitacion(r.id, 'rechazada')} className="text-xs px-2.5 py-1 rounded-lg border border-red-300 text-red-600 hover:bg-red-50">Rechazar</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <SwitchVista vista={vista} setVista={setVista} />
        <div className="flex items-center gap-2 text-sm">
          {!soloLectura && (
            <button onClick={sincronizarOutlook} disabled={syncing} title="Importa a tu grilla las reuniones de tu Outlook de esta semana (las genere quien las genere)"
              className="px-2 py-1 rounded border border-slate-200 text-xs text-slate-600 hover:border-coop-azul/40 disabled:opacity-50">
              {syncing ? 'Sincronizando…' : '⇅ Outlook'}
            </button>
          )}
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
                        <td key={i} onClick={soloLectura ? undefined : () => setDayCtx({ collab: c, date: d })}
                          className={`relative px-2 py-2 align-top ${soloLectura ? '' : 'cursor-pointer hover:bg-slate-50'} ${feriadoName ? 'bg-slate-100' : ''}`}>
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
                            ) : tipicaDe(c.id, d) ? (
                              // Default de la grilla típica: solo visual (nada
                              // escrito en la base hasta que el día se guarde).
                              <div className="space-y-0.5 opacity-60">
                                <StatusBadge status={tipicaDe(c.id, d).estado} entryTime={tipicaDe(c.id, d).entryTime} />
                                <div className="text-[10px] text-slate-400 italic">{soloLectura ? 'típico' : 'típico · + cargar'}</div>
                              </div>
                            ) : (
                              <span className="text-slate-300 text-xs">{soloLectura ? '—' : '+ cargar'}</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2">
                      <button onClick={soloLectura ? undefined : () => setWipCtx({ collab: c })}
                        className={`block w-full text-left text-xs ${soloLectura ? 'cursor-default' : ''}`}>
                        <div className="flex gap-1.5">
                          <span className="text-[10px] italic text-slate-400 w-7 shrink-0 mt-px">Def.</span>
                          {wipText ? <span className="text-slate-700 min-w-0">{wipText}</span> : <span className="text-slate-300">{soloLectura ? '—' : '+ definir foco'}</span>}
                        </div>
                        <div className="flex gap-1.5 mt-1 pt-1 border-t border-slate-100">
                          <span className="text-[10px] italic text-slate-400 w-7 shrink-0 mt-px">Real</span>
                          {resumenes[c.id] ? <span className="text-coop-azul min-w-0">{resumenes[c.id]}</span> : <span className="text-slate-300">{soloLectura ? '—' : '+ resumen (costos)'}</span>}
                        </div>
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
        tipicaDia={dayCtx ? tipicaDe(dayCtx.collab.id, dayCtx.date) : null}
        onClose={() => setDayCtx(null)}
        onSave={guardarDia}
        onReunionCreada={() => { setDayCtx(null); recargar(); }}
      />

      <WeeklyWipModal
        open={!!wipCtx}
        collab={wipCtx?.collab}
        currentWip={wipCtx ? wips[getWeekKey(wipCtx.collab.id, weekStart)] || '' : ''}
        currentResumen={wipCtx ? resumenes[wipCtx.collab.id] || '' : ''}
        onClose={() => setWipCtx(null)}
        onSave={guardarWip}
        onSaveResumen={(summary) => wipCtx && guardarResumen(wipCtx.collab.id, summary)}
      />
    </div>
  );
}
