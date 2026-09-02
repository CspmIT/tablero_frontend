import { useState, useEffect, useCallback } from 'react';
import { useData } from '../data/DataContext.jsx';
import StatusBadge from './StatusBadge.jsx';
import DayEditModal from './DayEditModal.jsx';
import SwitchVista from '../components/SwitchVista.jsx';
import {
  getMonday, addDays, fmtISO, fmtDDMM, getWeekKey, DAYS_ES,
  computeWeeklyWipStats, fmtWipHours, dedicacionSemanalPct, buildEntriesMap, buildWipsMap, isWorkingDay,
  ordenarItemsPorHora,
} from './grillaUtils.js';

export default function MiSemana({ vista = 'misemana', setVista }) {
  const { api, me, colaboradores } = useData();
  const yo = colaboradores.find((c) => c.id === me?.colaboradorId);

  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [entries, setEntries] = useState({});
  const [wips, setWips] = useState({});
  const [feriadosMap, setFeriadosMap] = useState({});
  // Grilla típica (default visual; feriado y carga real la pisan por orden de render).
  const [tipica, setTipica] = useState({});
  const tipicaDe = (colabId, d) => tipica?.[colabId]?.[String(((d.getDay() + 6) % 7) + 1)] || null;
  const [cargando, setCargando] = useState(true);
  const [dayCtx, setDayCtx] = useState(null);
  const [cards, setCards] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [descartadas, setDescartadas] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kanban_sug_desc') || '[]'); } catch { return []; }
  });
  const [descartadasCrm, setDescartadasCrm] = useState(() => {
    try { return JSON.parse(localStorage.getItem('crm_sug_desc') || '[]'); } catch { return []; }
  });
  const [editKey, setEditKey] = useState(null);
  const [editTexto, setEditTexto] = useState('');
  const [editFecha, setEditFecha] = useState('');

  const weekEnd = addDays(weekStart, 6);
  const dates = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));

  const recargar = useCallback(async () => {
    if (!yo) { setCargando(false); return; }
    setCargando(true);
    try {
      const [ents, ws, fers, tip] = await Promise.all([
        api.grilla.list({ colaboradorId: yo.id, desde: fmtISO(weekStart), hasta: fmtISO(weekEnd) }),
        api.grilla.wips(),
        api.feriados.list(),
        // Grilla típica (19/08): default visual en los días propios sin carga.
        api.grilla.tipica().catch(() => ({ tipica: {} })),
      ]);
      setTipica(tip?.tipica || {});
      setEntries(buildEntriesMap(ents));
      setWips(buildWipsMap(ws));
      const fmap = {};
      for (const f of (fers.data || fers || [])) fmap[String(f.fecha).slice(0, 10)] = f.nombre;
      setFeriadosMap(fmap);
      // Sugerencias (opcionales): si alguna fuente falla, la semana igual carga.
      try { const tks = await api.tareas.list(); setCards(tks.data || tks || []); } catch { setCards([]); }
      try {
        const acts = await api.actividades.list({ colaboradorId: yo.id, desde: fmtISO(weekStart), hasta: fmtISO(weekEnd) });
        setActividades(acts.data || acts || []);
      } catch { setActividades([]); }
    } finally {
      setCargando(false);
    }
  }, [api, weekStart, yo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { recargar(); }, [recargar]);

  if (!yo) {
    return <p className="text-slate-500">Tu usuario todavía no está vinculado a un colaborador del tablero.</p>;
  }

  const guardarDia = async (payload) => {
    const { date } = dayCtx;
    if (payload === null) await api.grilla.deleteDay(yo.id, fmtISO(date));
    else await api.grilla.upsert({ colaboradorId: yo.id, fecha: fmtISO(date), ...payload });
    setDayCtx(null);
    await recargar();
  };

  const wipText = wips[getWeekKey(yo.id, weekStart)] || '';
  const stats = computeWeeklyWipStats(yo.id, weekStart, entries);

  // Una sugerencia ya fue sumada si su id aparece en cualquier día (sirve cuando se edita la fecha).
  const yaAgregado = (campo, id) => Object.values(entries).some((e) => (e?.items || []).some((it) => it && it[campo] === id));

  // Sugerencias del Kanban: tarjetas movidas esta semana (a doing/done) donde es responsable
  // y que todavía no sumó a su grilla. Las puede agregar como ítem WIP de ese día, o descartar.
  const weekStartISO = fmtISO(weekStart);
  const weekEndISO = fmtISO(weekEnd);
  const sugerencias = cards.flatMap((c) => {
    if (!(c.ownersIds || []).includes(yo.id)) return [];
    if (c.kanbanCol !== 'doing' && c.kanbanCol !== 'done') return [];
    const fechaMov = c.kanbanCol === 'done' ? c.closedAt : c.startedAt;
    if (!fechaMov) return [];
    const f = String(fechaMov).slice(0, 10);
    if (f < weekStartISO || f > weekEndISO) return [];
    if (yaAgregado('cardId', c.id)) return [];
    if (descartadas.includes(`${c.id}:${f}`)) return [];
    return [{ card: c, fecha: f }];
  });

  const agregarSugerencia = async (card, fechaISO, textoOverride) => {
    const cur = entries[`${yo.id}:${fechaISO}`] || {};
    const items = [...(cur.items || []), { text: textoOverride || card.titulo, wip: true, tags: ['kanban'], cardId: card.id }];
    await api.grilla.upsert({
      colaboradorId: yo.id, fecha: fechaISO,
      status: cur.status || 'present',
      entry_time: cur.entry_time || null,
      viaje_label: cur.viaje_label || null,
      items, horas_extra: cur.horas_extra || null,
    });
    await recargar();
  };

  const descartarSugerencia = (card, fechaISO) => {
    const next = [...descartadas, `${card.id}:${fechaISO}`];
    setDescartadas(next);
    try { localStorage.setItem('kanban_sug_desc', JSON.stringify(next)); } catch { /* sin persistencia si el navegador la bloquea */ }
  };

  // Sugerencias del CRM: actividades (visita/videollamada/evento) del colaborador en la semana
  // que todavía no sumó a su grilla. Mismo criterio que las del Kanban.
  const TIPO_ACT = { visita: 'Visita', videollamada: 'Videollamada', evento: 'Evento' };
  const sugerenciasCrm = actividades.flatMap((a) => {
    if (a.colaboradorId !== yo.id) return [];
    const f = String(a.fecha).slice(0, 10);
    if (f < weekStartISO || f > weekEndISO) return [];
    if (yaAgregado('actId', a.id)) return [];
    if (descartadasCrm.includes(`${a.id}`)) return [];
    const org = a.lead?.organizacion ? ` — ${a.lead.organizacion}` : '';
    return [{ act: a, fecha: f, texto: `CRM: ${TIPO_ACT[a.tipo] || a.tipo}${org}` }];
  });

  const agregarSugerenciaCrm = async (act, fechaISO, texto) => {
    const cur = entries[`${yo.id}:${fechaISO}`] || {};
    const items = [...(cur.items || []), { text: texto, wip: true, tags: ['crm'], actId: act.id }];
    await api.grilla.upsert({
      colaboradorId: yo.id, fecha: fechaISO,
      status: cur.status || 'present',
      entry_time: cur.entry_time || null, viaje_label: cur.viaje_label || null,
      items, horas_extra: cur.horas_extra || null,
    });
    await recargar();
  };

  const descartarSugerenciaCrm = (act) => {
    const next = [...descartadasCrm, `${act.id}`];
    setDescartadasCrm(next);
    try { localStorage.setItem('crm_sug_desc', JSON.stringify(next)); } catch { /* idem */ }
  };

  // Lista combinada para mostrar Kanban + CRM en un solo lugar.
  const sugerenciasTodas = [
    ...sugerencias.map((s) => ({ key: `k:${s.card.id}:${s.fecha}`, origen: 'Kanban', fecha: s.fecha, texto: s.card.titulo, onAdd: () => agregarSugerencia(s.card, s.fecha), onAddCustom: (txt, f) => agregarSugerencia(s.card, f, txt), onSkip: () => descartarSugerencia(s.card, s.fecha) })),
    ...sugerenciasCrm.map((s) => ({ key: `c:${s.act.id}`, origen: 'CRM', fecha: s.fecha, texto: s.texto, onAdd: () => agregarSugerenciaCrm(s.act, s.fecha, s.texto), onAddCustom: (txt, f) => agregarSugerenciaCrm(s.act, f, txt), onSkip: () => descartarSugerenciaCrm(s.act) })),
  ];

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

      {/* Banner WIP de la semana */}
      <div className="bg-coop-azul/5 border border-coop-azul/15 rounded-xl px-4 py-3 mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-slate-500">WIP de la semana</div>
          {wipText ? <div className="text-slate-700">{wipText}</div> : <div className="text-slate-400 italic">aún no asignado por el manager</div>}
        </div>
        {stats.wipPctAvg !== null && (
          <div className="text-left sm:text-right shrink-0">
            <div className="text-xs text-slate-500">Tu dedicación a la fecha</div>
            <div className="font-mono text-coop-azul">{Math.round(dedicacionSemanalPct(stats) * 100)}% · {stats.workedDays}d · {fmtWipHours(stats)}</div>
          </div>
        )}
      </div>

      {sugerenciasTodas.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-3">
          <div className="text-xs font-semibold text-amber-700 mb-2">Actividad de la semana — ¿la sumás a tu día?</div>
          <div className="space-y-1.5">
            {sugerenciasTodas.map((s) => (
              <div key={s.key} className="flex items-center gap-2 text-sm flex-wrap">
                <span className="text-[10px] uppercase tracking-wide text-slate-400 w-14 shrink-0">{s.origen}</span>
                {editKey === s.key ? (
                  <>
                    <input type="date" value={editFecha} onChange={(e) => setEditFecha(e.target.value)} className="border border-slate-200 rounded px-2 py-1 text-xs shrink-0" />
                    <input value={editTexto} onChange={(e) => setEditTexto(e.target.value)} className="flex-1 min-w-[140px] border border-slate-200 rounded px-2 py-1 text-sm" />
                    <button onClick={() => { s.onAddCustom(editTexto.trim() || s.texto, editFecha); setEditKey(null); }} className="text-xs px-2 py-1 rounded bg-coop-azul text-white hover:opacity-90 shrink-0">Guardar</button>
                    <button onClick={() => setEditKey(null)} className="text-xs px-2 py-1 rounded text-slate-400 hover:bg-slate-100 shrink-0">Cancelar</button>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-slate-400 w-12 shrink-0">{fmtDDMM(new Date(s.fecha + 'T00:00:00'))}</span>
                    <span className="flex-1 min-w-0 text-slate-700 truncate">{s.texto}</span>
                    <button onClick={s.onAdd} className="text-xs px-2 py-1 rounded bg-coop-azul text-white hover:opacity-90 shrink-0">Agregar</button>
                    <button onClick={() => { setEditKey(s.key); setEditTexto(s.texto); setEditFecha(s.fecha); }} className="text-xs px-2 py-1 rounded text-slate-600 hover:bg-slate-100 shrink-0">Editar</button>
                    <button onClick={s.onSkip} className="text-xs px-2 py-1 rounded text-slate-400 hover:bg-slate-100 shrink-0" title="La hizo otra persona">Descartar</button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-sm text-slate-500 mb-3">Cargá tu día con un click. Lo que cargues aparece también en la grilla del manager.</p>

      {cargando ? (
        <p className="text-slate-500">Cargando…</p>
      ) : (
        <div className="space-y-2">
          {dates.map((d, i) => {
            const entry = entries[`${yo.id}:${fmtISO(d)}`];
            const its = ordenarItemsPorHora((entry?.items || []).filter((it) => it && it.text && it.text.trim()));
            const feriadoName = feriadosMap[fmtISO(d)];
            const sinTags = entry && isWorkingDay(entry.status) && its.length > 0
              && its.filter((it) => !(Array.isArray(it.tags) && it.tags.length)).length;
            return (
              <button
                key={i}
                onClick={() => setDayCtx({ collab: yo, date: d })}
                className="relative w-full text-left bg-white border border-slate-200 rounded-xl px-4 py-3 hover:bg-slate-50 flex items-start gap-3 sm:gap-4"
              >
                {sinTags ? (
                  <span title={`${sinTags} actividad${sinTags > 1 ? 'es' : ''} sin etiqueta (no suma a horas por proyecto)`}
                    className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-amber-100 text-amber-600 text-[10px] font-bold leading-4 text-center select-none">!</span>
                ) : null}
                <div className="w-20 sm:w-24 shrink-0">
                  <div className="font-medium text-slate-700 text-sm sm:text-base">{DAYS_ES[i]}</div>
                  <div className="text-xs text-slate-400">{fmtDDMM(d)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  {entry ? (
                    <div className="space-y-1">
                      <StatusBadge status={entry.status} entryTime={entry.entry_time} viajeLabel={entry.viaje_label} />
                      {its.length > 0 && (
                        <ul className="text-sm text-slate-600">
                          {its.map((it, idx) => (
                            <li key={idx} className="flex items-start gap-1">
                              <span className={it.wip ? 'text-emerald-500' : 'text-slate-300'}>•</span>
                              <span>{it.text}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : feriadoName ? (
                    <div className="space-y-1">
                      <StatusBadge status="feriado" />
                      <div className="text-[11px] text-slate-500 italic leading-tight break-words">{feriadoName}</div>
                    </div>
                  ) : tipicaDe(yo.id, d) ? (
                    // Default de la grilla típica: visual — se confirma al guardar el día.
                    <div className="space-y-0.5 opacity-60">
                      <StatusBadge status={tipicaDe(yo.id, d).estado} entryTime={tipicaDe(yo.id, d).entryTime} />
                      <div className="text-[10px] text-slate-400 italic">tu horario típico — tocá para completar el día</div>
                    </div>
                  ) : (
                    <span className="text-slate-300 text-sm">Sin cargar — tocá para completar</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <DayEditModal
        open={!!dayCtx}
        collaborator={dayCtx?.collab}
        date={dayCtx?.date}
        entry={dayCtx ? entries[`${yo.id}:${fmtISO(dayCtx.date)}`] : null}
        weeklyWipText={wipText}
        feriadoName={dayCtx ? feriadosMap[fmtISO(dayCtx.date)] || null : null}
        tipicaDia={dayCtx ? tipicaDe(yo.id, dayCtx.date) : null}
        onClose={() => setDayCtx(null)}
        onSave={guardarDia}
      />
    </div>
  );
}
