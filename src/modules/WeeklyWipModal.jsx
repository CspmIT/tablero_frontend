import { useState, useEffect } from 'react';

// "Foco principal de la semana" (texto libre) por colaborador + semana, más el
// resumen REAL de la semana — el mismo campo que administración ve en Costos
// (columna "Tareas (resumen semanal)"): un solo dato, dos superficies.
export default function WeeklyWipModal({ open, collab, currentWip, currentResumen, onClose, onSave, onSaveResumen }) {
  const [text, setText] = useState('');
  const [resumen, setResumen] = useState('');
  useEffect(() => { if (open) { setText(currentWip || ''); setResumen(currentResumen || ''); } }, [open, currentWip, currentResumen]);

  if (!open || !collab) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl w-full max-w-md p-5">
        <h3 className="font-semibold">WIP de la semana</h3>
        <p className="text-sm text-slate-500 mb-3">{collab.nombre}</p>

        <label className="block text-sm text-slate-600 mb-1"><span className="italic text-slate-400">Def.</span> · Foco principal de la semana (lo planificado)</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Ej: Avanzar la instalación de +Agua en la cooperativa X…"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />

        <label className="block text-sm text-slate-600 mb-1 mt-3"><span className="italic text-slate-400">Real</span> · Resumen de la semana <span className="text-slate-400">(el que ve administración en Costos)</span></label>
        <textarea
          value={resumen}
          onChange={(e) => setResumen(e.target.value)}
          rows={2}
          placeholder="Ej: +Agua / OV…"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />

        <div className="flex justify-between items-center mt-4">
          <div>
            {currentWip && (
              <button
                onClick={() => { if (window.confirm('¿Borrar el WIP de esta semana?')) onSave(''); }}
                className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
              >
                Borrar
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
            <button onClick={() => { if ((resumen || '').trim() !== (currentResumen || '').trim()) onSaveResumen?.(resumen.trim()); onSave(text.trim()); }} className="px-4 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
