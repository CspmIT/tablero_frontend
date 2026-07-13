import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Upload } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';
import { computeProyectoPct } from './objetivosUtils.js';
import { COLUMNS, prioInfo, fmtCorta, hoyISO } from './kanbanUtils.js';
import { isInterno, isActiveCollab } from './grillaUtils.js';
import CardModal from './CardModal.jsx';
import ProyectoModal from './ProyectoModal.jsx';
import PlantillasView from './PlantillasView.jsx';
import ImportarPlanner from './ImportarPlanner.jsx';

function KCard({ card, proyecto, colaboradores, onDragStart, onClick }) {
  const owners = (card.ownersIds || []).map((id) => colaboradores.find((c) => c.id === id)).filter(Boolean);
  const shown = owners.slice(0, 3);
  const extra = owners.length - shown.length;
  const pri = prioInfo(card.prioridad);
  return (
    <div
      draggable onDragStart={(e) => onDragStart(e, card)} onClick={onClick}
      className={`bg-white rounded-lg border border-slate-200 p-2.5 cursor-pointer hover:shadow-sm ${card.kanbanCol === 'done' ? 'opacity-70' : ''}`}
    >
      {proyecto && <div className="text-[11px] text-slate-400 truncate">{proyecto.cliente ? proyecto.cliente + ' · ' : ''}{proyecto.nombre}</div>}
      <div className="text-sm text-slate-800 font-medium leading-snug">{card.titulo}</div>
      {(card.tags || []).length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {card.tags.slice(0, 4).map((t) => (
            <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: (t.color || '#243E91') + '1a', color: t.color || '#243E91' }}>{t.nombre}</span>
          ))}
        </div>
      )}
      {Array.isArray(card.unidades) && card.unidades.length > 0 && (
        <div className="text-[11px] text-slate-400 mt-1">▦ {card.unidades.filter((u) => u.hecho).length}/{card.unidades.length} equipos</div>
      )}
      {(card.startedAt || card.closedAt) && (
        <div className="text-[11px] text-slate-400 mt-1 flex gap-2">
          {card.startedAt && <span>▶ {fmtCorta(card.startedAt)}</span>}
          {card.closedAt && <span>✓ {fmtCorta(card.closedAt)}</span>}
        </div>
      )}
      <div className="flex items-center justify-between mt-2">
        <div className="flex -space-x-1">
          {shown.map((o) => (
            <span key={o.id} title={o.nombre} className="w-5 h-5 rounded-full bg-slate-200 text-[9px] flex items-center justify-center font-mono ring-1 ring-white">{o.iniciales || o.nombre[0]}</span>
          ))}
          {extra > 0 && <span className="w-5 h-5 rounded-full bg-slate-300 text-[9px] flex items-center justify-center">+{extra}</span>}
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: pri.color + '1a', color: pri.color }}>{pri.label}</span>
      </div>
      {card.kanbanCol !== 'done' && typeof card.pct === 'number' && card.pct > 0 && (
        <div className="h-1 bg-slate-100 rounded mt-1.5 overflow-hidden"><div className="h-full bg-coop-azul" style={{ width: `${card.pct}%` }} /></div>
      )}
    </div>
  );
}

// Gestión del catálogo de clientes: agregar, renombrar (propaga a proyectos),
// eliminar (solo sin proyectos) y fusionar (reasigna proyectos y borra el origen).
function ClientesManager({ nombres, usage, onAdd, onRename, onDelete, onMerge }) {
  const [nuevo, setNuevo] = useState('');
  const [renombrando, setRenombrando] = useState(null);
  const [valorRename, setValorRename] = useState('');
  const [mergeFrom, setMergeFrom] = useState('');
  const [mergeTo, setMergeTo] = useState('');
  const agregar = () => { if (nuevo.trim()) { onAdd(nuevo); setNuevo(''); } };
  const confirmarRename = () => {
    if (renombrando && valorRename.trim() && valorRename.trim() !== renombrando) onRename(renombrando, valorRename);
    setRenombrando(null); setValorRename('');
  };
  return (
    <div className="max-w-2xl">
      <div className="flex gap-2 mb-4">
        <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && agregar()}
          placeholder="Nombre del nuevo cliente…" className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm flex-1" />
        <button onClick={agregar} className="inline-flex items-center gap-1.5 bg-coop-naranja text-white text-sm px-3 py-1.5 rounded-lg hover:opacity-90"><Plus size={16} /> Agregar</button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {nombres.length === 0 ? (
          <p className="text-sm text-slate-400 p-4">No hay clientes cargados.</p>
        ) : nombres.map((name) => {
          const uso = usage[name] || 0;
          const editando = renombrando === name;
          return (
            <div key={name} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                {editando ? (
                  <input autoFocus value={valorRename} onChange={(e) => setValorRename(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmarRename(); if (e.key === 'Escape') { setRenombrando(null); setValorRename(''); } }}
                    className="border border-slate-300 rounded px-2 py-1 text-sm w-full" />
                ) : (
                  <span className="text-sm text-slate-800">{name}</span>
                )}
                <span className="text-xs text-slate-400 ml-2">{uso === 0 ? 'sin proyectos' : `${uso} proyecto${uso === 1 ? '' : 's'}`}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {editando ? (
                  <>
                    <button onClick={confirmarRename} className="text-sm text-coop-azul hover:underline">Guardar</button>
                    <button onClick={() => { setRenombrando(null); setValorRename(''); }} className="text-sm text-slate-500 hover:underline">Cancelar</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setRenombrando(name); setValorRename(name); }} className="text-sm text-coop-azul hover:underline">Renombrar</button>
                    <button onClick={() => onDelete(name)} disabled={uso > 0}
                      title={uso > 0 ? 'No se puede eliminar: tiene proyectos. Usá Fusionar.' : ''}
                      className="text-sm text-red-500 hover:underline disabled:text-slate-300 disabled:no-underline disabled:cursor-not-allowed">Eliminar</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 bg-slate-50 rounded-xl border border-slate-200 p-4">
        <h4 className="text-sm font-semibold text-slate-700">Fusionar dos clientes</h4>
        <p className="text-xs text-slate-500 mt-0.5 mb-3">Los proyectos del primer cliente se reasignan al segundo, y el primero se elimina del catálogo.</p>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={mergeFrom} onChange={(e) => setMergeFrom(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-full sm:w-auto">
            <option value="">— Origen —</option>
            {nombres.map((c) => <option key={c} value={c}>{c} ({usage[c] || 0})</option>)}
          </select>
          <span className="text-slate-400">→</span>
          <select value={mergeTo} onChange={(e) => setMergeTo(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-full sm:w-auto">
            <option value="">— Destino —</option>
            {nombres.filter((c) => c !== mergeFrom).map((c) => <option key={c} value={c}>{c} ({usage[c] || 0})</option>)}
          </select>
          <button onClick={() => { onMerge(mergeFrom, mergeTo); setMergeFrom(''); setMergeTo(''); }}
            disabled={!mergeFrom || !mergeTo || mergeFrom === mergeTo}
            className="text-sm bg-coop-azul text-white px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-40">Fusionar</button>
        </div>
      </div>
    </div>
  );
}

export default function Kanban() {
  const { api, colaboradores } = useData();
  const [proyectos, setProyectos] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [objetivos, setObjetivos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [subtab, setSubtab] = useState('tablero');
  const [search, setSearch] = useState('');
  const [fOwner, setFOwner] = useState('');
  const [fProyecto, setFProyecto] = useState('');
  const [cardCtx, setCardCtx] = useState(null); // null | { initialColumn } | { card }
  const [proyCtx, setProyCtx] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      const [prys, trs, objs, cls] = await Promise.all([api.proyectos.list(), api.tareas.list(), api.objetivos.list(), api.clientes.list()]);
      setProyectos(prys.data || prys || []);
      setTareas(trs.data || trs || []);
      setObjetivos(objs.data || objs || []);
      setClientes(cls.data || cls || []);
    } finally {
      setCargando(false);
    }
  }, [api]);
  useEffect(() => { recargar(); }, [recargar]);

  const proyById = Object.fromEntries(proyectos.map((p) => [p.id, p]));
  const objById = Object.fromEntries(objetivos.map((o) => [o.id, o]));

  const visibles = tareas.filter((c) => {
    if (fProyecto && c.proyectoId !== Number(fProyecto)) return false;
    if (fOwner && !(c.ownersIds || []).includes(Number(fOwner))) return false;
    if (search) {
      const s = search.toLowerCase();
      const p = proyById[c.proyectoId];
      const hay = (c.titulo || '').toLowerCase().includes(s) || (p && (p.nombre || '').toLowerCase().includes(s)) || (c.tags || []).some((t) => (t.nombre || '').toLowerCase().includes(s));
      if (!hay) return false;
    }
    return true;
  });

  const mover = async (card, col) => {
    if (card.kanbanCol === col) return;
    const patch = { kanbanCol: col };
    if (col === 'doing' && !card.startedAt) patch.startedAt = hoyISO();
    if (col === 'done' && !card.closedAt) patch.closedAt = hoyISO();
    setTareas((ts) => ts.map((t) => (t.id === card.id ? { ...t, ...patch } : t)));
    try { await api.tareas.update(card.id, patch); await recargar(); }
    catch (e) { alert('No se pudo mover: ' + (e.message || '')); recargar(); }
  };
  const onDragStart = (e, card) => { e.dataTransfer.setData('text/plain', String(card.id)); };

  // --- Vistas por cliente ---
  // Agrupación de las tareas filtradas por el cliente de su proyecto.
  const cardsByCliente = (() => {
    const map = {};
    visibles.forEach((c) => {
      const cli = proyById[c.proyectoId]?.cliente || 'Sin cliente';
      (map[cli] = map[cli] || []).push(c);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  })();
  // Uso por cliente = cantidad de proyectos que lo referencian.
  const clienteUsage = proyectos.reduce((acc, p) => { if (p.cliente) acc[p.cliente] = (acc[p.cliente] || 0) + 1; return acc; }, {});
  // Nombres a gestionar: unión del catálogo y los usados en proyectos.
  const nombresClientes = Array.from(new Set([...clientes.map((c) => c.nombre), ...proyectos.map((p) => p.cliente).filter(Boolean)])).sort((a, b) => a.localeCompare(b));

  const addCliente = async (nombre) => {
    const n = nombre.trim(); if (!n) return;
    if (clientes.some((c) => c.nombre === n)) { alert('Ya existe un cliente con ese nombre.'); return; }
    try { await api.clientes.create({ nombre: n }); await recargar(); }
    catch (e) { alert('No se pudo agregar: ' + (e.message || '')); }
  };
  const renameCliente = async (viejo, nuevo) => {
    const n = nuevo.trim(); if (!n || n === viejo) return;
    try {
      const matches = clientes.filter((c) => c.nombre === viejo);
      await Promise.all(matches.map((c) => api.clientes.update(c.id, { nombre: n })));
      const afectados = proyectos.filter((p) => p.cliente === viejo);
      await Promise.all(afectados.map((p) => api.proyectos.update(p.id, { cliente: n })));
      await recargar();
    } catch (e) { alert('No se pudo renombrar: ' + (e.message || '')); }
  };
  const deleteCliente = async (nombre) => {
    if ((clienteUsage[nombre] || 0) > 0) return;
    if (!window.confirm(`¿Eliminar el cliente "${nombre}" del catálogo?`)) return;
    try {
      // Borra TODOS los registros del catálogo con ese nombre (el catálogo admite duplicados).
      const matches = clientes.filter((c) => c.nombre === nombre);
      await Promise.all(matches.map((c) => api.clientes.remove(c.id)));
      await recargar();
    } catch (e) { alert('No se pudo eliminar: ' + (e.message || '')); }
  };
  const mergeClientes = async (origen, destino) => {
    if (!origen || !destino || origen === destino) return;
    if (!window.confirm(`Fusionar "${origen}" en "${destino}": los proyectos de "${origen}" pasan a "${destino}" y se elimina "${origen}". ¿Continuar?`)) return;
    try {
      const afectados = proyectos.filter((p) => p.cliente === origen);
      await Promise.all(afectados.map((p) => api.proyectos.update(p.id, { cliente: destino })));
      const matches = clientes.filter((c) => c.nombre === origen);
      await Promise.all(matches.map((c) => api.clientes.remove(c.id)));
      await recargar();
    } catch (e) { alert('No se pudo fusionar: ' + (e.message || '')); }
  };
  const onDrop = (e, col) => { e.preventDefault(); const id = Number(e.dataTransfer.getData('text/plain')); const card = tareas.find((t) => t.id === id); if (card) mover(card, col); };

  const guardarCard = async (payload, id) => { if (id) await api.tareas.update(id, payload); else await api.tareas.create(payload); setCardCtx(null); await recargar(); };
  const borrarCard = async (card) => { if (!window.confirm(`¿Eliminar "${card.titulo}"?`)) return; await api.tareas.remove(card.id); setCardCtx(null); await recargar(); };
  const guardarProy = async (payload, id) => { if (id) await api.proyectos.update(id, payload); else await api.proyectos.create(payload); setProyCtx(null); await recargar(); };
  const borrarProyecto = async (p) => {
    const n = tareas.filter((t) => t.proyectoId === p.id).length;
    const msg = n > 0
      ? `¿Eliminar el proyecto "${p.nombre}"? Tiene ${n} tarea${n === 1 ? '' : 's'} que quedarán sin proyecto (no se borran).`
      : `¿Eliminar el proyecto "${p.nombre}"?`;
    if (!window.confirm(msg)) return;
    try { await api.proyectos.remove(p.id); setProyCtx(null); await recargar(); }
    catch (e) { alert('No se pudo eliminar: ' + (e.message || '')); }
  };

  // Responsables que pueden tener tareas: internos del área (activos) y tercerizados. Gerentes y otras áreas no asignan tareas.
  const responsables = colaboradores.filter((c) => isActiveCollab(c) && (isInterno(c) || c.tipo === 'tercerizado'));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button onClick={() => setSubtab('tablero')} className={`text-sm px-3 py-1.5 rounded-lg ${subtab === 'tablero' ? 'bg-coop-azul text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Tablero <span className="opacity-70">{visibles.length}</span></button>
        <button onClick={() => setSubtab('proyectos')} className={`text-sm px-3 py-1.5 rounded-lg ${subtab === 'proyectos' ? 'bg-coop-azul text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Proyectos <span className="opacity-70">{proyectos.length}</span></button>
        <button onClick={() => setSubtab('plantillas')} className={`text-sm px-3 py-1.5 rounded-lg ${subtab === 'plantillas' ? 'bg-coop-azul text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Plantillas</button>
        <button onClick={() => setSubtab('cliente')} className={`text-sm px-3 py-1.5 rounded-lg ${subtab === 'cliente' ? 'bg-coop-azul text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Por cliente</button>
        <button onClick={() => setSubtab('clientes')} className={`text-sm px-3 py-1.5 rounded-lg ${subtab === 'clientes' ? 'bg-coop-azul text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Clientes <span className="opacity-70">{nombresClientes.length}</span></button>
        <div className="ml-auto" />
        {subtab === 'tablero' && <button onClick={() => setImportOpen(true)} className="inline-flex items-center gap-1.5 text-coop-azul border border-coop-azul/30 text-sm px-3 py-1.5 rounded-lg hover:bg-coop-azul/5"><Upload size={16} /> Importar de Planner</button>}
        {subtab === 'tablero' && <button onClick={() => setCardCtx({ initialColumn: 'todo' })} className="inline-flex items-center gap-1.5 bg-coop-naranja text-white text-sm px-3 py-1.5 rounded-lg hover:opacity-90"><Plus size={16} /> Tarjeta</button>}
        {subtab === 'proyectos' && <button onClick={() => setProyCtx({})} className="inline-flex items-center gap-1.5 bg-coop-naranja text-white text-sm px-3 py-1.5 rounded-lg hover:opacity-90"><Plus size={16} /> Proyecto</button>}
      </div>

      {(subtab === 'tablero' || subtab === 'cliente') && (
        <div className="flex flex-wrap gap-2 mb-4">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por título, tag o proyecto…" className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-48" />
          <select value={fOwner} onChange={(e) => setFOwner(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-full sm:w-auto">
            <option value="">Todos los responsables</option>
            {responsables.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select value={fProyecto} onChange={(e) => setFProyecto(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-full sm:w-auto">
            <option value="">Todos los proyectos</option>
            {proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
      )}

      {cargando ? (
        <p className="text-slate-500">Cargando…</p>
      ) : subtab === 'tablero' ? (
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
          {COLUMNS.map((col) => {
            const cards = visibles.filter((c) => c.kanbanCol === col.id);
            return (
              <div key={col.id} className="bg-slate-50 rounded-xl p-2 w-72 shrink-0 snap-start" onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, col.id)}>
                <div className="flex items-center justify-between px-1 py-1 mb-1">
                  <span className="text-sm font-semibold text-slate-600">{col.label}</span>
                  <span className="text-xs text-slate-400">{cards.length}</span>
                </div>
                <div className="space-y-2 min-h-12">
                  {cards.map((card) => (
                    <KCard key={card.id} card={card} proyecto={proyById[card.proyectoId]} colaboradores={colaboradores} onDragStart={onDragStart} onClick={() => setCardCtx({ card })} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : subtab === 'proyectos' ? (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {proyectos.length === 0 ? (
            <p className="text-sm text-slate-400 p-4">No hay proyectos todavía.</p>
          ) : proyectos.map((p) => {
            const pct = computeProyectoPct(p.id, tareas);
            const obj = p.objetivoId ? objById[p.objetivoId] : null;
            const owner = colaboradores.find((c) => c.id === p.ownerId);
            const nCards = tareas.filter((t) => t.proyectoId === p.id).length;
            return (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{p.cliente ? p.cliente + ' · ' : ''}{p.nombre}</div>
                  <div className="text-xs text-slate-400 flex gap-2 flex-wrap">
                    {obj && <span>{obj.codigo}</span>}
                    {owner && <span>{owner.nombre.split(/\s+/)[0]}</span>}
                    <span className="capitalize">{p.estado}</span>
                    <span>{nCards} tareas</span>
                  </div>
                </div>
                <div className="w-20 sm:w-28 shrink-0">
                  <div className="text-right text-xs font-mono text-slate-500">{pct == null ? '—' : pct + '%'}</div>
                  <div className="h-1.5 bg-slate-100 rounded mt-0.5 overflow-hidden"><div className="h-full bg-coop-azul" style={{ width: `${pct || 0}%` }} /></div>
                </div>
                <button onClick={() => setProyCtx({ proyecto: p })} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Editar"><Pencil size={15} /></button>
                <button onClick={() => borrarProyecto(p)} className="p-1.5 rounded hover:bg-red-50 text-red-500" title="Eliminar"><Trash2 size={15} /></button>
              </div>
            );
          })}
        </div>
      ) : subtab === 'cliente' ? (
        <div className="space-y-5">
          {cardsByCliente.length === 0 ? (
            <p className="text-sm text-slate-400">No hay tareas con los filtros aplicados.</p>
          ) : cardsByCliente.map(([cli, cs]) => (
            <div key={cli}>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">{cli} <span className="text-slate-400 font-normal">· {cs.length} tarea{cs.length === 1 ? '' : 's'}</span></h3>
              <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
                {COLUMNS.map((col) => {
                  const colCs = cs.filter((c) => c.kanbanCol === col.id);
                  if (colCs.length === 0) return null;
                  return (
                    <div key={col.id} className="bg-slate-50 rounded-xl p-2 w-72 shrink-0 snap-start">
                      <div className="flex items-center justify-between px-1 py-1 mb-1">
                        <span className="text-sm font-semibold text-slate-600">{col.label}</span>
                        <span className="text-xs text-slate-400">{colCs.length}</span>
                      </div>
                      <div className="space-y-2">
                        {colCs.map((card) => (
                          <KCard key={card.id} card={card} proyecto={proyById[card.proyectoId]} colaboradores={colaboradores} onDragStart={() => {}} onClick={() => setCardCtx({ card })} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : subtab === 'clientes' ? (
        <ClientesManager nombres={nombresClientes} usage={clienteUsage} onAdd={addCliente} onRename={renameCliente} onDelete={deleteCliente} onMerge={mergeClientes} />
      ) : (
        <PlantillasView />
      )}

      {cardCtx && (
        <CardModal open={!!cardCtx} card={cardCtx.card} initialColumn={cardCtx.initialColumn} proyectos={proyectos} onClose={() => setCardCtx(null)} onSave={guardarCard} onDelete={borrarCard} />
      )}
      {proyCtx && (
        <ProyectoModal open={!!proyCtx} proyecto={proyCtx.proyecto} objetivos={objetivos} clientes={clientes} onClose={() => setProyCtx(null)} onSave={guardarProy} />
      )}
      {importOpen && (
        <ImportarPlanner open={importOpen} clientes={clientes} onClose={() => setImportOpen(false)} onDone={recargar} />
      )}
    </div>
  );
}
