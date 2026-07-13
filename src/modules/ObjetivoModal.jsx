import { useState, useEffect } from 'react';
import { isActiveCollab, isInterno } from './grillaUtils.js';
import { ENFOQUES } from './objetivosUtils.js';

const field = 'border border-slate-300 rounded-lg px-3 py-2 text-sm w-full';
const clamp01 = (n) => Math.max(0, Math.min(1, n));

export default function ObjetivoModal({ open, onClose, objetivo, collaborators, suggestedCode, defaultAnio, onSave }) {
  const isNew = !objetivo;
  const [form, setForm] = useState(null);
  const [externosDraft, setExternosDraft] = useState('');

  useEffect(() => {
    if (!open) return;
    const am = objetivo?.avanceManual == null ? '' : String(Math.round(Number(objetivo.avanceManual) * 100));
    setForm({
      codigo: objetivo?.codigo || suggestedCode || '',
      titulo: objetivo?.titulo || '',
      descripcion: objetivo?.descripcion || '',
      indicador: objetivo?.indicador || '',
      meta: objetivo?.meta || '',
      pesoPct: String(Math.round(Number(objetivo?.peso ?? 0.1) * 100)),
      fechaEsperada: objetivo?.fechaEsperada || '',
      enfoque: objetivo?.enfoque || 'ORGANIZACION',
      asignadosIds: [...(objetivo?.asignadosIds || [])],
      asignadosTodos: !!objetivo?.asignadosTodos,
      depIt: !!objetivo?.depIt,
      avancePct: am,
      calculo: objetivo?.calculo || 'manual',
      metaNumerica: objetivo?.metaNumerica == null ? '' : String(objetivo.metaNumerica),
      anio: String(objetivo?.anio ?? (defaultAnio || new Date().getFullYear())),
    });
    setExternosDraft((objetivo?.asignadosExternos || []).join(', '));
  }, [open, objetivo, suggestedCode, defaultAnio]);

  if (!open || !form) return null;
  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const elegibles = collaborators.filter((c) => isActiveCollab(c) && isInterno(c));
  const toggleId = (cid) => upd('asignadosIds', form.asignadosIds.includes(cid) ? form.asignadosIds.filter((x) => x !== cid) : [...form.asignadosIds, cid]);

  const guardar = () => {
    if (!form.titulo.trim()) { alert('El título es obligatorio'); return; }
    const externos = externosDraft.split(',').map((s) => s.trim()).filter(Boolean);
    const peso = clamp01((parseFloat(form.pesoPct) || 0) / 100);
    const avanceManual = form.avancePct === '' ? null : clamp01((parseFloat(form.avancePct) || 0) / 100);
    onSave({
      codigo: isNew ? (form.codigo.trim() || suggestedCode) : objetivo.codigo,
      titulo: form.titulo.trim(),
      descripcion: form.descripcion.trim(),
      indicador: form.indicador.trim(),
      meta: form.meta.trim(),
      peso,
      fechaEsperada: form.fechaEsperada || '',
      enfoque: form.enfoque,
      asignadosIds: form.asignadosIds,
      asignadosExternos: externos,
      asignadosTodos: form.asignadosTodos,
      depIt: form.depIt,
      avanceManual,
      calculo: form.calculo,
      metaNumerica: form.metaNumerica === '' ? null : (parseFloat(form.metaNumerica) || null),
      anio: Number(form.anio) || new Date().getFullYear(),
    }, objetivo?.id);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5">
        <h3 className="text-lg font-semibold text-coop-negro mb-4">{isNew ? 'Nuevo objetivo' : `Editar ${objetivo.codigo}`}</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Código</label>
            <input value={form.codigo} disabled={!isNew} onChange={(e) => upd('codigo', e.target.value)} className={`${field} ${!isNew ? 'bg-slate-50 text-slate-400' : ''}`} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Enfoque</label>
            <select value={form.enfoque} onChange={(e) => upd('enfoque', e.target.value)} className={field}>
              {ENFOQUES.map((e) => <option key={e.v} value={e.v}>{e.label}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-3">
          <label className="block text-xs text-slate-500 mb-1">Título *</label>
          <input value={form.titulo} onChange={(e) => upd('titulo', e.target.value)} className={field} />
        </div>
        <div className="mt-3">
          <label className="block text-xs text-slate-500 mb-1">Descripción</label>
          <textarea value={form.descripcion} onChange={(e) => upd('descripcion', e.target.value)} rows={2} className={field} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Indicador (KPI)</label>
            <input value={form.indicador} onChange={(e) => upd('indicador', e.target.value)} className={field} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Meta</label>
            <input value={form.meta} onChange={(e) => upd('meta', e.target.value)} className={field} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Año</label>
            <input type="number" min="2000" max="2100" value={form.anio} onChange={(e) => upd('anio', e.target.value)} className={field} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Peso (%)</label>
            <input type="number" min="0" max="100" value={form.pesoPct} onChange={(e) => upd('pesoPct', e.target.value)} className={field} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Fecha esperada</label>
            <input type="text" value={form.fechaEsperada} onChange={(e) => upd('fechaEsperada', e.target.value)} placeholder="2026-12-18 o texto libre (etapas, hitos…)" className={field} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Avance manual (%)</label>
            <input type="number" min="0" max="100" value={form.avancePct} onChange={(e) => upd('avancePct', e.target.value)} placeholder="auto" className={field} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Cálculo de avance</label>
            <select value={form.calculo} onChange={(e) => upd('calculo', e.target.value)} className={field}>
              <option value="manual">Manual (a mano)</option>
              <option value="por_tags">Por proyectos vinculados</option>
              <option value="por_leads">Por leads y eventos (Obj. 8)</option>
              <option value="por_monto_ganado">Por monto ganado US$ (Obj. 9)</option>
            </select>
          </div>
          {form.calculo === 'por_monto_ganado' && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Meta (US$)</label>
              <input type="number" min="0" value={form.metaNumerica} onChange={(e) => upd('metaNumerica', e.target.value)} placeholder="500000" className={field} />
            </div>
          )}
        </div>
        <p className="text-[11px] text-slate-400 mt-1">El cálculo define el avance automático; el avance manual, si se carga, lo sobreescribe.</p>
        <p className="text-[11px] text-slate-400 mt-1">Dejá el avance manual vacío para que se calcule a partir de los proyectos linkeados.</p>

        <div className="mt-4">
          <label className="block text-xs text-slate-500 mb-1">Asignados (equipo)</label>
          <div className="flex flex-wrap gap-1.5">
            {elegibles.map((c) => {
              const on = form.asignadosIds.includes(c.id);
              return (
                <button key={c.id} onClick={() => toggleId(c.id)} className={`text-xs px-2 py-1 rounded-full border ${on ? 'bg-coop-azul text-white border-coop-azul' : 'border-slate-300 text-slate-600'}`}>
                  {c.nombre.split(/\s+/)[0]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Externos (separados por coma)</label>
            <input value={externosDraft} onChange={(e) => setExternosDraft(e.target.value)} className={field} placeholder="LV Redes, ..." />
          </div>
          <div className="flex flex-wrap items-end gap-4 pb-1">
            <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.asignadosTodos} onChange={(e) => upd('asignadosTodos', e.target.checked)} /> Todo el equipo</label>
            <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.depIt} onChange={(e) => upd('depIt', e.target.checked)} /> Depende de IT</label>
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
