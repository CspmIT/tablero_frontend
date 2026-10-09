import { useState, useEffect, useCallback } from 'react';
import { useData } from '../data/DataContext.jsx';
import SwitchVista from '../components/SwitchVista.jsx';
import { getMonday, fmtISO, isActiveCollab } from './grillaUtils.js';
import {
  mergeWeeks, findGuardiaByMonday, ganadosForAssignment, ferMidWeek,
  bridgeDaysAtStart, bridgeDaysToNext, cellState, nextState, setCell,
} from './guardiasUtils.js';
import { armarExportRrhh, semanasExportables, ENCABEZADO_RRHH, HOJA_ROLES, AREA_DEFAULT } from './guardiasExportRrhh.js';
import { fmtISO as isoDe, addDays as masDias } from './grillaUtils.js';

// 28/08: Guardias dejó el menú lateral y es una pestaña del selector de la
// Grilla (vista/setVista llegan desde App). Sin props sigue andando sola
// (compat con permisos viejos que aterricen en activo === 'guardias').
export default function Guardias({ vista, setVista }) {
  const { api, colaboradores, me } = useData();
  // 09/10 (ítem 1 del backlog, RRHH/Mirko): exportar las guardias al Excel
  // que su importador ya consume. El modal tilda semanas y arma el archivo.
  const [exportOpen, setExportOpen] = useState(false);
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
        {setVista
          ? <SwitchVista vista={vista} setVista={setVista} />
          : <h2 className="text-xl font-semibold text-coop-negro">Guardias <span className="text-sm font-normal text-slate-400">rotación {anio}</span></h2>}
        <div className="flex items-center gap-2 text-sm">
          {/* Con el selector a la izquierda ya no está el «rotación {anio}» del título nuestro. */}
          {setVista && <span className="text-slate-400">rotación</span>}
          <button onClick={() => setAnio(anio - 1)} className="px-2 py-1 rounded hover:bg-slate-100">‹</button>
          <span className="text-slate-600">{anio}</span>
          <button onClick={() => setAnio(anio + 1)} className="px-2 py-1 rounded hover:bg-slate-100">›</button>
          <button onClick={() => setExportOpen(true)} title="Genera el Excel que el importador del sistema de RRHH ya consume"
            className="ml-2 px-3 py-1.5 rounded-lg border border-coop-azul text-coop-azul text-sm hover:bg-coop-azul/5">
            ⬇ Exportar para RRHH
          </button>
        </div>
      </div>

      {exportOpen && (
        <ExportRrhhModal api={api} weeks={weeks} roster={guardiaCollabs} feriadosMap={feriadosMap} anio={anio}
          esConduccion={['manager', 'gerencial'].includes(me?.tipo)} onClose={() => setExportOpen(false)} />
      )}

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

// ─────────── Exportar para RRHH (09/10 — importador de Mirko) ───────────
// Tilda las semanas a exportar y genera el xlsx EXACTO al formato del
// importador: un bloque del equipo por semana (quien no hace guardia va con el
// renglón vacío), teléfono del primer día hábil 08:00 al primer día hábil de
// la semana siguiente 08:00, «Gana franco: sí». El importador NO conoce el
// franco doble: esos casos se listan acá para cargar el 2do a mano.
// Los legajos y el nombre con que RRHH lista a cada uno NO viven en el tablero:
// se completan acá una vez (conducción) y quedan guardados en el servidor.
function ExportRrhhModal({ api, weeks, roster, feriadosMap, anio, esConduccion, onClose }) {
  const [mapping, setMapping] = useState({});
  const [area, setArea] = useState(AREA_DEFAULT);
  const [cargado, setCargado] = useState(false);
  const [sel, setSel] = useState(() => {
    // Default: las próximas 4 semanas con guardia (lunes de hoy en adelante).
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    return new Set(semanasExportables(weeks)
      .filter((w) => w.monday >= hoy)
      .slice(0, 4).map((w) => w.week));
  });
  const [exportado, setExportado] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.guardias.exportRrhh().then((r) => {
      const c = r?.config || {};
      setMapping(c.colaboradores || {});
      if (c.area) setArea(c.area);
      setCargado(true);
    }).catch(() => setCargado(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportables = semanasExportables(weeks);
  const semanasSel = exportables.filter((w) => sel.has(w.week));
  // 09/10 bis (pedido de Leonardo): el LEGAJO vive en la ficha del colaborador
  // (Equipo → campo opcional «Legajo (RRHH)») — acá solo se muestra. El nombre
  // según RRHH sigue siendo un override de este modal (Configuracion). Compat:
  // si alguien cargó un legajo acá antes del cambio, vale como respaldo.
  const mapeoEfectivo = Object.fromEntries(roster.map((c) => [c.id, {
    legajo: String(c.legajo ?? '').trim() || String(mapping[c.id]?.legajo ?? '').trim(),
    nombre: mapping[c.id]?.nombre || '',
  }]));
  const { filas, francoDobles, faltanLegajos } = armarExportRrhh({
    semanas: semanasSel, roster, mapping: mapeoEfectivo, area, feriadosMap, anio, weeks,
  });
  const nombresDe = (w) => (w.asignaciones || []).filter((a) => !a.vacation)
    .map((a) => roster.find((c) => c.id === a.id)?.nombre).filter(Boolean).join(', ');

  const setMap = (id, campo, valor) => {
    setMapping((m) => ({ ...m, [id]: { ...(m[id] || {}), [campo]: valor } }));
    setExportado('');
  };

  const exportar = async () => {
    if (!semanasSel.length || faltanLegajos.length) return;
    setError('');
    try {
      // El mapeo es dato maestro: la conducción lo deja guardado para todos.
      if (esConduccion) {
        api.guardias.guardarExportRrhh({ area, colaboradores: mapping }).catch(() => {});
      }
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.aoa_to_sheet([ENCABEZADO_RRHH]);
      // Filas con tipos EXACTOS a la plantilla: fechas como fecha (dd/mm/aaaa)
      // y horas como hora de Excel (HH:mm) — no texto.
      filas.forEach((f, i) => {
        const r = i + 2;
        const celdas = f.map((v, j) => {
          if (v instanceof Date) return { t: 'd', v, z: 'dd/mm/yyyy' };
          if ((j === 4 || j === 6) && v === '08:00') return { t: 'n', v: 8 / 24, z: 'hh:mm' };
          return { t: typeof v === 'number' ? 'n' : 's', v };
        });
        celdas.forEach((cell, j) => { ws[XLSX.utils.encode_cell({ r: r - 1, c: j })] = cell; });
      });
      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: filas.length, c: ENCABEZADO_RRHH.length - 1 } });
      ws['!cols'] = [{ wch: 8 }, { wch: 28 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 18 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Guardias');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(HOJA_ROLES), 'Roles por área');
      const lunes = semanasSel.map((w) => isoDe(w.monday));
      const nombre = `guardias-rrhh-${lunes[0]}_a_${isoDe(masDias(semanasSel[semanasSel.length - 1].monday, 7))}.xlsx`;
      XLSX.writeFile(wb, nombre);
      setExportado(nombre); // regla 07/10: toda descarga confirma visualmente
    } catch (e) {
      setError('No se pudo generar el archivo: ' + (e.message || e));
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center overflow-y-auto p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-6 p-5">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-semibold text-slate-800">⬇ Exportar guardias para RRHH</h3>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600 px-2">✕</button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Genera el Excel que el importador del sistema de RRHH ya consume: un bloque del equipo por semana tildada.
          El teléfono se recibe el primer día hábil de la semana a las 08:00 y se entrega el primer día hábil de la siguiente a las 08:00 (los feriados corren el día solos).
        </p>

        {/* Mapeo legajos / nombre RRHH (dato maestro, lo guarda conducción) */}
        <div className="border border-slate-200 rounded-xl p-3 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-sm font-medium text-slate-700">Legajos (de la ficha de Equipo) y nombres según RRHH</p>
            <span className="ml-auto flex items-center gap-1 text-xs text-slate-500">Área:
              <input value={area} onChange={(e) => { setArea(e.target.value); setExportado(''); }} disabled={!esConduccion}
                className="border border-slate-300 rounded-lg px-2 py-1 text-xs w-28 disabled:bg-slate-50" />
            </span>
          </div>
          {!cargado ? <p className="text-xs text-slate-400">Cargando…</p> : (
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
              {roster.map((c) => (
                <div key={c.id} className="flex items-center gap-1.5">
                  <span title="El legajo se carga en Equipo → ficha del colaborador («Legajo (RRHH)»)"
                    className={`text-xs font-mono rounded-lg px-2 py-1 w-14 text-center border ${mapeoEfectivo[c.id]?.legajo ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-red-200 bg-red-50 text-red-400'}`}>
                    {mapeoEfectivo[c.id]?.legajo || '—'}
                  </span>
                  <input value={mapping[c.id]?.nombre || ''} onChange={(e) => setMap(c.id, 'nombre', e.target.value)}
                    placeholder={c.nombre} disabled={!esConduccion} title="Nombre tal como lo lista RRHH (Apellido Nombre)"
                    className="border border-slate-300 rounded-lg px-2 py-1 text-xs flex-1 disabled:bg-slate-50" />
                </div>
              ))}
            </div>
          )}
          {!esConduccion && <p className="text-[11px] text-slate-400 mt-1.5">Los nombres según RRHH los completa la conducción; vos exportás con lo guardado.</p>}
        </div>

        {/* Semanas a exportar */}
        <div className="border border-slate-200 rounded-xl p-3 mb-3">
          <p className="text-sm font-medium text-slate-700 mb-2">Semanas a exportar <span className="text-xs text-slate-400">({semanasSel.length} tildadas)</span></p>
          {exportables.length === 0 ? <p className="text-xs text-slate-400">No hay semanas con guardias asignadas en {anio}.</p> : (
            <div className="max-h-48 overflow-y-auto grid gap-1">
              {exportables.map((w) => (
                <label key={w.week} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 rounded px-1.5 py-0.5">
                  <input type="checkbox" checked={sel.has(w.week)}
                    onChange={() => { setSel((s) => { const n = new Set(s); if (n.has(w.week)) n.delete(w.week); else n.add(w.week); return n; }); setExportado(''); }} />
                  <span className="font-mono text-xs text-slate-500 w-20">{w.range.split(' al ')[0]} →</span>
                  <span className="text-slate-700 text-xs truncate">{nombresDe(w)}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {faltanLegajos.length > 0 && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 mb-2">
            Falta el legajo de: <b>{faltanLegajos.join(', ')}</b> — cargalo en Equipo → ficha del colaborador (campo «Legajo (RRHH)») y reabrí este modal.
          </p>
        )}
        {francoDobles.length > 0 && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-2">
            <b>Franco doble — el 2do se carga A MANO en el sistema de RRHH</b> (el importador solo admite un «sí»):
            {francoDobles.map((f, i) => <div key={i}>· {f.nombre} — semana {String(f.week).padStart(2, '0')} ({f.range})</div>)}
          </div>
        )}
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

        <div className="flex items-center gap-2">
          {exportado && <span className="text-xs text-emerald-600 font-medium">✓ Exportado: {exportado}{esConduccion ? ' · mapeo guardado' : ''}</span>}
          <button onClick={exportar} disabled={!semanasSel.length || faltanLegajos.length > 0}
            className="ml-auto px-4 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90 disabled:opacity-40">
            ⬇ Exportar {semanasSel.length ? `${semanasSel.length} semana${semanasSel.length === 1 ? '' : 's'}` : ''} (.xlsx)
          </button>
        </div>
      </div>
    </div>
  );
}
