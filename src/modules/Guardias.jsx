import { useState, useEffect, useCallback } from 'react';
import { useData } from '../data/DataContext.jsx';
import { getMonday, fmtISO, isActiveCollab } from './grillaUtils.js';
import {
  mergeWeeks, findGuardiaByMonday, ganadosForAssignment, ferMidWeek,
  bridgeDaysAtStart, bridgeDaysToNext, cellState, nextState, setCell,
} from './guardiasUtils.js';

export default function Guardias() {
  const { api, colaboradores } = useData();
  const [anio, setAnio] = useState(() => new Date().getFullYear());
  const [weeks, setWeeks] = useState([]);
  const [feriadosMap, setFeriadosMap] = useState({});
  const [cargando, setCargando] = useState(true);
  const [ordenIds, setOrdenIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('guardia_orden') || 'null'); } catch { return null; }
  });

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      const [rows, fers] = await Promise.all([api.guardias.list(anio), api.feriados.list()]);
      setWeeks(mergeWeeks(anio, rows.data || rows || []));
      const fmap = {};
      for (const f of (fers.data || fers || [])) fmap[String(f.fecha).slice(0, 10)] = f.nombre;
      setFeriadosMap(fmap);
    } finally {
      setCargando(false);
    }
  }, [api, anio]);

  useEffect(() => { recargar(); }, [recargar]);

  const guardiaCollabs = (() => {
    const arr = colaboradores.filter((c) => c.haceGuardia && isActiveCollab(c));
    if (ordenIds) {
      const pos = new Map(ordenIds.map((id, i) => [String(id), i]));
      return arr.sort((a, b) => (pos.has(String(a.id)) ? pos.get(String(a.id)) : 999) - (pos.has(String(b.id)) ? pos.get(String(b.id)) : 999));
    }
    return arr.sort((a, b) => a.id - b.id);
  })();
  const currentWeek = findGuardiaByMonday(weeks, getMonday(new Date()), anio);

  const onCell = async (w, collabId) => {
    const ns = nextState(cellState(w.asignaciones, collabId));
    const asignaciones = setCell(w.asignaciones, collabId, ns);
    // Actualizo solo esa semana en memoria; no recargo todo para no reiniciar el scroll.
    setWeeks((prev) => prev.map((x) => (x.week === w.week ? { ...x, asignaciones } : x)));
    try {
      await api.guardias.setWeek({ anio, week: w.week, range: w.range, asignaciones });
    } catch (e) {
      await recargar(); // si falla la persistencia, recargo para reflejar el estado real
    }
  };

  // Reordena las columnas de guardia. El orden se guarda en este navegador (sin tocar el backend).
  const moverColumna = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= guardiaCollabs.length) return;
    const arr = [...guardiaCollabs];
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    const ids = arr.map((c) => c.id);
    setOrdenIds(ids);
    try { localStorage.setItem('guardia_orden', JSON.stringify(ids)); } catch (e) { /* si el navegador bloquea el guardado, queda solo en pantalla */ }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-xl font-semibold text-coop-negro">Guardias <span className="text-sm font-normal text-slate-400">rotación {anio}</span></h2>
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => setAnio(anio - 1)} className="px-2 py-1 rounded hover:bg-slate-100">‹</button>
          <span className="text-slate-600">{anio}</span>
          <button onClick={() => setAnio(anio + 1)} className="px-2 py-1 rounded hover:bg-slate-100">›</button>
        </div>
      </div>

      <p className="text-sm text-slate-500 mb-3">
        Tocá una celda para rotar: <b>sin guardia → de guardia → vacaciones</b>. El número es cuántos francos suma esa guardia (1 base, + feriados de la semana y puentes).
      </p>

      {cargando ? (
        <p className="text-slate-500">Cargando…</p>
      ) : guardiaCollabs.length === 0 ? (
        <p className="text-sm text-slate-400">No hay colaboradores que hagan guardia. Activá "Participa de la rotación de guardias" en Equipo.</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="text-sm w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="border border-slate-200 px-2 py-2 font-medium text-[11px] uppercase tracking-wide w-12">Sem</th>
                <th className="border border-slate-200 px-3 py-2 font-medium text-[11px] uppercase tracking-wide text-left">Rango</th>
                {guardiaCollabs.map((c, i) => (
                  <th key={c.id} className="border border-slate-200 px-1 py-2 font-medium text-center align-bottom leading-tight break-words w-20">
                    <div className="break-words">{c.nombre}</div>
                    <div className="flex items-center justify-center gap-2 mt-1">
                      <button onClick={() => moverColumna(i, -1)} disabled={i === 0} className="text-slate-400 hover:text-coop-azul disabled:opacity-25 leading-none text-base" title="Mover a la izquierda">‹</button>
                      <button onClick={() => moverColumna(i, 1)} disabled={i === guardiaCollabs.length - 1} className="text-slate-400 hover:text-coop-azul disabled:opacity-25 leading-none text-base" title="Mover a la derecha">›</button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => {
                const isCurrent = currentWeek && currentWeek.week === w.week;
                const midFer = ferMidWeek(w, feriadosMap, anio);
                const bridge = bridgeDaysAtStart(w, feriadosMap, anio);
                const extiende = bridgeDaysToNext(w, feriadosMap, weeks, anio);
                return (
                  <tr key={w.week} className={isCurrent ? 'bg-coop-naranja/5' : ''}>
                    <td className="border border-slate-200 px-2 py-1.5 font-mono text-xs text-slate-500 text-center">{String(w.week).padStart(2, '0')}</td>
                    <td className="border border-slate-200 px-3 py-1.5 whitespace-nowrap text-slate-600 font-mono text-xs">
                      {w.range}
                      {midFer.length > 0 && <span className="ml-2 text-xs text-amber-600">feriado</span>}
                      {bridge > 0 && <span className="ml-2 text-xs text-amber-600">puente</span>}
                      {extiende > 0 && <span className="ml-2 text-xs text-emerald-600">+{extiende}d</span>}
                    </td>
                    {guardiaCollabs.map((c) => {
                      const st = cellState(w.asignaciones, c.id);
                      const a = (w.asignaciones || []).find((x) => x.id === c.id);
                      const ganados = a && !a.vacation ? ganadosForAssignment(a, w, feriadosMap, anio, weeks) : 0;
                      // Color por cantidad de francos que suma la guardia: más distinguible que un tono único.
                      let cls = 'text-slate-300 hover:bg-slate-50';
                      let label = '·';
                      if (st === 'vac') { cls = 'bg-slate-100 text-slate-400 italic text-xs'; label = 'vac.'; }
                      else if (st === 'assigned') {
                        label = String(ganados);
                        if (ganados >= 2) cls = 'bg-blue-600 text-white font-bold';
                        else cls = 'bg-slate-800 text-white font-bold';
                      }
                      return (
                        <td key={c.id} className="border border-slate-200 p-0">
                          <button onClick={() => onCell(w, c.id)} className={`w-full h-9 font-mono transition hover:opacity-80 ${cls}`} title={`${c.nombre} · semana ${String(w.week).padStart(2, '0')}`}>
                            {label}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
