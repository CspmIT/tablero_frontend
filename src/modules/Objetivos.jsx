import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';
import ObjetivoCard from './ObjetivoCard.jsx';
import ObjetivoModal from './ObjetivoModal.jsx';
import ObjetivoDetalleModal from './ObjetivoDetalleModal.jsx';
import { ENFOQUES, enfoqueInfo, nextObjetivoCode, resolveObjetivoPct } from './objetivosUtils.js';

export default function Objetivos() {
  const { api, colaboradores } = useData();
  const [objetivos, setObjetivos] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [leads, setLeads] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modalCtx, setModalCtx] = useState(null); // null | {} (nuevo) | { obj }
  const [detalleCtx, setDetalleCtx] = useState(null); // objetivo para el modal de comentarios/fotos
  const [anioSel, setAnioSel] = useState(() => new Date().getFullYear());
  const canEdit = true;

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      const [objs, prys, trs, lds] = await Promise.all([api.objetivos.list(), api.proyectos.list(), api.tareas.list(), api.leads.list()]);
      setObjetivos(objs.data || objs || []);
      setProyectos(prys.data || prys || []);
      setTareas(trs.data || trs || []);
      setLeads(lds.data || lds || []);
    } finally {
      setCargando(false);
    }
  }, [api]);

  useEffect(() => { recargar(); }, [recargar]);

  const guardar = async (payload, editingId) => {
    if (editingId) await api.objetivos.update(editingId, payload);
    else await api.objetivos.create(payload);
    setModalCtx(null);
    await recargar();
  };
  const borrar = async (obj) => {
    if (!window.confirm(`¿Eliminar el objetivo ${obj.codigo}?`)) return;
    await api.objetivos.remove(obj.id);
    await recargar();
  };

  // Año de un objetivo (defensivo: si todavía no vino la columna, lo trata como el año en curso).
  const anioActual = new Date().getFullYear();
  const anioDeObj = (o) => Number(o.anio) || anioActual;

  // Objetivos del año seleccionado.
  const objetivosDelAnio = useMemo(() => objetivos.filter((o) => anioDeObj(o) === anioSel), [objetivos, anioSel]);

  // Años con objetivos + el actual y el siguiente (para poder cargar la próxima gestión).
  const aniosDisponibles = useMemo(
    () => [...new Set([anioActual + 1, anioActual, ...objetivos.map(anioDeObj)])].sort((a, b) => b - a),
    [objetivos]
  );

  const sorted = useMemo(() => [...objetivosDelAnio].sort((a, b) => String(a.codigo || '').localeCompare(String(b.codigo || ''))), [objetivosDelAnio]);
  const totalPeso = objetivosDelAnio.reduce((s, o) => s + Number(o.peso || 0), 0);
  const pesoOk = Math.abs(totalPeso - 1) < 0.01;

  // Avance general del año = promedio ponderado por peso (cada objetivo aporta como máximo 100%).
  const avanceGeneral = useMemo(() => {
    if (!objetivosDelAnio.length) return null;
    const det = objetivosDelAnio.map((o) => ({ peso: Number(o.peso) || 0, pct: resolveObjetivoPct(o, proyectos, tareas, leads).pct }));
    const pesoSum = det.reduce((s, d) => s + d.peso, 0);
    if (pesoSum > 0) return Math.round(det.reduce((s, d) => s + Math.min(100, d.pct) * d.peso, 0) / pesoSum);
    return Math.round(det.reduce((s, d) => s + Math.min(100, d.pct), 0) / det.length);
  }, [objetivosDelAnio, proyectos, tareas, leads]);

  // Desglose por enfoque para la barra de resumen (conteo y suma de pesos), respetando el orden de ENFOQUES.
  const porEnfoque = useMemo(() => ENFOQUES.map((e) => {
    const items = objetivosDelAnio.filter((o) => (o.enfoque || null) === e.v);
    return { info: e, count: items.length, peso: items.reduce((s, o) => s + Number(o.peso || 0), 0) };
  }).filter((g) => g.count > 0), [objetivosDelAnio]);

  return (
    <div>
      {/* Selector de año (las gestiones no se mezclan) */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-slate-500">Año de gestión:</span>
        <select value={anioSel} onChange={(e) => setAnioSel(Number(e.target.value))} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-medium">
          {aniosDisponibles.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Barra de resumen */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="bg-white border border-slate-200 border-l-4 border-l-slate-800 px-3.5 py-2.5 min-w-[110px]">
          <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Objetivos</div>
          <div className="text-2xl font-semibold leading-none mt-0.5 text-slate-800">{objetivosDelAnio.length}</div>
        </div>
        <div className="bg-white border border-slate-200 border-l-4 border-l-coop-azul px-3.5 py-2.5 min-w-[110px]">
          <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Avance general</div>
          <div className="text-2xl font-semibold leading-none mt-0.5 text-coop-azul">{avanceGeneral != null ? `${avanceGeneral}%` : '—'}</div>
        </div>
        <div className={`bg-white border border-slate-200 border-l-4 px-3.5 py-2.5 min-w-[110px] ${pesoOk ? 'border-l-slate-800' : 'border-l-amber-500 bg-amber-50/40'}`}>
          <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Suma de pesos</div>
          <div className={`text-2xl font-semibold leading-none mt-0.5 ${pesoOk ? 'text-slate-800' : 'text-amber-600'}`}>{Math.round(totalPeso * 100)}%</div>
        </div>
        {porEnfoque.map((g) => (
          <div key={g.info.v} className="bg-white border border-slate-200 border-l-4 px-3.5 py-2.5 min-w-[110px]" style={{ borderLeftColor: g.info.color }}>
            <div className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: g.info.color }}>{g.info.label}</div>
            <div className="text-2xl font-semibold leading-none mt-0.5 text-slate-800">{g.count} · {Math.round(g.peso * 100)}%</div>
          </div>
        ))}
        {canEdit && (
          <button onClick={() => setModalCtx({})} className="ml-auto inline-flex items-center gap-1.5 bg-coop-azul text-white text-sm px-3 py-2 rounded-lg hover:opacity-90">
            <Plus size={16} /> Nuevo objetivo
          </button>
        )}
      </div>

      {!pesoOk && objetivosDelAnio.length > 0 && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          La suma de pesos es <strong>{(totalPeso * 100).toFixed(1)}%</strong> — debería estar cerca de 100% para que la ponderación funcione bien.
        </div>
      )}

      {cargando ? (
        <p className="text-slate-500">Cargando…</p>
      ) : objetivosDelAnio.length === 0 ? (
        <p className="text-sm text-slate-400">No hay objetivos cargados para {anioSel}.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {sorted.map((obj) => (
            <ObjetivoCard
              key={obj.id} obj={obj} collaborators={colaboradores} canEdit={canEdit}
              proyectos={proyectos} tareas={tareas} leads={leads}
              onEdit={(o) => setModalCtx({ obj: o })} onDelete={borrar} onDetalle={(o) => setDetalleCtx(o)}
            />
          ))}
        </div>
      )}

      {modalCtx && (
        <ObjetivoModal
          open={!!modalCtx}
          objetivo={modalCtx.obj}
          collaborators={colaboradores}
          suggestedCode={nextObjetivoCode(objetivos)}
          defaultAnio={anioSel}
          onClose={() => setModalCtx(null)}
          onSave={guardar}
        />
      )}

      {detalleCtx && (
        <ObjetivoDetalleModal
          open={!!detalleCtx}
          objetivo={detalleCtx}
          pct={resolveObjetivoPct(detalleCtx, proyectos, tareas, leads).pct}
          api={api}
          onClose={() => setDetalleCtx(null)}
          onSaved={recargar}
        />
      )}
    </div>
  );
}
