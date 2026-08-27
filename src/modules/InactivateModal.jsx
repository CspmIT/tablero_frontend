import { useState, useEffect } from 'react';

// Inactivación: baja lógica con fecha de salida obligatoria (conserva historial).
export default function InactivateModal({ open, collab, onClose, onConfirm }) {
  const [fecha, setFecha] = useState('');

  useEffect(() => {
    if (!open) return;
    const t = new Date();
    const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    setFecha(iso);
  }, [open]);

  if (!open || !collab) return null;

  const handleConfirm = () => {
    if (!fecha) { alert('La fecha de salida es obligatoria.'); return; }
    onConfirm(collab.id, fecha);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl w-full max-w-md p-5">
        <h3 className="font-semibold">Inactivar a {collab.nombre}</h3>
        <p className="text-sm text-slate-500 mb-4">Cargá la fecha real de salida</p>

        <label className="block text-sm text-slate-600 mb-1">Fecha de salida</label>
        <input
          type="date"
          value={fecha}
          autoFocus
          onChange={(e) => setFecha(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <p className="text-xs text-slate-400 mt-1">No se borra el colaborador: se conserva el historial.</p>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
          <button onClick={handleConfirm} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:opacity-90">Inactivar</button>
        </div>
      </div>
    </div>
  );
}
