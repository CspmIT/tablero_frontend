import { useEffect, useState, useCallback, useMemo } from 'react';
import { useData } from '../data/DataContext.jsx';
import { isActiveCollab } from './grillaUtils.js';
import PresupuestadorReconecta from './PresupuestadorReconecta.jsx';
import AguaModal from './AguaModal.jsx';
import CoopCloudModal from './CoopCloudModal.jsx';
import ImportarLeads from './ImportarLeads.jsx';
import CRMMetricas from './CRMMetricas.jsx';

const ETAPAS = [
  { id: 'contacto', label: 'Contacto' },
  { id: 'visita_agendada', label: 'Oportunidad' },
  { id: 'visita_realizada', label: 'Visita realizada' },
  { id: 'propuesta', label: 'Propuesta' },
  { id: 'negociacion', label: 'Negociación' },
  { id: 'trial', label: 'Trial' },
  { id: 'ganado', label: 'Ganado' },
  { id: 'perdido', label: 'Perdido' },
];
const PRODUCTOS = ['+Agua', 'Reconecta', 'Centinela', 'CoopCloud', 'Cooptech (consultoría)', 'Otro'];
const FUENTES = ['Referido', 'Evento', 'Web', 'Llamada en frío', 'Recomendación', 'Otro'];
const TIPOS_ACT = [{ v: 'visita', label: 'Visita' }, { v: 'videollamada', label: 'Videollamada' }, { v: 'evento', label: 'Evento' }];

const leadVacio = {
  organizacion: '', contactoNombre: '', telefono: '', email: '', ciudad: '', fechaPrimerContacto: '',
  productos: [], valorEstimadoUsd: '', esEvento: false, cantidadEquipos: '', equiposDetalle: '', ownerId: '',
  etapa: 'contacto', fuente: '', fuenteOtra: '', proximaAccion: '', proximaAccionFecha: '', notas: '',
  trialVence: '', trialNotas: '', motivoPerdido: '', montoFacturadoUsd: '',
  presupuestoEnviadoFecha: '', presupuestoAprobadoFecha: '', presupuestoLink: '',
};

const hoy = () => new Date().toISOString().slice(0, 10);
const leadIsOverdue = (l) => l.proximaAccionFecha && String(l.proximaAccionFecha).slice(0, 10) < hoy() && l.etapa !== 'ganado' && l.etapa !== 'perdido';
const fmtUSD = (n) => 'US$ ' + Number(n).toLocaleString('es-AR');

export default function CRM() {
  const { api, colaboradores } = useData();
  const [leads, setLeads] = useState([]);
  const [importOpen, setImportOpen] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(null);
  const [actividades, setActividades] = useState([]);
  const [actForm, setActForm] = useState({ tipo: 'visita', fecha: hoy(), notas: '' });
  const [arrastrando, setArrastrando] = useState(null);
  const [ganarCtx, setGanarCtx] = useState(null);
  const [filtroOwner, setFiltroOwner] = useState('');
  // Preferencia de mostrar la columna "perdidos" (oculta por defecto), por navegador.
  const [mostrarPerdidos, setMostrarPerdidos] = useState(() => {
    try { return localStorage.getItem('cooptech:crm_mostrar_perdidos') === '1'; } catch { return false; }
  });
  const togglePerdidos = () => setMostrarPerdidos((v) => {
    const nv = !v;
    try { localStorage.setItem('cooptech:crm_mostrar_perdidos', nv ? '1' : '0'); } catch { /* sin persistencia si el navegador no deja */ }
    return nv;
  });
  // Filtro por fecha: período (acumulado o un año) y según qué fecha del lead se clasifica.
  const [periodo, setPeriodo] = useState('acumulado');
  const [dimFecha, setDimFecha] = useState('contacto');
  const [showMetricas, setShowMetricas] = useState(false);
  const [presupCtx, setPresupCtx] = useState(null); // { tipo, modo, lead }

  const guardarEstado = useCallback(async (campo, valor, extra = {}) => {
    const id = presupCtx?.lead?.id;
    if (!id) return;
    try {
      const upd = await api.leads.update(id, { [campo]: valor, ...extra });
      setLeads((ls) => ls.map((x) => (x.id === id ? { ...x, ...upd } : x)));
      setPresupCtx((c) => (c ? { ...c, lead: { ...c.lead, [campo]: valor } } : c));
    } catch { /* el iframe conserva el estado; reintenta al próximo autosave */ }
  }, [api, presupCtx]);

  const valorDeTotales = (totales) => {
    const total = totales && (totales.totalUSD ?? totales.total ?? totales.totalUsd);
    return total != null && !isNaN(Number(total)) ? { valorEstimadoUsd: Number(total), valorOrigen: 'presupuestador' } : {};
  };

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try { const res = await api.leads.list({ pageSize: 500 }); setLeads(res.data || []); }
    catch (e) { setError(e.message || 'No se pudo cargar el CRM'); }
    finally { setCargando(false); }
  }, [api]);
  useEffect(() => { cargar(); }, [cargar]);

  const ownerNombre = (id) => (colaboradores.find((c) => c.id === id) || {}).nombre || '';
  // Responsables del CRM: perfiles comerciales (manager, gerencial o con función de costo comercial).
  const responsables = colaboradores.filter((c) => isActiveCollab(c) && (c.tipo === 'manager' || c.tipo === 'gerencial' || c.funcionCosto === 'comercial'));

  // Fecha por la que se clasifica cada lead, según el criterio elegido.
  const fechaAnclaLead = useCallback((l) => {
    if (dimFecha === 'contacto') return l.fechaPrimerContacto || null;
    if (dimFecha === 'presupuesto') return l.presupuestoEnviadoFecha || null;
    return l.presupuestoAprobadoFecha || null; // ganado
  }, [dimFecha]);

  // Años disponibles: del actual hacia atrás hasta 2023 (el próximo año aparece solo).
  const aniosDisponibles = useMemo(() => {
    const arr = [];
    for (let y = new Date().getFullYear(); y >= 2023; y--) arr.push(String(y));
    return arr;
  }, []);

  // Leads del período: acumulado = todos; un año = los que tengan la fecha del criterio en ese año.
  const leadsBase = useMemo(() => {
    if (periodo === 'acumulado') return leads;
    return leads.filter((l) => { const f = fechaAnclaLead(l); return f && String(f).slice(0, 4) === periodo; });
  }, [leads, periodo, fechaAnclaLead]);

  const sinFechaCount = useMemo(
    () => (periodo === 'acumulado' ? 0 : leads.filter((l) => !fechaAnclaLead(l)).length),
    [leads, periodo, fechaAnclaLead]
  );
  const pipeline = leadsBase.filter((l) => !['ganado', 'perdido'].includes(l.etapa)).reduce((s, l) => s + Number(l.valorEstimadoUsd || 0), 0);

  const mover = async (leadId, etapa) => {
    const l = leads.find((x) => x.id === leadId);
    if (!l || l.etapa === etapa) return;
    if (etapa === 'ganado') { abrirGanar(l); return; }
    const previo = l.etapa;
    setLeads((ls) => ls.map((x) => (x.id === leadId ? { ...x, etapa } : x)));
    try { await api.leads.update(leadId, { etapa }); }
    catch (e) { setLeads((ls) => ls.map((x) => (x.id === leadId ? { ...x, etapa: previo } : x))); alert('No se pudo mover: ' + (e.message || '')); }
  };

  const abrirGanar = async (lead) => {
    let aplicables = [];
    try { const res = await api.plantillas.list(); aplicables = (res.data || res || []).filter((p) => (lead.productos || []).includes(p.producto)); } catch { /* ignore */ }
    setGanarCtx({ lead, aplicables, sel: aplicables.map((p) => p.id), nEquipos: lead.cantidadEquipos || 1 });
  };
  const toggleSel = (id) => setGanarCtx((g) => ({ ...g, sel: g.sel.includes(id) ? g.sel.filter((x) => x !== id) : [...g.sel, id] }));
  // Cada etapa = 1 tarjeta (las "por_equipo" llevan N unidades adentro).
  const contarTarjetas = (g) => g.aplicables.filter((p) => g.sel.includes(p.id)).reduce((n, p) => n + (p.etapas || []).length, 0);
  const confirmarGanar = async () => {
    const g = ganarCtx;
    try { await api.leads.ganar(g.lead.id, { plantillas: g.sel, cantidadEquipos: Number(g.nEquipos) || 1 }); setGanarCtx(null); await cargar(); }
    catch (e) { alert('No se pudo ganar el lead: ' + (e.message || '')); }
  };

  const numOrNull = (v) => (v === '' || v == null ? null : Number(v));
  const strOrNull = (v) => (v ? v : null);
  const guardar = async () => {
    if (!form.organizacion.trim()) { alert('La organización es obligatoria'); return; }
    const payload = {
      organizacion: form.organizacion.trim(), contactoNombre: strOrNull(form.contactoNombre), telefono: strOrNull(form.telefono),
      email: strOrNull(form.email), ciudad: strOrNull(form.ciudad), fechaPrimerContacto: strOrNull(form.fechaPrimerContacto),
      productos: form.productos, valorEstimadoUsd: numOrNull(form.valorEstimadoUsd), esEvento: !!form.esEvento, cantidadEquipos: numOrNull(form.cantidadEquipos),
      equiposDetalle: strOrNull(form.equiposDetalle), ownerId: numOrNull(form.ownerId), etapa: form.etapa,
      fuente: strOrNull(form.fuente), fuenteOtra: strOrNull(form.fuenteOtra), proximaAccion: strOrNull(form.proximaAccion),
      proximaAccionFecha: strOrNull(form.proximaAccionFecha), notas: strOrNull(form.notas),
      trialVence: strOrNull(form.trialVence), trialNotas: strOrNull(form.trialNotas), motivoPerdido: strOrNull(form.motivoPerdido),
      montoFacturadoUsd: numOrNull(form.montoFacturadoUsd), presupuestoEnviadoFecha: strOrNull(form.presupuestoEnviadoFecha),
      presupuestoAprobadoFecha: strOrNull(form.presupuestoAprobadoFecha), presupuestoLink: strOrNull(form.presupuestoLink),
    };
    try {
      if (form.id) await api.leads.update(form.id, payload);
      else await api.leads.create(payload);
      setForm(null); await cargar();
    } catch (e) { alert('No se pudo guardar: ' + (e.message || '')); }
  };

  const eliminar = async (l) => {
    if (!window.confirm(`¿Eliminar el lead "${l.organizacion}"?`)) return;
    try { await api.leads.remove(l.id); await cargar(); } catch (e) { alert('No se pudo eliminar: ' + (e.message || '')); }
  };

  const dstr = (v) => (v ? String(v).slice(0, 10) : '');
  const editar = async (l) => {
    setForm({
      ...leadVacio, ...l, productos: l.productos || [], valorEstimadoUsd: l.valorEstimadoUsd ?? '', esEvento: !!l.esEvento, cantidadEquipos: l.cantidadEquipos ?? '',
      ownerId: l.ownerId ?? '', equiposDetalle: l.equiposDetalle || '', fuente: l.fuente || '', fuenteOtra: l.fuenteOtra || '',
      proximaAccion: l.proximaAccion || '', notas: l.notas || '', trialNotas: l.trialNotas || '', motivoPerdido: l.motivoPerdido || '',
      montoFacturadoUsd: l.montoFacturadoUsd ?? '', presupuestoLink: l.presupuestoLink || '',
      fechaPrimerContacto: dstr(l.fechaPrimerContacto), proximaAccionFecha: dstr(l.proximaAccionFecha), trialVence: dstr(l.trialVence),
      presupuestoEnviadoFecha: dstr(l.presupuestoEnviadoFecha), presupuestoAprobadoFecha: dstr(l.presupuestoAprobadoFecha),
    });
    setActividades([]); setActForm({ tipo: 'visita', fecha: hoy(), notas: '' });
    if (l.id) { try { const a = await api.leads.actividades(l.id); setActividades(a.data || a || []); } catch { /* ignore */ } }
  };

  const agregarActividad = async () => {
    if (!form?.id) { alert('Guardá el lead primero'); return; }
    try {
      await api.leads.addActividad(form.id, { tipo: actForm.tipo, fecha: actForm.fecha, notas: actForm.notas || null });
      const a = await api.leads.actividades(form.id); setActividades(a.data || a || []);
      setActForm({ tipo: 'visita', fecha: hoy(), notas: '' });
    } catch (e) { alert('No se pudo registrar la actividad: ' + (e.message || '')); }
  };

  const toggleProducto = (p) => setForm((f) => ({ ...f, productos: f.productos.includes(p) ? f.productos.filter((x) => x !== p) : [...f.productos, p] }));

  if (cargando) return <p className="text-slate-500">Cargando CRM…</p>;
  if (error) return <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">{error}</div>;

  const colColor = (id) => (id === 'ganado' ? 'bg-emerald-50' : id === 'perdido' ? 'bg-slate-200' : 'bg-slate-100');
  const visibles = (etId) => leadsBase.filter((l) => l.etapa === etId && (!filtroOwner || l.ownerId === Number(filtroOwner)));

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-coop-negro">CRM · Embudo comercial</h2>
          <p className="text-sm text-slate-500">Pipeline activo: <span className="font-mono text-emerald-700">{fmtUSD(pipeline)}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <select value={filtroOwner} onChange={(e) => setFiltroOwner(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            {responsables.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <button onClick={() => setShowMetricas(true)} className="border border-slate-200 text-slate-600 text-sm px-3 py-2 rounded-lg hover:bg-slate-50">Métricas</button>
          <button onClick={togglePerdidos} className="border border-slate-200 text-slate-600 text-sm px-3 py-2 rounded-lg hover:bg-slate-50">
            {mostrarPerdidos ? 'Ocultar perdidos' : 'Mostrar perdidos'}
          </button>
          <button onClick={() => setImportOpen(true)} className="border border-slate-200 text-slate-600 text-sm font-medium px-3 py-2 rounded-lg hover:bg-slate-50">Importar de Kommo</button>
          <button onClick={() => setForm({ ...leadVacio })} className="bg-coop-naranja text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90">+ Lead</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setPeriodo('acumulado')} className={`text-sm px-3 py-1.5 rounded-lg border ${periodo === 'acumulado' ? 'bg-coop-negro text-white border-coop-negro' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>Acumulado</button>
          {aniosDisponibles.map((y) => (
            <button key={y} onClick={() => setPeriodo(y)} className={`text-sm px-3 py-1.5 rounded-lg border ${periodo === y ? 'bg-coop-negro text-white border-coop-negro' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{y}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {periodo !== 'acumulado' && sinFechaCount > 0 && <span className="text-xs text-slate-400">{sinFechaCount} sin fecha</span>}
          <span className="text-xs text-slate-500">Por fecha de</span>
          <select value={dimFecha} onChange={(e) => setDimFecha(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
            <option value="contacto">Contacto inicial</option>
            <option value="presupuesto">Presupuesto</option>
            <option value="ganado">Ganado</option>
          </select>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3">
        {ETAPAS.filter((et) => et.id !== 'perdido' || mostrarPerdidos).map((et) => {
          const items = visibles(et.id);
          return (
            <div key={et.id} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (arrastrando) mover(arrastrando, et.id); setArrastrando(null); }} className={`${colColor(et.id)} rounded-xl p-2 flex-1 min-w-[170px] min-h-[200px]`}>
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-sm font-medium text-slate-700">{et.label}</span>
                <span className="text-xs text-slate-400">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((l) => (
                  <div key={l.id} draggable onDragStart={() => setArrastrando(l.id)} onDragEnd={() => setArrastrando(null)} onClick={() => editar(l)}
                    className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm cursor-pointer">
                    <p className="text-sm font-medium text-slate-800">{l.organizacion}</p>
                    {l.contactoNombre && <p className="text-xs text-slate-500">{l.contactoNombre}</p>}
                    {(l.productos || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {l.productos.map((p) => <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-coop-azul/10 text-coop-azul">{p}</span>)}
                      </div>
                    )}
                    {l.proximaAccion && (
                      <p className={`text-[11px] mt-1.5 ${leadIsOverdue(l) ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
                        {leadIsOverdue(l) ? '⚠ ' : ''}{l.proximaAccion}{l.proximaAccionFecha ? ` · ${dstr(l.proximaAccionFecha)}` : ''}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      {l.valorEstimadoUsd ? <span className="text-xs font-medium text-emerald-700">{fmtUSD(l.valorEstimadoUsd)}</span> : <span />}
                      {l.ownerId && <span className="text-[10px] text-slate-400">{ownerNombre(l.ownerId)}</span>}
                    </div>
                  </div>
                ))}
                {items.length === 0 && <p className="text-xs text-slate-400 px-2 py-3">—</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Accesos directos a los presupuestadores, sin lead (presupuesto suelto; el PDF se descarga desde la herramienta). */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500 mr-1">Presupuestar sin lead:</span>
        <button onClick={() => setPresupCtx({ tipo: 'reconecta', lead: null })} className="text-sm text-coop-azul border border-coop-azul/30 rounded-lg px-3 py-1.5 hover:bg-coop-azul/5">Reconecta</button>
        <button onClick={() => setPresupCtx({ tipo: 'agua', modo: 'presupuesto', lead: null })} className="text-sm text-coop-azul border border-coop-azul/30 rounded-lg px-3 py-1.5 hover:bg-coop-azul/5">+Agua</button>
        <button onClick={() => setPresupCtx({ tipo: 'coopcloud', lead: null })} className="text-sm text-coop-azul border border-coop-azul/30 rounded-lg px-3 py-1.5 hover:bg-coop-azul/5">CoopCloud</button>
      </div>

      {form && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setForm(null)}>
          <div className="bg-white rounded-xl w-full max-w-2xl p-5 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">{form.id ? 'Editar lead' : 'Nuevo lead'}</h3>
            </div>
            <div className="space-y-3">
              <Campo label="Organización"><Inp v={form.organizacion} on={(v) => up(setForm, 'organizacion', v)} /></Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Contacto"><Inp v={form.contactoNombre} on={(v) => up(setForm, 'contactoNombre', v)} /></Campo>
                <Campo label="Teléfono"><Inp v={form.telefono} on={(v) => up(setForm, 'telefono', v)} /></Campo>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Campo label="Email"><Inp v={form.email} on={(v) => up(setForm, 'email', v)} /></Campo>
                <Campo label="Ciudad"><Inp v={form.ciudad} on={(v) => up(setForm, 'ciudad', v)} /></Campo>
                <Campo label="1er contacto"><Inp type="date" v={form.fechaPrimerContacto} on={(v) => up(setForm, 'fechaPrimerContacto', v)} /></Campo>
              </div>
              <Campo label="Productos de interés">
                <div className="flex flex-wrap gap-2">
                  {PRODUCTOS.map((p) => (
                    <button key={p} type="button" onClick={() => toggleProducto(p)} className={`text-xs px-2.5 py-1 rounded-full border ${form.productos.includes(p) ? 'bg-coop-azul text-white border-coop-azul' : 'border-slate-300 text-slate-600'}`}>{p}</button>
                  ))}
                </div>
              </Campo>
              <div className="grid grid-cols-3 gap-3">
                <Campo label="Valor (US$)"><Inp type="number" v={form.valorEstimadoUsd} on={(v) => up(setForm, 'valorEstimadoUsd', v)} /></Campo>
                <Campo label="Equipos"><Inp type="number" v={form.cantidadEquipos} on={(v) => up(setForm, 'cantidadEquipos', v)} /></Campo>
                <Campo label="Etapa">
                  <select value={form.etapa} onChange={(e) => up(setForm, 'etapa', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                    {ETAPAS.map((et) => <option key={et.id} value={et.id}>{et.label}</option>)}
                  </select>
                </Campo>
              </div>
              <Campo label="Detalle de equipos"><Inp v={form.equiposDetalle} on={(v) => up(setForm, 'equiposDetalle', v)} /></Campo>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                <input type="checkbox" checked={!!form.esEvento} onChange={(e) => up(setForm, 'esEvento', e.target.checked)} className="rounded border-slate-300 text-coop-azul focus:ring-coop-azul" />
                Es un evento <span className="text-xs text-slate-400">(presentación; suma al objetivo de visibilidad de marca)</span>
              </label>
              <div className="grid grid-cols-3 gap-3">
                <Campo label="Fuente">
                  <select value={form.fuente} onChange={(e) => up(setForm, 'fuente', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">—</option>{FUENTES.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </Campo>
                {form.fuente === 'Otro' && <Campo label="Fuente (otra)"><Inp v={form.fuenteOtra} on={(v) => up(setForm, 'fuenteOtra', v)} /></Campo>}
                <Campo label="Responsable">
                  <select value={form.ownerId} onChange={(e) => up(setForm, 'ownerId', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">—</option>{responsables.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </Campo>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Próxima acción"><Inp v={form.proximaAccion} on={(v) => up(setForm, 'proximaAccion', v)} /></Campo>
                <Campo label="Fecha próxima acción"><Inp type="date" v={form.proximaAccionFecha} on={(v) => up(setForm, 'proximaAccionFecha', v)} /></Campo>
              </div>

              <details className="border border-slate-200 rounded-lg p-3">
                <summary className="text-sm text-slate-600 cursor-pointer">Presupuesto · trial · cierre</summary>
                {form.id && (() => {
                  const prods = form.productos || [];
                  const et = form.etapa;
                  const lead = leads.find((l) => l.id === form.id) || form;
                  const enProp = ['propuesta', 'negociacion', 'trial', 'ganado'].includes(et);
                  // Cada presupuestador aparece según el producto de interés, y recién cuando el lead avanzó de etapa.
                  const verReconecta = prods.includes('Reconecta') && enProp;
                  const verAguaRelev = prods.includes('+Agua') && ['visita_realizada', 'propuesta', 'negociacion', 'trial', 'ganado'].includes(et);
                  const verAguaPres = prods.includes('+Agua') && enProp;
                  const verCoop = prods.includes('CoopCloud');
                  const cls = 'text-sm text-coop-azul border border-coop-azul/30 rounded-lg px-3 py-1.5 hover:bg-coop-azul/5';
                  if (!(verReconecta || verAguaRelev || verAguaPres || verCoop)) {
                    return <p className="mt-3 text-xs text-slate-400">El presupuestador del producto aparece cuando el lead avanza a Propuesta (Visita realizada para el relevamiento +Agua).</p>;
                  }
                  return (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {verReconecta && <button onClick={() => setPresupCtx({ tipo: 'reconecta', lead })} className={cls}>Reconecta</button>}
                      {verAguaRelev && <button onClick={() => setPresupCtx({ tipo: 'agua', modo: 'relevamiento', lead })} className={cls}>Relevamiento +Agua</button>}
                      {verAguaPres && <button onClick={() => setPresupCtx({ tipo: 'agua', modo: 'presupuesto', lead })} className={cls}>Presupuesto +Agua</button>}
                      {verCoop && <button onClick={() => setPresupCtx({ tipo: 'coopcloud', lead })} className={cls}>CoopCloud</button>}
                    </div>
                  );
                })()}
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <Campo label="Presupuesto enviado"><Inp type="date" v={form.presupuestoEnviadoFecha} on={(v) => up(setForm, 'presupuestoEnviadoFecha', v)} /></Campo>
                  <Campo label="Presupuesto aprobado"><Inp type="date" v={form.presupuestoAprobadoFecha} on={(v) => up(setForm, 'presupuestoAprobadoFecha', v)} /></Campo>
                  <Campo label="Link del presupuesto"><Inp v={form.presupuestoLink} on={(v) => up(setForm, 'presupuestoLink', v)} /></Campo>
                  <Campo label="Vence trial"><Inp type="date" v={form.trialVence} on={(v) => up(setForm, 'trialVence', v)} /></Campo>
                  <Campo label="Notas de trial"><Inp v={form.trialNotas} on={(v) => up(setForm, 'trialNotas', v)} /></Campo>
                  <Campo label="Monto facturado (US$)"><Inp type="number" v={form.montoFacturadoUsd} on={(v) => up(setForm, 'montoFacturadoUsd', v)} /></Campo>
                </div>
                {form.etapa === 'perdido' && <Campo label="Motivo de pérdida"><Inp v={form.motivoPerdido} on={(v) => up(setForm, 'motivoPerdido', v)} /></Campo>}
              </details>

              <Campo label="Notas">
                <textarea value={form.notas} onChange={(e) => up(setForm, 'notas', e.target.value)} rows="2" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              </Campo>

              {form.id && (
                <div className="border-t border-slate-100 pt-3">
                  <label className="block text-sm text-slate-600 mb-2">Actividad reciente</label>
                  <div className="flex flex-wrap items-end gap-2 mb-2">
                    <select value={actForm.tipo} onChange={(e) => setActForm((a) => ({ ...a, tipo: e.target.value }))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                      {TIPOS_ACT.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                    </select>
                    <input type="date" value={actForm.fecha} onChange={(e) => setActForm((a) => ({ ...a, fecha: e.target.value }))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                    <input value={actForm.notas} onChange={(e) => setActForm((a) => ({ ...a, notas: e.target.value }))} placeholder="Notas" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-32" />
                    <button onClick={agregarActividad} className="text-sm bg-coop-azul text-white px-3 py-1.5 rounded-lg hover:opacity-90">Registrar</button>
                  </div>
                  {actividades.length === 0 ? <p className="text-xs text-slate-400">Sin actividades.</p> : (
                    <ul className="text-sm divide-y divide-slate-100">
                      {actividades.map((a) => (
                        <li key={a.id} className="py-1.5 flex gap-2">
                          <span className="text-slate-400 w-24 font-mono text-xs">{dstr(a.fecha)}</span>
                          <span className="capitalize text-slate-600 w-24">{a.tipo}</span>
                          <span className="text-slate-500 flex-1">{a.notas || '—'}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 mt-5">
              {form.id ? <button onClick={() => eliminar(form)} className="text-sm text-red-500 hover:underline">Eliminar</button> : <span />}
              <div className="flex gap-2">
                <button onClick={() => setForm(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                <button onClick={guardar} className="px-4 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90">Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {ganarCtx && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setGanarCtx(null)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-1">Ganar lead</h3>
            <p className="text-sm text-slate-500 mb-4">{ganarCtx.lead.organizacion} · se creará el proyecto en el Kanban</p>
            {ganarCtx.aplicables.length === 0 ? (
              <p className="text-sm text-slate-600">No hay plantillas para los productos de este lead. Se creará el proyecto sin tareas.</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Plantillas a generar</label>
                  <div className="space-y-1.5">
                    {ganarCtx.aplicables.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={ganarCtx.sel.includes(p.id)} onChange={() => toggleSel(p.id)} /> {p.nombre} <span className="text-slate-400">({p.producto})</span>
                      </label>
                    ))}
                  </div>
                </div>
                <Campo label="Cantidad de equipos (para las etapas por equipo)">
                  <input type="number" min="1" value={ganarCtx.nEquipos} onChange={(e) => setGanarCtx((g) => ({ ...g, nEquipos: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </Campo>
                <p className="text-xs text-slate-500">Se crearán <strong>{contarTarjetas(ganarCtx)}</strong> tarjetas en el backlog (las "por equipo" con {Math.max(1, Number(ganarCtx.nEquipos) || 1)} unidades cada una).</p>
              </div>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setGanarCtx(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
              <button onClick={confirmarGanar} className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:opacity-90">Ganar y crear proyecto</button>
            </div>
          </div>
        </div>
      )}
      <PresupuestadorReconecta
        open={presupCtx?.tipo === 'reconecta'}
        lead={presupCtx?.lead}
        estadoInicial={presupCtx?.lead?.presupuestoEstado}
        onAutoSave={(estado) => guardarEstado('presupuestoEstado', estado)}
        onPdfDescargado={(totales, estado) => guardarEstado('presupuestoEstado', estado, valorDeTotales(totales))}
        onClose={() => setPresupCtx(null)}
      />
      <AguaModal
        open={presupCtx?.tipo === 'agua'}
        lead={presupCtx?.lead}
        modo={presupCtx?.modo}
        estadoInicial={presupCtx?.lead?.presupuestoAguaEstado}
        onAutoSave={(snap) => guardarEstado('presupuestoAguaEstado', snap)}
        onFinalizarRelevamiento={(snap) => guardarEstado('presupuestoAguaEstado', snap)}
        onPdfDescargado={(snap, totales) => guardarEstado('presupuestoAguaEstado', snap, valorDeTotales(totales))}
        onClose={() => setPresupCtx(null)}
      />
      <CoopCloudModal
        open={presupCtx?.tipo === 'coopcloud'}
        lead={presupCtx?.lead}
        estadoInicial={presupCtx?.lead?.coopcloudEstado}
        onAutoSave={(estado) => guardarEstado('coopcloudEstado', estado)}
        onPdfDescargado={(estado, totales) => guardarEstado('coopcloudEstado', estado, totales?.costoMensual != null ? { coopcloudCostoMensual: Number(totales.costoMensual) } : {})}
        onClose={() => setPresupCtx(null)}
      />
      <ImportarLeads open={importOpen} onClose={() => setImportOpen(false)} onDone={cargar} />
      <CRMMetricas open={showMetricas} leads={leadsBase} periodo={periodo} onClose={() => setShowMetricas(false)} />
    </div>
  );
}
const up = (set, k, v) => set((f) => ({ ...f, [k]: v }));
function Campo({ label, children }) { return <div><label className="block text-sm text-slate-600 mb-1">{label}</label>{children}</div>; }
function Inp({ v, on, type = 'text' }) { return <input type={type} value={v} onChange={(e) => on(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />; }
