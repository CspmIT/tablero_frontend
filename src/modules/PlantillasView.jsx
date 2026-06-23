import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Copy, ArrowUp, ArrowDown, X } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';
import { isActiveCollab, isInterno } from './grillaUtils.js';
import { PRODUCTOS_CRM, TIPOS_ETAPA, PRIORIDADES } from './kanbanUtils.js';

const field = 'border border-slate-300 rounded-lg px-3 py-2 text-sm w-full';

function etapaVacia(seq) {
  return { seq, titulo: '', desc: '', tipo: 'unica', priority: 'media', owners: [] };
}

function Editor({ base, plantillas, colaboradores, onClose, onSave }) {
  const isNew = !base.id;
  const usados = plantillas.filter((p) => p.id !== base.id).map((p) => p.producto);
  const disponibles = PRODUCTOS_CRM.filter((p) => p === base.producto || !usados.includes(p));
  const [nombre, setNombre] = useState(base.nombre || '');
  const [producto, setProducto] = useState(base.producto || disponibles[0] || '');
  const [unidadLabel, setUnidadLabel] = useState(base.unidadLabel || 'unidad');
  const [etapas, setEtapas] = useState(Array.isArray(base.etapas) ? base.etapas.map((e) => ({ ...e, owners: e.owners || [] })) : []);
  const owners = colaboradores.filter((c) => isActiveCollab(c) && isInterno(c));

  const updEtapa = (i, k, v) => setEtapas((es) => es.map((e, j) => (j === i ? { ...e, [k]: v } : e)));
  const toggleOwner = (i, id) => setEtapas((es) => es.map((e, j) => (j === i ? { ...e, owners: e.owners.includes(id) ? e.owners.filter((x) => x !== id) : [...e.owners, id] } : e)));
  const addEtapa = () => setEtapas((es) => [...es, etapaVacia(es.length + 1)]);
  const delEtapa = (i) => setEtapas((es) => es.filter((_, j) => j !== i));
  const mover = (i, dir) => setEtapas((es) => {
    const j = i + dir; if (j < 0 || j >= es.length) return es;
    const c = [...es]; [c[i], c[j]] = [c[j], c[i]]; return c;
  });

  const guardar = () => {
    if (!nombre.trim()) { alert('Poné un nombre'); return; }
    if (!producto) { alert('Elegí un producto'); return; }
    const etapasFinal = etapas.map((e, i) => ({ ...e, seq: i + 1, titulo: (e.titulo || '').trim() })).filter((e) => e.titulo);
    onSave({ nombre: nombre.trim(), producto, unidadLabel: unidadLabel.trim() || 'unidad', etapas: etapasFinal }, base.id);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5">
        <h3 className="text-lg font-semibold text-coop-negro mb-4">{isNew ? 'Nueva plantilla' : `Editar ${base.nombre}`}</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1">
            <label className="block text-xs text-slate-500 mb-1">Nombre</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={field} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Producto</label>
            <select value={producto} onChange={(e) => setProducto(e.target.value)} className={field}>
              {disponibles.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Etiqueta de unidad</label>
            <input value={unidadLabel} onChange={(e) => setUnidadLabel(e.target.value)} className={field} placeholder="equipo, medidor…" />
          </div>
        </div>

        <div className="flex items-center justify-between mt-5 mb-2">
          <span className="text-sm font-semibold text-slate-600">Etapas</span>
          <button onClick={addEtapa} className="inline-flex items-center gap-1 text-sm text-coop-azul hover:underline"><Plus size={14} /> Agregar etapa</button>
        </div>

        <div className="space-y-2">
          {etapas.length === 0 && <p className="text-sm text-slate-400">Sin etapas. Agregá la primera.</p>}
          {etapas.map((e, i) => (
            <div key={i} className="border border-slate-200 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-slate-400">{i + 1}</span>
                <input value={e.titulo} onChange={(ev) => updEtapa(i, 'titulo', ev.target.value)} placeholder="Título de la etapa" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm flex-1" />
                <select value={e.tipo} onChange={(ev) => updEtapa(i, 'tipo', ev.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                  {TIPOS_ETAPA.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select>
                <select value={e.priority} onChange={(ev) => updEtapa(i, 'priority', ev.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                  {PRIORIDADES.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
                </select>
                <button onClick={() => mover(i, -1)} className="p-1 text-slate-400 hover:text-slate-700"><ArrowUp size={14} /></button>
                <button onClick={() => mover(i, 1)} className="p-1 text-slate-400 hover:text-slate-700"><ArrowDown size={14} /></button>
                <button onClick={() => delEtapa(i)} className="p-1 text-red-400 hover:text-red-600"><X size={14} /></button>
              </div>
              <input value={e.desc || ''} onChange={(ev) => updEtapa(i, 'desc', ev.target.value)} placeholder="Descripción (opcional)" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm w-full mt-2" />
              <div className="flex flex-wrap gap-1 mt-2">
                {owners.map((c) => {
                  const on = e.owners.includes(c.id);
                  return <button key={c.id} onClick={() => toggleOwner(i, c.id)} className={`text-[11px] px-2 py-0.5 rounded-full border ${on ? 'bg-coop-azul text-white border-coop-azul' : 'border-slate-300 text-slate-500'}`}>{c.nombre.split(/\s+/)[0]}</button>;
                })}
              </div>
              {e.tipo === 'por_equipo' && <p className="text-[11px] text-amber-600 mt-1">Se genera una tarea por cada unidad al ganar el lead.</p>}
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
          <button onClick={guardar} className="px-4 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90">Guardar</button>
        </div>
      </div>
    </div>
  );
}

export default function PlantillasView() {
  const { api, colaboradores } = useData();
  const [plantillas, setPlantillas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [editCtx, setEditCtx] = useState(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    try { const r = await api.plantillas.list(); setPlantillas(r.data || r || []); }
    finally { setCargando(false); }
  }, [api]);
  useEffect(() => { recargar(); }, [recargar]);

  const usados = plantillas.map((p) => p.producto);
  const hayLibres = PRODUCTOS_CRM.some((p) => !usados.includes(p));

  const guardar = async (payload, id) => { if (id) await api.plantillas.update(id, payload); else await api.plantillas.create(payload); setEditCtx(null); await recargar(); };
  const borrar = async (p) => { if (!window.confirm(`¿Eliminar la plantilla "${p.nombre}"?`)) return; await api.plantillas.remove(p.id); await recargar(); };
  const duplicar = (p) => setEditCtx({ nombre: p.nombre + ' (copia)', producto: '', unidadLabel: p.unidadLabel, etapas: p.etapas });

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-slate-600">Plantillas de proceso</h3>
        <button onClick={() => setEditCtx({ etapas: [] })} disabled={!hayLibres} title={hayLibres ? '' : 'Todos los productos ya tienen plantilla'} className="inline-flex items-center gap-1.5 bg-coop-naranja text-white text-sm px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-40">
          <Plus size={16} /> Plantilla
        </button>
      </div>
      <p className="text-xs text-slate-400 mb-4">Cada plantilla define las tareas que se generan al ganar un lead de su producto.</p>

      {cargando ? (
        <p className="text-slate-500">Cargando…</p>
      ) : plantillas.length === 0 ? (
        <p className="text-sm text-slate-400">No hay plantillas todavía.</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {plantillas.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800">{p.nombre}</div>
                <div className="text-xs text-slate-400">{p.producto} · {(p.etapas || []).length} etapas · unidad: {p.unidadLabel}</div>
              </div>
              <button onClick={() => duplicar(p)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Duplicar"><Copy size={15} /></button>
              <button onClick={() => setEditCtx(p)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Editar"><Pencil size={15} /></button>
              <button onClick={() => borrar(p)} className="p-1.5 rounded hover:bg-red-50 text-red-500" title="Eliminar"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}

      {editCtx && <Editor base={editCtx} plantillas={plantillas} colaboradores={colaboradores} onClose={() => setEditCtx(null)} onSave={guardar} />}
    </div>
  );
}
