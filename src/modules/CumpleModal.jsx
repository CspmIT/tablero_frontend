import { useState, useEffect } from 'react';
import { normalizeCumpleStr, fmtCumpleDisplay } from './fechasUtils.js';

// Edita el cumpleaños (mm-dd) del colaborador. Se guarda como cumpleMes/cumpleDia.
export default function CumpleModal({ open, collaborator, currentMMDD, onClose, onSave, onDelete }) {
  const [dateInput, setDateInput] = useState('');

  useEffect(() => {
    if (!open) return;
    if (currentMMDD) {
      const norm = normalizeCumpleStr(currentMMDD);
      const [mm, dd] = norm ? norm.split('-') : ['', ''];
      // Año cualquiera (no se usa); permite el input date.
      setDateInput(mm && dd ? `2000-${mm}-${dd}` : '');
    } else {
      setDateInput('');
    }
  }, [open, currentMMDD]);

  if (!open || !collaborator) return null;

  const handleSave = () => {
    const norm = normalizeCumpleStr(dateInput);
    if (!norm) { alert('Cargá una fecha válida'); return; }
    onSave(collaborator.id, norm);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl w-full max-w-md p-5">
        <h3 className="font-semibold">Cumpleaños · {collaborator.nombre}</h3>
        <p className="text-sm text-slate-500 mb-4">
          {currentMMDD ? `Hoy registrado: ${fmtCumpleDisplay(currentMMDD)}` : 'Sin fecha cargada'}
        </p>

        <label className="block text-sm text-slate-600 mb-1">Fecha de cumpleaños</label>
        <input type="date" value={dateInput} onChange={(e) => setDateInput(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        <p className="text-xs text-slate-400 mt-1">Solo se usa el día y el mes.</p>

        <div className="flex justify-between items-center mt-5">
          <div>
            {currentMMDD && (
              <button onClick={() => onDelete(collaborator.id)} className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">Quitar</button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
            <button onClick={handleSave} className="px-4 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
