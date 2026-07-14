import { useEffect, useState, useCallback, useMemo } from 'react';
import { useData } from '../data/DataContext.jsx';
import { buildVideollamadaICS, descargarICS, mailtoVideollamada } from './videollamadaUtils.js';
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
const FUENTES = ['Referido', 'Evento', 'Web', 'Pauta Paga', 'Llamada en frío', 'Recomendación', 'Otro'];
// Catálogo de próximas acciones (pedido de Carola). "Otra" habilita texto libre.
const PROX_ACCIONES = [
  'Llamar / contactar', 'Enviar información', 'Agendar visita', 'Agendar videollamada',
  'Enviar presupuesto', 'Seguimiento de propuesta', 'Coordinar inicio de trial',
  'Seguimiento de trial', 'Esperar orden de compra / firma',
];
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
// Búsqueda insensible a mayúsculas y acentos sobre organización, contacto y ciudad.
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const coincideBusqueda = (l, q) => {
  const n = norm(q).trim();
  if (!n) return true;
  return [l.organizacion, l.contactoNombre, l.ciudad].some((c) => norm(c).includes(n));
};

export default function CRM() {
  const { api, colaboradores, me } = useData();
  const [leads, setLeads] = useState([]);
  const [importOpen, setImportOpen] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(null);
  const [actividades, setActividades] = useState([]);
  const [tareasLead, setTareasLead] = useState([]);
  const [nuevaTarea, setNuevaTarea] = useState({ texto: '', fechaLimite: '' });
  const [completando, setCompletando] = useState(null); // { tareaId, resultado }
  const [actForm, setActForm] = useState({ tipo: 'visita', fecha: hoy(), notas: '' });
  const [arrastrando, setArrastrando] = useState(null);
  const [ganarCtx, setGanarCtx] = useState(null);
  const [filtroOwner, setFiltroOwner] = useState('');
  const [busqueda, setBusqueda] = useState('');
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
  // Datos de facturación: viven en el Cliente, no en el lead. `fact` refleja la
  // ficha (prellenada al abrir); `factOpen` es el tilde que despliega los campos.
  // Videollamada (ola 1): ctx = { paso: 'form'|'listo', fecha, horaInicio, horaFin, ids, notas, ics }
  const [vcCtx, setVcCtx] = useState(null);
  const factVacia = { razonSocial: '', cuit: '', direccion: '', localidad: '', ciudad: '', celular: '', emailFacturacion: '' };
  const [fact, setFact] = useState(factVacia);
  const [factOpen, setFactOpen] = useState(false);

  const cargarFacturacion = async (leadId) => {
    setFact(factVacia); setFactOpen(false);
    if (!leadId) return;
    try {
      const r = await api.leads.facturacion(leadId);
      const c = r?.cliente;
      if (c) {
        const f = {};
        for (const k of Object.keys(factVacia)) f[k] = c[k] || '';
        setFact(f);
        if (Object.values(f).some(Boolean)) setFactOpen(true); // ya tiene datos: mostrar
      }
    } catch { /* sin ficha todavía */ }
  };
  const factPayload = () => Object.fromEntries(Object.entries(fact).map(([k, v]) => [k, v.trim()]));
  const factCompleta = () => fact.razonSocial.trim() && fact.cuit.trim();

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
    // Facturación: obligatoria en el hand-off. Precargamos la ficha si existe.
    let gFact = { razonSocial: '', cuit: '', direccion: '', localidad: '', ciudad: '', celular: '', emailFacturacion: '' };
    try {
      const r = await api.leads.facturacion(lead.id);
      if (r?.cliente) for (const k of Object.keys(gFact)) gFact[k] = r.cliente[k] || '';
    } catch { /* sin ficha todavía */ }
    setGanarCtx({ lead, aplicables, sel: aplicables.map((p) => p.id), nEquipos: lead.cantidadEquipos || 1, fact: gFact });
  };
  const toggleSel = (id) => setGanarCtx((g) => ({ ...g, sel: g.sel.includes(id) ? g.sel.filter((x) => x !== id) : [...g.sel, id] }));
  // Cada etapa = 1 tarjeta (las "por_equipo" llevan N unidades adentro).
  const contarTarjetas = (g) => g.aplicables.filter((p) => g.sel.includes(p.id)).reduce((n, p) => n + (p.etapas || []).length, 0);
  const confirmarGanar = async () => {
    const g = ganarCtx;
    if (!g.fact.razonSocial.trim() || !g.fact.cuit.trim()) {
      alert('Completá al menos Razón Social y CUIT para facturar antes de ganar el lead.');
      return;
    }
    try {
      await api.leads.setFacturacion(g.lead.id, Object.fromEntries(Object.entries(g.fact).map(([k, v]) => [k, v.trim()])));
      await api.leads.ganar(g.lead.id, { plantillas: g.sel, cantidadEquipos: Number(g.nEquipos) || 1 });
      setGanarCtx(null); await cargar();
    }
    catch (e) { alert('No se pudo ganar el lead: ' + (e.message || '')); }
  };
  const upGanarFact = (k, v) => setGanarCtx((g) => ({ ...g, fact: { ...g.fact, [k]: v } }));

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
      let leadId = form.id;
      if (form.id) await api.leads.update(form.id, payload);
      else { const creado = await api.leads.create(payload); leadId = creado?.id; }
      if (factOpen && leadId && Object.values(fact).some((v) => v.trim())) {
        await api.leads.setFacturacion(leadId, factPayload());
      }
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
    cargarFacturacion(l.id);
    setTareasLead([]); setNuevaTarea({ texto: '', fechaLimite: '' }); setCompletando(null);
    if (l.id) {
      try { const a = await api.leads.actividades(l.id); setActividades(a.data || a || []); } catch { /* ignore */ }
      try { const t = await api.leads.tareas(l.id); setTareasLead(t.tareas || []); } catch { /* ignore */ }
    }
  };

  const recargarTareasLead = async () => {
    try { const t = await api.leads.tareas(form.id); setTareasLead(t.tareas || []); } catch { /* ignore */ }
  };
  const agregarTarea = async () => {
    const texto = nuevaTarea.texto.trim();
    if (!texto || !form?.id) return;
    try {
      await api.leads.addTarea(form.id, { texto, fechaLimite: nuevaTarea.fechaLimite || null });
      setNuevaTarea({ texto: '', fechaLimite: '' });
      await recargarTareasLead();
    } catch (e) { alert('No se pudo agregar: ' + (e.message || '')); }
  };
  const completarTarea = async (tareaId, resultado) => {
    try {
      await api.leads.setTarea(form.id, tareaId, { done: true, resultado: resultado?.trim() || null });
      setCompletando(null);
      await recargarTareasLead();
    } catch (e) { alert('No se pudo completar: ' + (e.message || '')); }
  };
  const reabrirTarea = async (tareaId) => {
    try { await api.leads.setTarea(form.id, tareaId, { done: false }); await recargarTareasLead(); }
    catch (e) { alert('No se pudo reabrir: ' + (e.message || '')); }
  };
  const borrarTarea = async (tareaId) => {
    if (!window.confirm('¿Eliminar esta tarea?')) return;
    try { await api.leads.delTarea(form.id, tareaId); await recargarTareasLead(); }
    catch (e) { alert('No se pudo eliminar: ' + (e.message || '')); }
  };

  const abrirVideollamada = () => {
    if (!form?.id) { alert('Guardá el lead primero'); return; }
    setVcCtx({
      paso: 'form', fecha: hoy(), horaInicio: '10:00', horaFin: '11:00',
      ids: form.ownerId ? [Number(form.ownerId)] : [], notas: '',
    });
  };
  const toggleVcColab = (id) => setVcCtx((c) => ({
    ...c, ids: c.ids.includes(id) ? c.ids.filter((x) => x !== id) : [...c.ids, id],
  }));
  const confirmarVideollamada = async () => {
    const c = vcCtx;
    if (!c.fecha || !c.horaInicio || !c.horaFin) { alert('Completá fecha y horario'); return; }
    if (c.horaFin <= c.horaInicio) { alert('La hora de fin debe ser posterior a la de inicio'); return; }
    if (!c.ids.length) { alert('Seleccioná al menos un colaborador involucrado'); return; }
    try {
      const r = await api.leads.videollamada(form.id, {
        fecha: c.fecha, horaInicio: c.horaInicio, horaFin: c.horaFin,
        colaboradoresIds: c.ids, notas: c.notas || null,
      });
      const emailsColaboradores = c.ids
        .map((id) => (colaboradores.find((x) => x.id === id) || {}).email).filter(Boolean);
      const ics = buildVideollamadaICS({
        organizacion: form.organizacion, fecha: c.fecha, horaInicio: c.horaInicio,
        horaFin: c.horaFin, notas: c.notas, emailLead: form.email, emailsColaboradores,
      });
      setVcCtx({ ...c, paso: 'listo', ics, modo: r.modo, joinUrl: r.joinUrl, graphError: r.graphError });
      // Refrescar el panel de actividades del lead
      try { const a = await api.leads.actividades(form.id); setActividades(a.data || a || []); } catch { /* ignore */ }
    } catch (e) { alert('No se pudo agendar: ' + (e.message || '')); }
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
  const visibles = (etId) => leadsBase.filter((l) => l.etapa === etId
    && (!filtroOwner || l.ownerId === Number(filtroOwner))
    && coincideBusqueda(l, busqueda));

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-coop-negro">CRM · Embudo comercial</h2>
          <p className="text-sm text-slate-500">Pipeline activo: <span className="font-mono text-emerald-700">{fmtUSD(pipeline)}</span></p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar organización, contacto o ciudad…"
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-64
                       focus:outline-none focus:ring-2 focus:ring-coop-azul/40 focus:border-coop-azul" />
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
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {periodo !== 'acumulado' && sinFechaCount > 0 && <span className="text-xs text-slate-400">{sinFechaCount} sin fecha</span>}
          <span className="text-xs text-slate-500">Por fecha de</span>
          <select value={dimFecha} onChange={(e) => setDimFecha(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
            <option value="contacto">Contacto inicial</option>
            <option value="presupuesto">Presupuesto</option>
            <option value="ganado">Ganado</option>
          </select>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3 snap-x snap-mandatory">
        {ETAPAS.filter((et) => et.id !== 'perdido' || mostrarPerdidos).map((et) => {
          const items = visibles(et.id);
          return (
            <div key={et.id} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (arrastrando) mover(arrastrando, et.id); setArrastrando(null); }} className={`${colColor(et.id)} rounded-xl p-2 flex-1 min-w-[170px] min-h-[200px] snap-start`}>
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
                    {(() => {
                      const pend = l.tareasSeguimiento || [];
                      if (!pend.length) return null;
                      const h = hoy();
                      const vencidas = pend.filter((t) => t.fechaLimite && String(t.fechaLimite).slice(0, 10) < h).length;
                      return (
                        <p className={`text-[11px] mt-1 ${vencidas ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
                          ⏱ {vencidas
                            ? `${vencidas} tarea${vencidas > 1 ? 's' : ''} vencida${vencidas > 1 ? 's' : ''}`
                            : `${pend.length} tarea${pend.length > 1 ? 's' : ''} pendiente${pend.length > 1 ? 's' : ''}`}
                        </p>
                      );
                    })()}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Campo label="Contacto"><Inp v={form.contactoNombre} on={(v) => up(setForm, 'contactoNombre', v)} /></Campo>
                <Campo label="Teléfono"><Inp v={form.telefono} on={(v) => up(setForm, 'telefono', v)} /></Campo>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Campo label="Próxima acción">
                  {/* Catálogo + "Otra" libre. Los valores históricos que no están en el
                      catálogo se muestran como "Otra" con su texto intacto. */}
                  <select
                    value={form.paOtra ? '__otra' : (form.proximaAccion === '' ? '' : (PROX_ACCIONES.includes(form.proximaAccion) ? form.proximaAccion : '__otra'))}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '__otra') { up(setForm, 'paOtra', true); up(setForm, 'proximaAccion', ''); }
                      else { up(setForm, 'paOtra', false); up(setForm, 'proximaAccion', v); }
                    }}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">—</option>
                    {PROX_ACCIONES.map((a) => <option key={a} value={a}>{a}</option>)}
                    <option value="__otra">Otra…</option>
                  </select>
                </Campo>
                <Campo label="Fecha próxima acción"><Inp type="date" v={form.proximaAccionFecha} on={(v) => up(setForm, 'proximaAccionFecha', v)} /></Campo>
              </div>
              {(form.paOtra || (form.proximaAccion && !PROX_ACCIONES.includes(form.proximaAccion))) && (
                <Campo label="Próxima acción (otra)"><Inp v={form.proximaAccion} on={(v) => up(setForm, 'proximaAccion', v)} /></Campo>
              )}

              <div className="border border-slate-200 rounded-lg p-3">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                  <input type="checkbox" checked={factOpen} onChange={(e) => setFactOpen(e.target.checked)}
                    className="rounded border-slate-300 text-coop-azul focus:ring-coop-azul" />
                  Cargar datos de facturación
                  <span className="text-xs text-slate-400">(se guardan en la ficha del Cliente; obligatorios al ganar)</span>
                </label>
                {factOpen && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    <Campo label="Razón Social"><Inp v={fact.razonSocial} on={(v) => up(setFact, 'razonSocial', v)} /></Campo>
                    <Campo label="CUIT"><Inp v={fact.cuit} on={(v) => up(setFact, 'cuit', v)} /></Campo>
                    <Campo label="Dirección"><Inp v={fact.direccion} on={(v) => up(setFact, 'direccion', v)} /></Campo>
                    <Campo label="Localidad"><Inp v={fact.localidad} on={(v) => up(setFact, 'localidad', v)} /></Campo>
                    <Campo label="Ciudad"><Inp v={fact.ciudad} on={(v) => up(setFact, 'ciudad', v)} /></Campo>
                    <Campo label="Celular"><Inp v={fact.celular} on={(v) => up(setFact, 'celular', v)} /></Campo>
                    <Campo label="Mail de facturación"><Inp v={fact.emailFacturacion} on={(v) => up(setFact, 'emailFacturacion', v)} /></Campo>
                  </div>
                )}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
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
                  {form.id && (
                    <div className="mb-4">
                      <label className="block text-sm text-slate-600 mb-2">Tareas de seguimiento</label>
                      <div className="space-y-1.5">
                        {tareasLead.map((t) => {
                          const hoyISO = new Date().toISOString().slice(0, 10);
                          const fl = t.fechaLimite ? String(t.fechaLimite).slice(0, 10) : null;
                          const vencida = !t.done && fl && fl < hoyISO;
                          const diasVencida = vencida ? Math.round((new Date(hoyISO) - new Date(fl)) / 86400000) : 0;
                          return (
                            <div key={t.id} className={`rounded-lg border px-3 py-2 text-sm ${
                              t.done ? 'border-slate-100 bg-slate-50' : vencida ? 'border-red-300 bg-red-50/50' : 'border-slate-200 bg-white'
                            }`}>
                              <div className="flex items-start gap-2">
                                <button type="button"
                                  onClick={() => t.done ? reabrirTarea(t.id) : setCompletando({ tareaId: t.id, resultado: '' })}
                                  title={t.done ? 'Reabrir' : 'Completar'}
                                  className={`mt-0.5 w-4 h-4 shrink-0 rounded-full border-2 flex items-center justify-center text-[10px] leading-none ${
                                    t.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-500 text-transparent hover:text-emerald-500'
                                  }`}>✓</button>
                                <div className="flex-1 min-w-0">
                                  <span className={`break-words ${t.done ? 'line-through text-slate-400' : 'text-slate-700'}`}>{t.texto}</span>
                                  <span className="ml-2 text-xs whitespace-nowrap">
                                    {fl && !t.done && (
                                      <span className={vencida ? 'text-red-600 font-medium' : 'text-slate-400'}>
                                        {fl.split('-').reverse().join('/')}{vencida ? ` (${diasVencida} día${diasVencida > 1 ? 's' : ''})` : ''}
                                      </span>
                                    )}
                                  </span>
                                  {t.done && t.resultado && <p className="text-xs text-slate-500 mt-0.5">{t.resultado}</p>}
                                </div>
                                <button type="button" onClick={() => borrarTarea(t.id)}
                                  className="text-slate-300 hover:text-red-500 shrink-0">×</button>
                              </div>
                              {completando?.tareaId === t.id && !t.done && (
                                <div className="flex gap-2 mt-2 ml-6">
                                  <input autoFocus value={completando.resultado}
                                    onChange={(e) => setCompletando({ ...completando, resultado: e.target.value })}
                                    onKeyDown={(e) => { if (e.key === 'Enter') completarTarea(t.id, completando.resultado); if (e.key === 'Escape') setCompletando(null); }}
                                    placeholder="Agregar resultado (opcional)"
                                    className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1 text-xs" />
                                  <button type="button" onClick={() => completarTarea(t.id, completando.resultado)}
                                    className="text-xs bg-emerald-600 text-white px-3 py-1 rounded-lg hover:opacity-90">Completar</button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <input value={nuevaTarea.texto}
                          onChange={(e) => setNuevaTarea({ ...nuevaTarea, texto: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') agregarTarea(); }}
                          placeholder="Nueva tarea (ej. Seguimiento: pasar relevamiento…)"
                          className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
                        <input type="date" value={nuevaTarea.fechaLimite}
                          onChange={(e) => setNuevaTarea({ ...nuevaTarea, fechaLimite: e.target.value })}
                          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                        <button type="button" onClick={agregarTarea} disabled={!nuevaTarea.texto.trim()}
                          className="text-sm bg-coop-azul text-white px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-40">Agregar</button>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm text-slate-600">Actividad reciente</label>
                    <button onClick={abrirVideollamada}
                      className="text-sm border border-coop-azul text-coop-azul px-3 py-1.5 rounded-lg hover:bg-coop-azul hover:text-white transition-colors">
                      Agendar videollamada
                    </button>
                  </div>
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
              {form.id && me?.tipo === 'manager'
                ? <button onClick={() => eliminar(form)} className="text-sm text-red-500 hover:underline">Eliminar</button>
                : <span />}
              <div className="flex gap-2">
                <button onClick={() => setForm(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                <button onClick={guardar} className="px-4 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90">Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {vcCtx && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setVcCtx(null)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            {vcCtx.paso === 'form' ? (
              <>
                <h3 className="font-semibold mb-1">Agendar videollamada</h3>
                <p className="text-sm text-slate-500 mb-4">{form?.organizacion} · impacta en la grilla de los involucrados y registra la actividad</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Campo label="Fecha"><Inp type="date" v={vcCtx.fecha} on={(v) => setVcCtx((c) => ({ ...c, fecha: v }))} /></Campo>
                    <Campo label="Desde"><Inp type="time" v={vcCtx.horaInicio} on={(v) => setVcCtx((c) => ({ ...c, horaInicio: v }))} /></Campo>
                    <Campo label="Hasta"><Inp type="time" v={vcCtx.horaFin} on={(v) => setVcCtx((c) => ({ ...c, horaFin: v }))} /></Campo>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-600 mb-1">Colaboradores involucrados</label>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2">
                      {colaboradores.filter((c) => isActiveCollab(c) && c.tipo !== 'tercerizado').map((c) => (
                        <label key={c.id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={vcCtx.ids.includes(c.id)} onChange={() => toggleVcColab(c.id)} /> {c.nombre}
                        </label>
                      ))}
                    </div>
                  </div>
                  <Campo label="Notas (van en la invitación)"><Inp v={vcCtx.notas} on={(v) => setVcCtx((c) => ({ ...c, notas: v }))} /></Campo>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setVcCtx(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                  <button onClick={confirmarVideollamada} className="px-4 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90">Agendar</button>
                </div>
              </>
            ) : (
              <>
                <h3 className="font-semibold mb-1">Videollamada agendada</h3>
                {vcCtx.modo === 'graph' ? (
                  <>
                    <p className="text-sm text-slate-600 mb-4">
                      Evento creado en el Outlook de la casilla comercial con reunión de Teams.
                      Las invitaciones salieron automáticamente{form?.email ? <> a <span className="font-medium">{form.email}</span></> : ''} y a los {vcCtx.ids.length} colaborador{vcCtx.ids.length > 1 ? 'es' : ''} involucrado{vcCtx.ids.length > 1 ? 's' : ''}. También quedó el ítem en sus grillas y la actividad registrada.
                    </p>
                    {vcCtx.joinUrl && (
                      <a href={vcCtx.joinUrl} target="_blank" rel="noreferrer"
                        className="block w-full text-center text-sm bg-coop-azul text-white px-3 py-2 rounded-lg hover:opacity-90 mb-2">
                        Abrir reunión de Teams
                      </a>
                    )}
                    <div className="flex justify-end mt-4">
                      <button onClick={() => setVcCtx(null)} className="px-4 py-2 text-sm bg-coop-negro text-white rounded-lg hover:opacity-90">Listo</button>
                    </div>
                  </>
                ) : (
                <>
                {vcCtx.graphError && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">
                    No se pudo crear el evento en Outlook ({vcCtx.graphError}). Seguí con el envío manual:
                  </p>
                )}
                <p className="text-sm text-slate-600 mb-4">
                  Quedó registrada la actividad y el ítem en la grilla de {vcCtx.ids.length} colaborador{vcCtx.ids.length > 1 ? 'es' : ''}.
                  Para invitar al cliente: descargá la invitación, abrí el borrador de mail y adjuntala.
                </p>
                <div className="space-y-2">
                  <button
                    onClick={() => descargarICS(vcCtx.ics, `videollamada_${form?.organizacion?.replace(/\s+/g, '_') || 'lead'}_${vcCtx.fecha}.ics`)}
                    className="w-full text-sm border border-coop-azul text-coop-azul px-3 py-2 rounded-lg hover:bg-coop-azul hover:text-white transition-colors">
                    1 · Descargar invitación (.ics)
                  </button>
                  <a
                    href={mailtoVideollamada({ emailLead: form?.email, organizacion: form?.organizacion, contactoNombre: form?.contactoNombre, fecha: vcCtx.fecha, horaInicio: vcCtx.horaInicio, horaFin: vcCtx.horaFin, notas: vcCtx.notas })}
                    className="block w-full text-center text-sm border border-slate-300 text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-50">
                    2 · Abrir borrador de mail {form?.email ? `(a ${form.email})` : '(sin mail cargado)'}
                  </a>
                </div>
                {!vcCtx.graphError && (
                  <p className="text-[11px] text-slate-400 mt-3">Cuando el administrador habilite la integración con Outlook, este paso será automático (evento + Teams + invitaciones).</p>
                )}
                <div className="flex justify-end mt-4">
                  <button onClick={() => setVcCtx(null)} className="px-4 py-2 text-sm bg-coop-negro text-white rounded-lg hover:opacity-90">Listo</button>
                </div>
                </>
                )}
              </>
            )}
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
            <div className="mt-4 border-t border-slate-200 pt-3">
              <p className="text-sm font-medium text-slate-700 mb-2">Datos de facturación <span className="text-xs font-normal text-slate-400">(se guardan en la ficha del Cliente)</span></p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Campo label="Razón Social *"><Inp v={ganarCtx.fact.razonSocial} on={(v) => upGanarFact('razonSocial', v)} /></Campo>
                <Campo label="CUIT *"><Inp v={ganarCtx.fact.cuit} on={(v) => upGanarFact('cuit', v)} /></Campo>
                <Campo label="Dirección"><Inp v={ganarCtx.fact.direccion} on={(v) => upGanarFact('direccion', v)} /></Campo>
                <Campo label="Localidad"><Inp v={ganarCtx.fact.localidad} on={(v) => upGanarFact('localidad', v)} /></Campo>
                <Campo label="Ciudad"><Inp v={ganarCtx.fact.ciudad} on={(v) => upGanarFact('ciudad', v)} /></Campo>
                <Campo label="Celular"><Inp v={ganarCtx.fact.celular} on={(v) => upGanarFact('celular', v)} /></Campo>
                <Campo label="Mail de facturación"><Inp v={ganarCtx.fact.emailFacturacion} on={(v) => upGanarFact('emailFacturacion', v)} /></Campo>
              </div>
            </div>
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
