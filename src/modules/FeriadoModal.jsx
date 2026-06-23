import { useState, useEffect } from 'react';

const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm';

export default function FeriadoModal({ open, feriado, onClose, onSave }) {
  const isNew = !feriado;
  const [date, setDate] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    if (!open) return;
    setDate(feriado ? String(feriado.fecha).slice(0, 10) : '');
    setName(feriado ? feriado.nombre : '');
  }, [open, feriado]);

  if (!open) return null;

  const handleSave = () => {
    if (!date) { alert('Falta la fecha'); return; }
    if (!name.trim()) { alert('Falta el nombre'); return; }
    onSave({ fecha: date, nombre: name.trim() });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl w-full max-w-md p-5">
        <h3 className="font-semibold mb-4">{isNew ? 'Agregar feriado' : 'Editar feriado'}</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-slate-600 mb-1">Fecha</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Nombre del feriado</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Día de la Independencia" className={inputCls} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90">Guardar</button>
        </div>
      </div>
    </div>
  );
}
