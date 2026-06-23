import { useState, useEffect, useCallback } from 'react';
import { useData } from '../data/DataContext.jsx';
import FeriadoModal from './FeriadoModal.jsx';
import CumpleModal from './CumpleModal.jsx';
import { isActiveCollab } from './grillaUtils.js';
import { fmtCumpleDisplay, fmtFeriadoDate, mmddFromCollab, normalizeCumpleStr } from './fechasUtils.js';

export default function FechasEspeciales() {
  const { api, colaboradores, recargarColaboradores } = useData();
  const [feriados, setFeriados] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [feriadoCtx, setFeriadoCtx] = useState(null); // { feriado } | { feriado: null }
  const [cumpleCtx, setCumpleCtx] = useState(null);    // { collab }

  const recargarFeriados = useCallback(async () => {
    setCargando(true);
    try {
      const res = await api.feriados.list();
      setFeriados((res.data || res || []).slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))));
    } finally {
      setCargando(false);
    }
  }, [api]);

  useEffect(() => { recargarFeriados(); }, [recargarFeriados]);

  const guardarFeriado = async ({ fecha, nombre }) => {
    const f = feriadoCtx?.feriado;
    if (f) await api.feriados.update(f.id, { fecha, nombre });
    else await api.feriados.create({ fecha, nombre });
    setFeriadoCtx(null);
    await recargarFeriados();
  };
  const borrarFeriado = async (f) => {
    const { dmy } = fmtFeriadoDate(f.fecha);
    if (!window.confirm(`¿Borrar el feriado "${f.nombre}" del ${dmy}?`)) return;
    await api.feriados.remove(f.id);
    await recargarFeriados();
  };

  const guardarCumple = async (id, mmdd) => {
    const norm = normalizeCumpleStr(mmdd);
    const [mm, dd] = norm.split('-').map(Number);
    await api.colaboradores.update(id, { cumpleMes: mm, cumpleDia: dd });
    setCumpleCtx(null);
    await recargarColaboradores();
  };
  const borrarCumple = async (id) => {
    await api.colaboradores.update(id, { cumpleMes: null, cumpleDia: null });
    setCumpleCtx(null);
    await recargarColaboradores();
  };

  const activos = colaboradores.filter(isActiveCollab);
  const cumpleList = activos
    .map((c) => ({ c, mmdd: mmddFromCollab(c) }))
    .sort((a, b) => {
      if (a.mmdd && b.mmdd) return a.mmdd.localeCompare(b.mmdd);
      if (a.mmdd) return -1;
      if (b.mmdd) return 1;
      return a.c.nombre.localeCompare(b.c.nombre);
    });
  const conCumple = cumpleList.filter((x) => x.mmdd).length;

  return (
    <div>
      {/* Feriados */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-coop-negro">
          Feriados y días no laborables <span className="text-sm font-normal text-slate-400">aplican a todo el área</span>
        </h2>
        <button onClick={() => setFeriadoCtx({ feriado: null })} className="bg-coop-naranja text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90">
          + Agregar feriado
        </button>
      </div>

      {cargando ? (
        <p className="text-slate-500">Cargando…</p>
      ) : feriados.length === 0 ? (
        <p className="text-sm text-slate-400 mb-8">No hay feriados cargados. Agregá los nacionales y los especiales del año.</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 mb-8">
          {feriados.map((f) => {
            const { dmy, dow } = fmtFeriadoDate(f.fecha);
            return (
              <div key={f.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="font-mono text-sm text-slate-700 w-24">{dmy}</div>
                <div className="text-xs text-slate-400 w-20">{dow}</div>
                <div className="flex-1 text-slate-800">{f.nombre}</div>
                <button onClick={() => setFeriadoCtx({ feriado: f })} className="text-coop-azul hover:underline text-sm mr-2">Editar</button>
                <button onClick={() => borrarFeriado(f)} className="text-red-500 hover:underline text-sm">Borrar</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Cumpleaños */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-coop-negro">
          Cumpleaños <span className="text-sm font-normal text-slate-400">{conCumple} de {activos.length} cargados</span>
        </h3>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {cumpleList.map(({ c, mmdd }) => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="flex-1 text-slate-800">{c.nombre}</div>
            <div className={`text-sm w-24 ${mmdd ? 'text-slate-700' : 'text-slate-300'}`}>{mmdd ? fmtCumpleDisplay(mmdd) : '—'}</div>
            <button onClick={() => setCumpleCtx({ collab: c })} className="text-coop-azul hover:underline text-sm">
              {mmdd ? 'Editar' : 'Cargar'}
            </button>
          </div>
        ))}
      </div>

      <FeriadoModal
        open={!!feriadoCtx}
        feriado={feriadoCtx?.feriado || null}
        onClose={() => setFeriadoCtx(null)}
        onSave={guardarFeriado}
      />
      <CumpleModal
        open={!!cumpleCtx}
        collaborator={cumpleCtx?.collab}
        currentMMDD={cumpleCtx ? mmddFromCollab(cumpleCtx.collab) : null}
        onClose={() => setCumpleCtx(null)}
        onSave={guardarCumple}
        onDelete={borrarCumple}
      />
    </div>
  );
}
