// Modal de reunión (ola reuniones 16/07): crea internas desde Mi mes y
// reprograma cualquiera (interna o de cliente). Virtual → Teams; Presencial →
// desplegable de salas de la cooperativa (+ "Otra"). El organizador va SIEMPRE
// incluido (lección de campo). Al reprogramar se pueden sumar/quitar
// participantes: Outlook les avisa solo a todos.
import { useEffect, useState } from 'react';
import { useData } from '../data/DataContext.jsx';

const SALAS = [
  'Sala de reuniones Cooptech',
  'Oficina Gerencia de Operaciones',
  'Sala de reuniones telecomunicaciones',
  'Sala de reuniones de Consejo',
  'Sala de capacitación RRHH',
];

export default function ReunionModal({ reunion, fechaInicial, onDone, onClose }) {
  const { api, me, colaboradores } = useData();
  const editando = !!reunion;
  const enSalas = reunion?.lugar && SALAS.includes(reunion.lugar);
  const [f, setF] = useState(() => ({
    titulo: reunion?.titulo || '',
    fecha: reunion ? String(reunion.fecha).slice(0, 10) : (fechaInicial || new Date().toISOString().slice(0, 10)),
    horaInicio: reunion?.horaInicio || '10:00',
    horaFin: reunion?.horaFin || '11:00',
    modalidad: reunion?.modalidad || 'virtual',
    sala: reunion?.lugar ? (enSalas ? reunion.lugar : 'otra') : SALAS[0],
    otraSala: reunion?.lugar && !enSalas ? reunion.lugar : '',
    ids: reunion
      ? (Array.isArray(reunion.colaboradoresIds) ? reunion.colaboradoresIds.map(Number) : [])
      : [me?.colaboradorId].filter(Boolean),
    tags: Array.isArray(reunion?.tags) ? reunion.tags : [],
    tagInput: '',
    notas: '',
  }));
  // Autocompletado de etiquetas: mismo catálogo completo de la grilla.
  const [sugerencias, setSugerencias] = useState([]);
  useEffect(() => {
    api.etiquetas.sugerencias().then((r) => setSugerencias(r?.sugerencias || [])).catch(() => {});
  }, [api]);
  const agregarTag = (t) => {
    const limpio = String(t || '').trim();
    if (!limpio) return;
    setF((s) => s.tags.some((x) => x.toLowerCase() === limpio.toLowerCase())
      ? { ...s, tagInput: '' } : { ...s, tags: [...s.tags, limpio], tagInput: '' });
  };
  const [trabajando, setTrabajando] = useState(false);
  const organizadorId = reunion?.organizadorId ?? me?.colaboradorId;
  const esCliente = reunion?.tipo === 'cliente';

  const toggle = (id) => {
    if (id === organizadorId) return; // el organizador no se destilda
    setF((s) => ({ ...s, ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id] }));
  };

  const lugarFinal = f.modalidad === 'presencial' ? (f.sala === 'otra' ? f.otraSala.trim() : f.sala) : null;
  const valido = (esCliente || f.titulo.trim()) && f.fecha && f.horaInicio && f.horaFin && f.horaFin > f.horaInicio
    && (f.modalidad === 'virtual' || lugarFinal) && f.ids.length > 0;

  const guardar = async () => {
    setTrabajando(true);
    try {
      let r;
      if (editando) {
        r = await api.reuniones.update(reunion.id, {
          titulo: esCliente ? undefined : f.titulo.trim(),
          fecha: f.fecha, horaInicio: f.horaInicio, horaFin: f.horaFin,
          colaboradoresIds: f.ids, lugar: lugarFinal, tags: f.tags,
        });
      } else {
        r = await api.reuniones.create({
          titulo: f.titulo.trim(), fecha: f.fecha, horaInicio: f.horaInicio, horaFin: f.horaFin,
          modalidad: f.modalidad, lugar: lugarFinal, colaboradoresIds: f.ids,
          tags: f.tags, notas: f.notas.trim() || null,
        });
      }
      if (r.graphError) alert(`Guardado, pero Outlook avisó un problema: ${r.graphError}`);
      onDone?.();
    } catch (e) { alert(e.message || 'No se pudo guardar'); }
    finally { setTrabajando(false); }
  };

  const activos = (colaboradores || []).filter((c) => c.activo !== false);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-1">{editando ? 'Reprogramar reunión' : 'Nueva reunión'}</h3>
        {editando && (
          <p className="text-xs text-slate-400 mb-3">
            {esCliente ? `Videollamada con ${reunion.titulo}` : reunion.titulo} · Outlook les avisa automáticamente a todos los cambios.
          </p>
        )}
        <div className="space-y-3">
          {!esCliente && (
            <div>
              <label className="block text-sm text-slate-600 mb-1">Título</label>
              <input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })}
                placeholder="Ej: Seguimiento migración 4500"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <div>
              <label className="block text-sm text-slate-600 mb-1">Fecha</label>
              <input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Desde</label>
              <input type="time" value={f.horaInicio} onChange={(e) => setF({ ...f, horaInicio: e.target.value })}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Hasta</label>
              <input type="time" value={f.horaFin} onChange={(e) => setF({ ...f, horaFin: e.target.value })}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          {!editando && (
            <div>
              <label className="block text-sm text-slate-600 mb-1">Modalidad</label>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm w-fit">
                {[['virtual', 'Virtual (Teams)'], ['presencial', 'Presencial']].map(([v, lbl]) => (
                  <button key={v} onClick={() => setF({ ...f, modalidad: v })}
                    className={`px-4 py-2 ${f.modalidad === v ? 'bg-coop-azul text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          )}

          {f.modalidad === 'presencial' && (
            <div>
              <label className="block text-sm text-slate-600 mb-1">Lugar</label>
              <select value={f.sala} onChange={(e) => setF({ ...f, sala: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                {SALAS.map((s) => <option key={s} value={s}>{s}</option>)}
                <option value="otra">Otra: especifique…</option>
              </select>
              {f.sala === 'otra' && (
                <input value={f.otraSala} onChange={(e) => setF({ ...f, otraSala: e.target.value })}
                  placeholder="¿Dónde?" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mt-2" />
              )}
            </div>
          )}

          <div>
            <label className="block text-sm text-slate-600 mb-1">Participantes</label>
            <div className="border border-slate-200 rounded-lg p-2 max-h-44 overflow-y-auto space-y-1">
              {activos.map((c) => (
                <label key={c.id} className={`flex items-center gap-2 text-sm px-1.5 py-1 rounded ${c.id === organizadorId ? 'text-slate-400' : 'hover:bg-slate-50 cursor-pointer'}`}>
                  <input type="checkbox" checked={f.ids.includes(c.id)} disabled={c.id === organizadorId}
                    onChange={() => toggle(c.id)} className="w-4 h-4" />
                  {c.nombre}{c.id === organizadorId ? ' (organizador)' : ''}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">Etiquetas <span className="text-slate-400">(proyecto/tema: el ítem de la grilla nace etiquetado)</span></label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {f.tags.map((t) => (
                <span key={t} className="text-xs px-2 py-1 rounded-full bg-coop-azul/10 text-coop-azul flex items-center gap-1">
                  {t}
                  <button onClick={() => setF({ ...f, tags: f.tags.filter((x) => x !== t) })} className="hover:text-red-500">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={f.tagInput} list="reunion-tags-dl"
                onChange={(e) => setF({ ...f, tagInput: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarTag(f.tagInput); } }}
                placeholder="Ej: Reconecta, +Agua, Tablero…"
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <button onClick={() => agregarTag(f.tagInput)} disabled={!f.tagInput.trim()}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:border-coop-azul disabled:opacity-40">Agregar</button>
            </div>
            <datalist id="reunion-tags-dl">
              {sugerencias.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>

          {!editando && (
            <div>
              <label className="block text-sm text-slate-600 mb-1">Notas (opcional, viajan en la invitación)</label>
              <textarea value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} rows={2}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
          <button onClick={guardar} disabled={!valido || trabajando}
            className="px-4 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90 disabled:opacity-40">
            {trabajando ? 'Guardando…' : (editando ? 'Reprogramar' : 'Crear reunión')}
          </button>
        </div>
      </div>
    </div>
  );
}
