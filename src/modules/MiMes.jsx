import { useState, useEffect, useCallback, useMemo } from 'react';
import { useData } from '../data/DataContext.jsx';
import StatusBadge from './StatusBadge.jsx';
import SwitchVista from '../components/SwitchVista.jsx';
import { fmtISO, buildEntriesMap, isActiveCollab, isWorkingDay } from './grillaUtils.js';

// Vista "Mi mes" (pedido Carola, 07/07): calendario mensual de SOLO LECTURA por
// colaborador. Panorama completo de estados e ítems del mes; la edición sigue
// viviendo en la grilla semanal / Mi semana.

const mesActualStr = () => new Date().toISOString().slice(0, 7);
const MESES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function MiMes({ vista = 'mimes', setVista }) {
  const { api, me, colaboradores } = useData();
  const [mes, setMes] = useState(mesActualStr);
  const [colabId, setColabId] = useState(null); // null hasta resolver "yo"
  const [entries, setEntries] = useState({});
  const [feriadosMap, setFeriadosMap] = useState({});
  const [cargando, setCargando] = useState(true);
  const [diaAbierto, setDiaAbierto] = useState(null); // { fecha, dia, entry, feriado }

  const activos = colaboradores.filter(isActiveCollab);
  // Por defecto, el usuario logueado; si no está en la lista (p.ej. gerencial externo), el primero.
  useEffect(() => {
    if (colabId != null) return;
    const propio = activos.find((c) => c.id === me?.colaboradorId);
    if (propio) setColabId(propio.id);
    else if (activos.length) setColabId(activos[0].id);
  }, [me, activos, colabId]);

  const [anio, mesNum] = useMemo(() => mes.split('-').map(Number), [mes]);
  const primerDia = useMemo(() => new Date(anio, mesNum - 1, 1), [anio, mesNum]);
  const ultimoDia = useMemo(() => new Date(anio, mesNum, 0), [anio, mesNum]);

  const recargar = useCallback(async () => {
    if (!colabId) return;
    setCargando(true);
    try {
      const [ents, fers] = await Promise.all([
        api.grilla.list({ colaboradorId: colabId, desde: fmtISO(primerDia), hasta: fmtISO(ultimoDia) }),
        api.feriados.list(),
      ]);
      setEntries(buildEntriesMap(ents));
      const fmap = {};
      for (const f of (fers.data || fers || [])) fmap[String(f.fecha).slice(0, 10)] = f.nombre;
      setFeriadosMap(fmap);
    } finally {
      setCargando(false);
    }
  }, [api, colabId, primerDia, ultimoDia]);
  useEffect(() => { recargar(); }, [recargar]);

  // Semanas del mes: filas de lunes a viernes (la grilla registra días hábiles).
  const semanas = useMemo(() => {
    const filas = [];
    const d = new Date(primerDia);
    // Retroceder al lunes de la semana del día 1
    const dow = (d.getDay() + 6) % 7; // 0 = lunes
    d.setDate(d.getDate() - dow);
    while (d <= ultimoDia) {
      const fila = [];
      for (let i = 0; i < 5; i++) {
        fila.push(new Date(d));
        d.setDate(d.getDate() + 1);
      }
      d.setDate(d.getDate() + 2); // saltear el fin de semana
      filas.push(fila);
    }
    return filas;
  }, [primerDia, ultimoDia]);

  const cambiarMes = (delta) => {
    const nd = new Date(anio, mesNum - 1 + delta, 1);
    setMes(`${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}`);
  };

  const colab = activos.find((c) => c.id === colabId);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <SwitchVista vista={vista} setVista={setVista} />
        <div className="flex items-center gap-2">
          <select value={colabId ?? ''} onChange={(e) => setColabId(Number(e.target.value))}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
            {activos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <div className="inline-flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            <button onClick={() => cambiarMes(-1)} className="px-2.5 py-1 rounded-lg text-slate-500 hover:bg-white">‹</button>
            <span className="text-sm font-medium text-slate-700 px-2 min-w-[130px] text-center">
              {MESES_ES[mesNum - 1]} {anio}
            </span>
            <button onClick={() => cambiarMes(1)} className="px-2.5 py-1 rounded-lg text-slate-500 hover:bg-white">›</button>
          </div>
        </div>
      </div>

      <p className="text-sm text-slate-500 mb-3">
        Calendario mensual de solo lectura{colab ? <> de <span className="font-medium text-slate-700">{colab.nombre}</span></> : ''}.
        Para editar un día, usá la grilla semanal.
      </p>

      {cargando ? <p className="text-slate-500 text-sm">Cargando…</p> : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate" style={{ borderSpacing: 4 }}>
            <thead>
              <tr>
                {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'].map((d) => (
                  <th key={d} className="text-left text-xs font-medium text-slate-500 px-2 pb-1 w-1/5">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {semanas.map((fila, i) => (
                <tr key={i}>
                  {fila.map((dia) => {
                    const iso = fmtISO(dia);
                    const delMes = dia.getMonth() === mesNum - 1;
                    const entry = colabId ? entries[`${colabId}:${iso}`] : null;
                    const feriado = feriadosMap[iso];
                    const items = (entry?.items || []).filter((it) => it && String(it.text || '').trim());
                    const sinTags = entry && isWorkingDay(entry.status) && items.length > 0
                      && items.filter((it) => !(Array.isArray(it.tags) && it.tags.length)).length;
                    const VISIBLES = 2;
                    const ocultos = Math.max(0, items.length - VISIBLES) + (feriado && items.length ? 0 : 0);
                    const hayContenido = entry || feriado;
                    return (
                      <td key={iso}
                        onClick={() => hayContenido && setDiaAbierto({ fecha: iso, dia, entry, feriado })}
                        className={`align-top rounded-lg border p-2 overflow-hidden ${
                          delMes ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-50'
                        } ${hayContenido ? 'cursor-pointer hover:border-coop-azul/40' : ''}`}
                        style={{ height: 116, maxHeight: 116, width: '20%' }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-slate-500">{dia.getDate()}</span>
                          <span className="flex items-center gap-1">
                            {sinTags ? (
                              <span title={`${sinTags} actividad${sinTags > 1 ? 'es' : ''} sin etiqueta`}
                                className="w-4 h-4 rounded-full bg-amber-100 text-amber-600 text-[10px] font-bold leading-4 text-center select-none">!</span>
                            ) : null}
                            {entry?.horas_extra?.horas ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-coop-naranja/15 text-coop-naranja font-medium">
                                +{entry.horas_extra.horas} hs
                              </span>
                            ) : null}
                          </span>
                        </div>
                        {feriado && <p className="text-[10px] text-violet-600 mb-1 truncate" title={feriado}>{feriado}</p>}
                        {entry && <StatusBadge status={entry.status} entryTime={entry.entry_time} viajeLabel={entry.viaje_label} />}
                        {items.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {items.slice(0, VISIBLES).map((it, j) => (
                              <li key={j} className="text-[11px] text-slate-600 truncate">· {it.text}</li>
                            ))}
                          </ul>
                        )}
                        {ocultos > 0 && (
                          <span className="inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                            +{ocultos} más
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {diaAbierto && (
        <DiaDetalleModal ctx={diaAbierto} colaborador={colab} onClose={() => setDiaAbierto(null)} />
      )}
    </div>
  );
}

// Detalle de un día del calendario (solo lectura): estado, feriado, actividades
// completas con etiquetas y marca WIP, y horas extra. La edición sigue en la grilla.
function DiaDetalleModal({ ctx, colaborador, onClose }) {
  const { fecha, dia, entry, feriado } = ctx;
  const items = (entry?.items || []).filter((it) => it && String(it.text || '').trim());
  const fmt = dia.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold capitalize">{fmt}</h3>
        {colaborador && <p className="text-sm text-slate-500 mb-3">{colaborador.nombre}</p>}
        {feriado && <p className="text-sm text-violet-600 mb-2">Feriado: {feriado}</p>}
        {entry
          ? <div className="mb-3"><StatusBadge status={entry.status} entryTime={entry.entry_time} viajeLabel={entry.viaje_label} /></div>
          : <p className="text-sm text-slate-400 mb-3">Sin carga en la grilla.</p>}
        {items.length > 0 && (
          <ul className="space-y-2">
            {items.map((it, j) => (
              <li key={j} className="text-sm text-slate-700 border border-slate-100 rounded-lg px-3 py-2">
                <div className="flex items-start gap-1.5">
                  <span className={it.wip ? 'text-emerald-500' : 'text-slate-300'}>•</span>
                  <span className="break-words min-w-0">{it.text}</span>
                  {Number(it.horas) > 0 && <span className="text-xs text-slate-400 whitespace-nowrap ml-auto">{it.horas} hs</span>}
                </div>
                {Array.isArray(it.tags) && it.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-1.5 ml-4">
                    {it.tags.map((t) => (
                      <span key={t} className="px-2 py-0.5 rounded bg-coop-azul/10 text-coop-azul text-[11px]">{t}</span>
                    ))}
                  </div>
                ) : (
                  <p className="ml-4 mt-1 text-[11px] text-amber-600">Sin etiqueta — no suma a horas por proyecto</p>
                )}
              </li>
            ))}
          </ul>
        )}
        {entry?.horas_extra?.horas ? (
          <p className="text-sm text-slate-600 mt-3">
            Horas extra: <span className="font-medium text-coop-naranja">+{entry.horas_extra.horas} hs</span>
            {entry.horas_extra.ingreso && entry.horas_extra.salida ? ` (${entry.horas_extra.ingreso} → ${entry.horas_extra.salida})` : ''}
          </p>
        ) : null}
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-coop-negro text-white rounded-lg hover:opacity-90">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
