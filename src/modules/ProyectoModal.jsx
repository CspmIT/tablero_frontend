import { useState, useEffect } from 'react';
import { useData } from '../data/DataContext.jsx';
import { isActiveCollab, isInterno } from './grillaUtils.js';
import { ESTADOS_PROYECTO } from './kanbanUtils.js';

const field = 'border border-slate-300 rounded-lg px-3 py-2 text-sm w-full';

export default function ProyectoModal({ open, proyecto, objetivos, clientes, onClose, onSave }) {
  const { colaboradores } = useData();
  const isNew = !proyecto;
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      nombre: proyecto?.nombre || '',
      cliente: proyecto?.cliente || '',
      objetivoId: proyecto?.objetivoId ? String(proyecto.objetivoId) : '',
      ownerId: proyecto?.ownerId ? String(proyecto.ownerId) : '',
      estado: proyecto?.estado || 'activo',
      descripcion: proyecto?.descripcion || '',
      fechaInicio: proyecto?.fechaInicio ? String(proyecto.fechaInicio).slice(0, 10) : '',
      fechaFin: proyecto?.fechaFin ? String(proyecto.fechaFin).slice(0, 10) : '',
    });
  }, [open, proyecto]);

  if (!open || !form) return null;
  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const owners = colaboradores.filter((c) => isActiveCollab(c) && isInterno(c));

  const guardar = () => {
    if (!form.nombre.trim()) { alert('El nombre del proyecto es obligatorio'); return; }
    onSave({
      nombre: form.nombre.trim(),
      cliente: form.cliente.trim() || null,
      objetivoId: form.objetivoId ? Number(form.objetivoId) : null,
      ownerId: form.ownerId ? Number(form.ownerId) : null,
      estado: form.estado,
      descripcion: form.descripcion.trim() || null,
      fechaInicio: form.fechaInicio || null,
      fechaFin: form.fechaFin || null,
    }, proyecto?.id);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <h3 className="text-lg font-semibold text-coop-negro mb-4">{isNew ? 'Nuevo proyecto' : 'Editar proyecto'}</h3>

        <label className="block text-xs text-slate-500 mb-1">Nombre *</label>
        <input value={form.nombre} onChange={(e) => upd('nombre', e.target.value)} className={field} />

        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Cliente</label>
            <input value={form.cliente} onChange={(e) => upd('cliente', e.target.value)} className={field} list="clientes-list" />
            <datalist id="clientes-list">{(clientes || []).map((c) => <option key={c.id} value={c.nombre} />)}</datalist>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Estado</label>
            <select value={form.estado} onChange={(e) => upd('estado', e.target.value)} className={field}>
              {ESTADOS_PROYECTO.map((e) => <option key={e.v} value={e.v}>{e.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Objetivo</label>
            <select value={form.objetivoId} onChange={(e) => upd('objetivoId', e.target.value)} className={field}>
              <option value="">— sin objetivo —</option>
              {(objetivos || []).map((o) => <option key={o.id} value={o.id}>{o.codigo} · {o.titulo}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Responsable</label>
            <select value={form.ownerId} onChange={(e) => upd('ownerId', e.target.value)} className={field}>
              <option value="">—</option>
              {owners.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        </div>

        <label className="block text-xs text-slate-500 mb-1 mt-3">Descripción</label>
        <textarea value={form.descripcion} onChange={(e) => upd('descripcion', e.target.value)} rows={2} className={field} />

        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Inicio (plan)</label>
            <input type="date" value={form.fechaInicio} onChange={(e) => upd('fechaInicio', e.target.value)} className={field} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Fin (plan)</label>
            <input type="date" value={form.fechaFin} onChange={(e) => upd('fechaFin', e.target.value)} className={field} />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
          <button onClick={guardar} className="px-4 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90">Guardar</button>
        </div>
      </div>
    </div>
  );
}
