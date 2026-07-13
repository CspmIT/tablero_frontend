import { useState, useEffect, useCallback } from 'react';
import { useData } from '../data/DataContext.jsx';
import { isActiveCollab, isInterno, fmtISO } from './grillaUtils.js';
import { mergeWeeks, ganadosForAssignment, datesOfWeekObj } from './guardiasUtils.js';
import { cumpleYaPaso, mmddFromCollab, fmtFeriadoDate } from './fechasUtils.js';

const inputCls = 'border border-slate-300 rounded-lg px-2 py-1.5 text-sm';

export default function Francos() {
  const { api, colaboradores } = useData();
  const anio = new Date().getFullYear();
  const [weeks, setWeeks] = useState([]);
  const [feriadosMap, setFeriadosMap] = useState({});
  const [especiales, setEspeciales] = useState([]);
  const [carryMap, setCarryMap] = useState({});
  const [entryCount, setEntryCount] = useState({}); // { colaboradorId: { franco, franco_cumple } }
  const [cargando, setCargando] = useState(true);
  const [nuevo, setNuevo] = useState({ colaboradorId: '', fecha: '', motivo: '' });

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      const [guds, fers, esps, carrys, ents] = await Promise.all([
        api.guardias.list(anio),
        api.feriados.list(),
        api.francos.list(),
        api.carryover.list(anio),
        api.grilla.list({ desde: `${anio}-01-01`, hasta: `${anio}-12-31` }),
      ]);
      setWeeks(mergeWeeks(anio, guds.data || guds || []));
      const fmap = {};
      for (const f of (fers.data || fers || [])) fmap[String(f.fecha).slice(0, 10)] = f.nombre;
      setFeriadosMap(fmap);
      setEspeciales(esps.data || esps || []);
      const cmap = {};
      for (const c of (carrys.data || carrys || [])) cmap[c.colaboradorId] = Number(c.dias) || 0;
      setCarryMap(cmap);
      const cnt = {};
      for (const e of (ents.data || ents || [])) {
        cnt[e.colaboradorId] = cnt[e.colaboradorId] || { franco: 0, franco_cumple: 0 };
        if (e.estado === 'franco') cnt[e.colaboradorId].franco++;
        if (e.estado === 'franco_cumple') cnt[e.colaboradorId].franco_cumple++;
      }
      setEntryCount(cnt);
    } finally {
      setCargando(false);
    }
  }, [api, anio]);

  useEffect(() => { recargar(); }, [recargar]);

  // Una semana de guardia recién "gana" francos cuando ya terminó (su domingo
  // quedó antes de hoy). Así no se suman guardias futuras ni la que está en curso.
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const semanaTerminada = (w) => {
    const ds = datesOfWeekObj(w, anio);
    const domingo = ds[6];
    return domingo && domingo < hoy;
  };

  const cf = (c) => {
    const carry = carryMap[c.id] || 0;
    let ganados = 0;
    for (const w of weeks) {
      if (!semanaTerminada(w)) continue;
      for (const a of (w.asignaciones || [])) {
        if (a.id === c.id) ganados += ganadosForAssignment(a, w, feriadosMap, anio, weeks);
      }
    }
    const mmdd = mmddFromCollab(c);
    const cumple = mmdd && cumpleYaPaso(mmdd) ? 1 : 0;
    const tomados = entryCount[c.id]?.franco || 0;
    const tomadosCumple = entryCount[c.id]?.franco_cumple || 0;
    const esp = especiales.filter((f) => f.colaboradorId === c.id).length;
    return { carry, ganados, tomados, especiales: esp, cumple, tomadosCumple, total: carry + ganados + esp + cumple - tomados - tomadosCumple };
  };

  const setCarry = async (colaboradorId, dias) => {
    await api.carryover.set({ colaboradorId, anio, dias: Number(dias) || 0 });
    setCarryMap((m) => ({ ...m, [colaboradorId]: Number(dias) || 0 }));
  };

  const agregarEspecial = async () => {
    if (!nuevo.colaboradorId || !nuevo.fecha) { alert('Elegí colaborador y fecha'); return; }
    await api.francos.create({ colaboradorId: Number(nuevo.colaboradorId), fecha: nuevo.fecha, tipo: 'franco', motivo: nuevo.motivo.trim() || null });
    setNuevo({ colaboradorId: '', fecha: '', motivo: '' });
    await recargar();
  };
  const borrarEspecial = async (id) => {
    if (!window.confirm('¿Borrar este franco especial?')) return;
    await api.francos.remove(id);
    await recargar();
  };

  const equipo = colaboradores.filter((c) => isInterno(c) && isActiveCollab(c));
  const nombreDe = (id) => colaboradores.find((c) => c.id === id)?.nombre || `#${id}`;

  if (cargando) return <p className="text-slate-500">Cargando…</p>;

  return (
    <div>
      <h2 className="text-xl font-semibold text-coop-negro mb-1">Francos</h2>
      <p className="text-sm text-slate-500 mb-4">Acumulado {anio} en días = carry + guardias + especiales + cumple − tomados.</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        {equipo.map((c) => {
          const f = cf(c);
          return (
            <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium text-slate-800">{c.nombre}</div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">Total disponible</div>
                  <div className={`font-mono font-semibold ${f.total < 0 ? 'text-red-600' : 'text-coop-azul'}`}>{f.total}</div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 mt-3 text-center">
                <div>
                  <div className="text-[11px] text-slate-400">Carry {anio - 1}</div>
                  <input
                    type="number" step="0.5" defaultValue={f.carry}
                    onBlur={(e) => setCarry(c.id, e.target.value)}
                    className="w-full text-center font-mono text-sm border border-slate-200 rounded px-1 py-0.5"
                  />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Guardias</div>
                  <div className="font-mono text-emerald-600">+{f.ganados}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Especiales</div>
                  <div className="font-mono text-emerald-600">+{f.especiales}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Tomados</div>
                  <div className="font-mono text-coop-naranja">−{f.tomados}</div>
                </div>
              </div>
              {(f.cumple > 0 || f.tomadosCumple > 0) && (
                <div className="text-xs text-slate-500 mt-2 border-t border-slate-100 pt-2">
                  Cumple: {f.cumple > 0 && <span className="text-emerald-600">+{f.cumple}</span>}
                  {f.tomadosCumple > 0 && <span className="text-coop-naranja ml-1">−{f.tomadosCumple}</span>}
                  {f.cumple - f.tomadosCumple > 0 ? <span className="ml-1">· disponible</span> : f.tomadosCumple > 0 ? <span className="ml-1">· tomado</span> : null}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Francos especiales */}
      <h3 className="text-lg font-semibold text-coop-negro mb-3">Francos especiales <span className="text-sm font-normal text-slate-400">asignados manualmente</span></h3>

      <div className="bg-white rounded-xl border border-slate-200 p-3 mb-3 flex flex-wrap items-end gap-2">
        <div className="w-full sm:w-auto">
          <label className="block text-xs text-slate-500 mb-0.5">Colaborador</label>
          <select value={nuevo.colaboradorId} onChange={(e) => setNuevo({ ...nuevo, colaboradorId: e.target.value })} className={`${inputCls} w-full sm:w-auto`}>
            <option value="">—</option>
            {equipo.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div className="w-full sm:w-auto">
          <label className="block text-xs text-slate-500 mb-0.5">Fecha</label>
          <input type="date" value={nuevo.fecha} onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })} className={`${inputCls} w-full sm:w-auto`} />
        </div>
        <div className="flex-1 min-w-40">
          <label className="block text-xs text-slate-500 mb-0.5">Motivo</label>
          <input value={nuevo.motivo} onChange={(e) => setNuevo({ ...nuevo, motivo: e.target.value })} placeholder="Ej: viaje de instalación +24 hs" className={`${inputCls} w-full`} />
        </div>
        <button onClick={agregarEspecial} className="w-full sm:w-auto bg-coop-azul text-white text-sm px-3 py-1.5 rounded-lg hover:opacity-90">Agregar</button>
      </div>

      {especiales.length === 0 ? (
        <p className="text-sm text-slate-400">No hay francos especiales cargados.</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {especiales.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <div className="font-mono text-slate-600 w-24">{fmtFeriadoDate(f.fecha).dmy}</div>
              <div className="w-40 text-slate-800">{nombreDe(f.colaboradorId)}</div>
              <div className="flex-1 min-w-[140px] text-slate-500">{f.motivo || '—'}</div>
              <button onClick={() => borrarEspecial(f.id)} className="text-red-500 hover:underline">Borrar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
