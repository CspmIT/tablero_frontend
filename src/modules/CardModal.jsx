import { useState, useEffect } from 'react';
import { useData } from '../data/DataContext.jsx';
import { isActiveCollab, isInterno } from './grillaUtils.js';
import { COLUMNS, PRIORIDADES, unidadesPct } from './kanbanUtils.js';

const mkUid = () => 'u_' + Math.random().toString(36).slice(2, 8);

const field = 'border border-slate-300 rounded-lg px-3 py-2 text-sm w-full';

export default function CardModal({ open, card, proyectos, initialColumn, onClose, onSave, onDelete }) {
  const { tags, colaboradores } = useData();
  const isNew = !card;
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      titulo: card?.titulo || '',
      descripcion: card?.descripcion || '',
      proyectoId: card?.proyectoId ? String(card.proyectoId) : '',
      kanbanCol: card?.kanbanCol || initialColumn || 'todo',
      prioridad: card?.prioridad || 'media',
      pct: typeof card?.pct === 'number' ? card.pct : 0,
      weight: typeof card?.weight === 'number' ? card.weight : 1,
      fechaInicio: card?.fechaInicio ? String(card.fechaInicio).slice(0, 10) : '',
      fechaFin: card?.fechaFin ? String(card.fechaFin).slice(0, 10) : '',
      ownersIds: [...(card?.ownersIds || [])],
      tagIds: [...(card?.tagIds || [])],
      unidades: Array.isArray(card?.unidades) ? card.unidades.map((u) => ({ ...u })) : [],
    });
  }, [open, card, initialColumn]);

  if (!open || !form) return null;
  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const owners = colaboradores.filter((c) => isActiveCollab(c) && isInterno(c));
  const toggle = (key, id) => upd(key, form[key].includes(id) ? form[key].filter((x) => x !== id) : [...form[key], id]);
  const usaUnidades = form.unidades.length > 0;
  const addUnidad = () => upd('unidades', [...form.unidades, { id: mkUid(), label: `Equipo ${form.unidades.length + 1}`, hecho: false }]);
  const updUnidad = (i, k, v) => upd('unidades', form.unidades.map((u, j) => (j === i ? { ...u, [k]: v } : u)));
  const delUnidad = (i) => upd('unidades', form.unidades.filter((_, j) => j !== i));

  const guardar = () => {
    if (!form.titulo.trim()) { alert('El título es obligatorio'); return; }
    const usaUnidades = form.unidades.length > 0;
    onSave({
      titulo: form.titulo.trim(),
      descripcion: form.descripcion.trim() || null,
      proyectoId: form.proyectoId ? Number(form.proyectoId) : null,
      kanbanCol: form.kanbanCol,
      prioridad: form.prioridad,
      pct: usaUnidades ? unidadesPct(form.unidades) : (Number(form.pct) || 0),
      weight: Number(form.weight) || 1,
      fechaInicio: form.fechaInicio || null,
      fechaFin: form.fechaFin || null,
      ownersIds: form.ownersIds,
      tagIds: form.tagIds,
      unidades: usaUnidades ? form.unidades : null,
    }, card?.id);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-5">
        <h3 className="text-lg font-semibold text-coop-negro mb-4">{isNew ? 'Nueva tarjeta' : 'Editar tarjeta'}</h3>

        <label className="block text-xs text-slate-500 mb-1">Título *</label>
        <input value={form.titulo} onChange={(e) => upd('titulo', e.target.value)} className={field} />

        <label className="block text-xs text-slate-500 mb-1 mt-3">Descripción</label>
        <textarea value={form.descripcion} onChange={(e) => upd('descripcion', e.target.value)} rows={2} className={field} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Proyecto</label>
            <select value={form.proyectoId} onChange={(e) => upd('proyectoId', e.target.value)} className={field}>
              <option value="">— sin proyecto —</option>
              {proyectos.map((p) => <option key={p.id} value={p.id}>{p.cliente ? `${p.cliente} · ` : ''}{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Columna</label>
            <select value={form.kanbanCol} onChange={(e) => upd('kanbanCol', e.target.value)} className={field}>
              {COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Prioridad</label>
            <select value={form.prioridad} onChange={(e) => upd('prioridad', e.target.value)} className={field}>
              {PRIORIDADES.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Avance (%)</label>
            <input type="number" min="0" max="100" value={usaUnidades ? unidadesPct(form.unidades) : form.pct} onChange={(e) => upd('pct', e.target.value)} disabled={usaUnidades} title={usaUnidades ? 'Se calcula por unidades' : ''} className={`${field} ${usaUnidades ? 'bg-slate-50 text-slate-400' : ''}`} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Peso</label>
            <input type="number" min="1" value={form.weight} onChange={(e) => upd('weight', e.target.value)} className={field} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Inicio (plan)</label>
            <input type="date" value={form.fechaInicio} onChange={(e) => upd('fechaInicio', e.target.value)} className={field} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Fin (plan)</label>
            <input type="date" value={form.fechaFin} onChange={(e) => upd('fechaFin', e.target.value)} className={field} />
          </div>
        </div>

        <label className="block text-xs text-slate-500 mb-1 mt-4">Responsables</label>
        <div className="flex flex-wrap gap-1.5">
          {owners.map((c) => {
            const on = form.ownersIds.includes(c.id);
            return <button key={c.id} onClick={() => toggle('ownersIds', c.id)} className={`text-xs px-2 py-1 rounded-full border ${on ? 'bg-coop-azul text-white border-coop-azul' : 'border-slate-300 text-slate-600'}`}>{c.nombre.split(/\s+/)[0]}</button>;
          })}
        </div>

        {tags.length > 0 && (
          <>
            <label className="block text-xs text-slate-500 mb-1 mt-4">Etiquetas</label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => {
                const on = form.tagIds.includes(t.id);
                return (
                  <button key={t.id} onClick={() => toggle('tagIds', t.id)}
                    className="text-xs px-2 py-1 rounded-full border"
                    style={on ? { background: t.color || '#243E91', color: '#fff', borderColor: t.color || '#243E91' } : { borderColor: '#cbd5e1', color: '#64748b' }}>
                    {t.nombre}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-slate-500">Unidades por equipo {usaUnidades && <span className="text-slate-400">· {unidadesPct(form.unidades)}%</span>}</label>
            <button onClick={addUnidad} className="text-xs text-coop-azul hover:underline">+ unidad</button>
          </div>
          {usaUnidades && (
            <div className="space-y-1.5">
              {form.unidades.map((u, i) => (
                <div key={u.id || i} className="flex items-center gap-2">
                  <input type="checkbox" checked={!!u.hecho} onChange={(e) => updUnidad(i, 'hecho', e.target.checked)} />
                  <input value={u.label || ''} onChange={(e) => updUnidad(i, 'label', e.target.value)} className="border border-slate-200 rounded px-2 py-1 text-sm flex-1" />
                  <button onClick={() => delUnidad(i)} className="text-red-400 hover:text-red-600 text-sm px-1">×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mt-5">
          {!isNew && <button onClick={() => onDelete(card)} className="mr-auto px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg">Eliminar</button>}
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
          <button onClick={guardar} className="px-4 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90">Guardar</button>
        </div>
      </div>
    </div>
  );
}
