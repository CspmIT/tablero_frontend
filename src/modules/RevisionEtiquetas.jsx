import { useState, useEffect, useCallback } from 'react';
import { Tags } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';

// Revisión de Etiquetas — pestaña de Configuración (antes "Etiquetas — calidad
// de datos" dentro de Análisis; movida acá el 07/08 porque es un ajuste sobre
// la propia app, no un reporte). Muestra el uso real (grilla + kanban) agrupado
// por escritura normalizada, resalta los racimos de variantes y permite
// unificarlos bajo un nombre canónico. Un solo uso deja los datos históricos
// consistentes.
export default function RevisionEtiquetas() {
  const { api, recargarTags } = useData();
  const [datos, setDatos] = useState(null);
  const [sel, setSel] = useState({});      // nombre exacto -> bool
  const [canonico, setCanonico] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [msj, setMsj] = useState(null);
  const anioActual = new Date().getFullYear();
  const [anio, setAnio] = useState('todos'); // 'todos' | número
  const [detalle, setDetalle] = useState(null); // { tag, cargando, datos }

  const cargar = useCallback(async () => {
    try { setDatos(await api.etiquetas.uso(anio === 'todos' ? null : Number(anio))); }
    catch { setDatos({ etiquetas: [] }); }
  }, [api, anio]);
  useEffect(() => { cargar(); }, [cargar]);

  const verDetalle = async (tag) => {
    setDetalle({ tag, cargando: true, datos: null });
    try {
      const d = await api.etiquetas.detalle(tag, anio === 'todos' ? null : Number(anio));
      setDetalle({ tag, cargando: false, datos: d });
    } catch { setDetalle({ tag, cargando: false, datos: { itemsGrilla: [], cards: [] } }); }
  };

  const etiquetas = datos?.etiquetas || [];
  // Agrupar por clave normalizada; los grupos con más de una forma van primero.
  const grupos = [];
  const porNormal = {};
  for (const e of etiquetas) {
    if (!porNormal[e.normal]) { porNormal[e.normal] = []; grupos.push(porNormal[e.normal]); }
    porNormal[e.normal].push(e);
  }
  grupos.sort((a, b) => b.length - a.length || (b[0].total - a[0].total));

  const seleccionadas = etiquetas.filter((e) => sel[e.tag]).map((e) => e.tag);
  const toggle = (tag) => {
    setSel((s) => {
      const n = { ...s, [tag]: !s[tag] };
      const marcadas = etiquetas.filter((e) => n[e.tag]);
      if (marcadas.length && !canonico) {
        setCanonico(marcadas.sort((a, b) => b.total - a.total)[0].tag);
      }
      return n;
    });
  };

  const unificar = async () => {
    const variantes = seleccionadas.filter((t) => t !== canonico.trim());
    if (!canonico.trim() || !variantes.length) return;
    if (!confirm(`¿Unificar ${variantes.join(', ')} → "${canonico.trim()}"? Se remapean la grilla y el kanban.`)) return;
    setTrabajando(true); setMsj(null);
    try {
      const r = await api.etiquetas.unificar(variantes, canonico.trim());
      setMsj({ tipo: 'ok', texto: `Listo: ${r.diasTocados} días de grilla y ${r.puentesMovidos} vínculos de kanban/objetivos remapeados.` });
      setSel({}); setCanonico('');
      await cargar();
      recargarTags?.();
    } catch (e) {
      setMsj({ tipo: 'error', texto: e.message || 'No se pudo unificar' });
    } finally { setTrabajando(false); }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Tags size={18} className="text-coop-naranja" /> Revisión de Etiquetas
        </h2>
        <select value={anio} onChange={(e) => setAnio(e.target.value)}
          className="border border-slate-300 rounded-lg px-2 py-1 text-sm">
          <option value="todos">Todos los años</option>
          {[anioActual, anioActual - 1, anioActual - 2].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <p className="text-sm text-slate-500 mb-3">
        Marcá variantes que son lo mismo y unificalas. Tocá el <b>contador</b> de una
        etiqueta para ver sus tareas{anio !== 'todos' ? ` de ${anio}` : ''} (g = grilla, k = kanban).
      </p>
      {msj && (
        <p className={`text-sm mb-3 rounded-lg p-2 ${msj.tipo === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{msj.texto}</p>
      )}
      <div className="bg-white border border-slate-200 rounded-xl p-3 max-h-80 overflow-y-auto">
        {grupos.map((g, i) => (
          <div key={i} className={`flex flex-wrap gap-2 py-1.5 ${i > 0 ? 'border-t border-slate-100' : ''}`}>
            {g.length > 1 && <span className="text-[10px] self-center px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">variantes</span>}
            {g.map((e) => (
              <label key={e.tag} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs cursor-pointer select-none ${sel[e.tag] ? 'border-coop-azul bg-coop-azul/10 text-coop-azul' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                <input type="checkbox" className="hidden" checked={!!sel[e.tag]} onChange={() => toggle(e.tag)} />
                {e.tag}
                <button type="button" title={`Ver tareas de "${e.tag}"`}
                  onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); verDetalle(e.tag); }}
                  className="text-slate-400 hover:text-coop-azul hover:underline">
                  {e.grilla}g{e.kanban ? ` · ${e.kanban}k` : ''}
                </button>
              </label>
            ))}
          </div>
        ))}
        {!etiquetas.length && <p className="text-sm text-slate-400">Sin etiquetas registradas todavía.</p>}
      </div>
      {detalle && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setDetalle(null)}>
          <div className="bg-white rounded-xl w-full max-w-lg p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-1">Tareas con "{detalle.tag}"</h3>
            <p className="text-xs text-slate-400 mb-3">{anio === 'todos' ? 'Todos los años' : `Año ${anio}`} · agrupa variantes de escritura</p>
            {detalle.cargando ? <p className="text-sm text-slate-400">Cargando…</p> : (
              <>
                {detalle.datos.itemsGrilla.length > 0 && (
                  <>
                    <p className="text-sm font-medium text-slate-600 mb-1.5">Grilla ({detalle.datos.itemsGrilla.length})</p>
                    <ul className="space-y-1 mb-4">
                      {detalle.datos.itemsGrilla.map((it, i) => (
                        <li key={i} className="text-sm text-slate-700 flex gap-2 border-b border-slate-50 pb-1">
                          <span className="text-xs text-slate-400 whitespace-nowrap mt-0.5">{it.fecha.split('-').reverse().join('/')}</span>
                          <span className="text-xs text-coop-azul whitespace-nowrap mt-0.5">{it.colaborador.split(' ')[0]}</span>
                          <span className="break-words min-w-0 flex-1">{it.texto}</span>
                          {it.horas ? <span className="text-xs text-slate-400 whitespace-nowrap mt-0.5">{it.horas} hs</span> : null}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {detalle.datos.cards.length > 0 && (
                  <>
                    <p className="text-sm font-medium text-slate-600 mb-1.5">Kanban ({detalle.datos.cards.length})</p>
                    <ul className="space-y-1">
                      {detalle.datos.cards.map((c, i) => (
                        <li key={i} className="text-sm text-slate-700 flex gap-2">
                          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{c.columna}</span>
                          <span className="break-words min-w-0">{c.titulo}</span>
                          {c.proyecto && <span className="text-xs text-slate-400">({c.proyecto})</span>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {!detalle.datos.itemsGrilla.length && !detalle.datos.cards.length && (
                  <p className="text-sm text-slate-400">Sin tareas en el período.</p>
                )}
              </>
            )}
            <div className="flex justify-end mt-4">
              <button onClick={() => setDetalle(null)} className="px-4 py-2 text-sm bg-coop-negro text-white rounded-lg hover:opacity-90">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {seleccionadas.length > 1 && (
        <div className="flex items-center gap-2 mt-3">
          <span className="text-sm text-slate-600">Unificar {seleccionadas.length} como</span>
          <input value={canonico} onChange={(e) => setCanonico(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-44
                       focus:outline-none focus:ring-2 focus:ring-coop-azul/40 focus:border-coop-azul" />
          <button onClick={unificar} disabled={trabajando || !canonico.trim()}
            className="px-4 py-1.5 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90 disabled:opacity-40">
            {trabajando ? 'Unificando…' : 'Unificar'}
          </button>
        </div>
      )}
    </div>
  );
}
