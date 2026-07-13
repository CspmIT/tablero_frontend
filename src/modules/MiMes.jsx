import { useState, useEffect, useCallback, useMemo } from 'react';
import { useData } from '../data/DataContext.jsx';
import StatusBadge from './StatusBadge.jsx';
import SwitchVista from '../components/SwitchVista.jsx';
import { fmtISO, buildEntriesMap, isActiveCollab } from './grillaUtils.js';

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
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-coop-negro">Grilla de actividad</h2>
          <SwitchVista vista={vista} setVista={setVista} />
        </div>
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
                    return (
                      <td key={iso} className={`align-top rounded-lg border p-2 min-h-[90px] ${
                        delMes ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-50'
                      }`} style={{ height: 96 }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-slate-500">{dia.getDate()}</span>
                          {entry?.horas_extra?.horas ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-coop-naranja/15 text-coop-naranja font-medium">
                              +{entry.horas_extra.horas} hs
                            </span>
                          ) : null}
                        </div>
                        {feriado && <p className="text-[10px] text-violet-600 mb-1">{feriado}</p>}
                        {entry && <StatusBadge status={entry.status} entryTime={entry.entry_time} viajeLabel={entry.viaje_label} />}
                        {items.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {items.slice(0, 3).map((it, j) => (
                              <li key={j} className="text-[11px] text-slate-600 truncate" title={it.text}>· {it.text}</li>
                            ))}
                            {items.length > 3 && <li className="text-[10px] text-slate-400">+{items.length - 3} más</li>}
                          </ul>
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
    </div>
  );
}
