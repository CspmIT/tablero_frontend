// "Mis Deseos" — pedidos de desarrollo/mejora, de cualquier colaborador de la
// cooperativa. Dos caras: el solicitante crea/edita/envía y ve la respuesta;
// el manager revisa todo, responde (obligatoria al rechazar o pedir cambios)
// y aprueba, lo que crea la card en el backlog del kanban con trazabilidad.
import { useEffect, useState, useCallback } from 'react';
import { Lightbulb, Send, Pencil, Trash2 } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';

const ESTADOS = {
  borrador: { label: 'Borrador', cls: 'bg-slate-100 text-slate-600' },
  enviado: { label: 'Enviado', cls: 'bg-blue-100 text-blue-700' },
  en_revision: { label: 'En revisión', cls: 'bg-amber-100 text-amber-700' },
  aprobado: { label: 'Aprobado', cls: 'bg-emerald-100 text-emerald-700' },
  rechazado: { label: 'Rechazado', cls: 'bg-red-100 text-red-700' },
  requiere_cambios: { label: 'Requiere cambios', cls: 'bg-orange-100 text-orange-700' },
};

const dstr = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');

export default function Deseos({ embebido = false }) { // embebido: dentro del Inbox (20/08) — sin título propio
  const { api, me } = useData();
  const esManager = me?.tipo === 'manager';
  const [proyectos, setProyectos] = useState([]);
  useEffect(() => {
    if (!esManager) return;
    api.proyectos.list().then((r) => setProyectos(r.data || r || [])).catch(() => {});
  }, [api, esManager]);
  const [vista, setVista] = useState('mios'); // manager alterna: mios | todos
  const [deseos, setDeseos] = useState(null);
  const [form, setForm] = useState(null);      // null | { id?, titulo, descripcion, fechaNecesidad }
  const [gestion, setGestion] = useState(null); // manager: deseo en gestión

  const cargar = useCallback(async () => {
    try {
      const r = await api.deseos.list(esManager && vista === 'todos');
      setDeseos(r.deseos || []);
    } catch { setDeseos([]); }
  }, [api, esManager, vista]);
  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (enviar) => {
    const body = {
      titulo: form.titulo, descripcion: form.descripcion,
      fechaNecesidad: form.fechaNecesidad || null, enviar,
    };
    try {
      if (form.id) await api.deseos.update(form.id, body);
      else await api.deseos.create(body);
      setForm(null); await cargar();
    } catch (e) { alert(e.message || 'No se pudo guardar'); }
  };

  const borrar = async (d) => {
    if (!window.confirm(`¿Borrar el borrador "${d.titulo}"?`)) return;
    try { await api.deseos.del(d.id); await cargar(); }
    catch (e) { alert(e.message || 'No se pudo borrar'); }
  };

  const lista = deseos || [];

  return (
    <div className={embebido ? 'max-w-4xl' : 'p-4 max-w-4xl mx-auto'}>
      <div className="flex items-center justify-between mb-1">
        {!embebido && (
          <h2 className="text-xl font-semibold text-coop-negro flex items-center gap-2">
            <Lightbulb size={20} className="text-coop-naranja" /> Mis deseos
          </h2>
        )}
        {embebido && <span />}
        <div className="flex items-center gap-2">
          {esManager && (
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
              {['mios', 'todos'].map((v) => (
                <button key={v} onClick={() => setVista(v)}
                  className={`px-3 py-1.5 ${vista === v ? 'bg-coop-azul text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                  {v === 'mios' ? 'Míos' : 'Todos'}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => setForm({ titulo: '', descripcion: '', fechaNecesidad: '' })}
            className="bg-coop-naranja text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90">+ Nuevo deseo</button>
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Pedí un desarrollo nuevo o una mejora de algo existente. Contá qué necesitás y
        para qué te serviría: se revisa, recibís una respuesta y, si se aprueba, pasa
        al backlog de desarrollo.
      </p>

      {lista.length === 0 && deseos !== null && (
        <div className="text-center text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl p-8">
          Sin deseos todavía. El primero es gratis: ¿qué te haría más fácil el trabajo?
        </div>
      )}

      <div className="space-y-2">
        {lista.map((d) => {
          const est = ESTADOS[d.estado] || ESTADOS.borrador;
          const esMio = Number(d.solicitanteId) === Number(me?.colaboradorId ?? me?.id); // /auth/me trae colaboradorId, no id (fix 10/08)
          const editable = esMio && ['borrador', 'requiere_cambios'].includes(d.estado);
          return (
            <div key={d.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-800 break-words">{d.titulo}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${est.cls}`}>{est.label}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {vista === 'todos' ? `${d.solicitante} · ` : ''}solicitado el {dstr(d.createdAt)}
                    {d.fechaNecesidad ? ` · lo necesitaría para ${dstr(d.fechaNecesidad)}` : ''}
                  </p>
                  <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap break-words">{d.descripcion}</p>
                  {d.respuesta && (
                    <div className="mt-2 text-sm bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                      <p className="text-xs text-slate-400 mb-0.5">Respuesta{d.respondidoPor ? ` de ${d.respondidoPor}` : ''}{d.respondidoAt ? ` · ${dstr(d.respondidoAt)}` : ''}</p>
                      <p className="text-slate-700 whitespace-pre-wrap">{d.respuesta}</p>
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {editable && (
                    <button onClick={() => setForm({ id: d.id, titulo: d.titulo, descripcion: d.descripcion, fechaNecesidad: d.fechaNecesidad ? String(d.fechaNecesidad).slice(0, 10) : '' })}
                      className="text-slate-400 hover:text-coop-azul" title="Editar"><Pencil size={16} /></button>
                  )}
                  {esMio && d.estado === 'borrador' && (
                    <button onClick={() => borrar(d)} className="text-slate-300 hover:text-red-500" title="Borrar borrador"><Trash2 size={16} /></button>
                  )}
                  {esManager && !esMio && ['enviado', 'en_revision'].includes(d.estado) && (
                    <button onClick={() => setGestion({ deseo: d, respuesta: d.respuesta || '', proyectoId: '' })}
                      className="text-xs bg-coop-azul text-white px-3 py-1.5 rounded-lg hover:opacity-90">Gestionar</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {form && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onMouseDown={(e) => e.target === e.currentTarget && (setForm(null))}>
          <div className="bg-white rounded-xl w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-3">{form.id ? 'Editar deseo' : 'Nuevo deseo'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Título</label>
                <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  placeholder="Ej: Poder exportar la grilla a Excel"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">¿Qué necesitás y para qué te serviría?</label>
                <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  rows={5} placeholder="Contalo con tus palabras: qué problema tenés hoy, cómo lo resolvés actualmente y qué te gustaría que haga el sistema."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">¿Para cuándo lo necesitarías? (estimado, opcional)</label>
                <input type="date" value={form.fechaNecesidad} onChange={(e) => setForm({ ...form, fechaNecesidad: e.target.value })}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setForm(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
              <button onClick={() => guardar(false)} disabled={!form.titulo.trim() || !form.descripcion.trim()}
                className="px-4 py-2 text-sm border border-coop-azul text-coop-azul rounded-lg hover:bg-coop-azul/5 disabled:opacity-40">Guardar borrador</button>
              <button onClick={() => guardar(true)} disabled={!form.titulo.trim() || !form.descripcion.trim()}
                className="px-4 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5">
                <Send size={14} /> Enviar
              </button>
            </div>
          </div>
        </div>
      )}

      {gestion && (
        <GestionModal api={api} gestion={gestion} setGestion={setGestion} proyectos={proyectos}
          onDone={() => { setGestion(null); cargar(); }} />
      )}
    </div>
  );
}

function GestionModal({ api, gestion, setGestion, proyectos, onDone }) {
  const d = gestion.deseo;
  const [trabajando, setTrabajando] = useState(false);

  const accion = async (fn, validaRespuesta) => {
    if (validaRespuesta && !gestion.respuesta.trim()) { alert('La respuesta es obligatoria para esta acción.'); return; }
    setTrabajando(true);
    try { await fn(); onDone(); }
    catch (e) { alert(e.message || 'No se pudo aplicar'); }
    finally { setTrabajando(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onMouseDown={(e) => e.target === e.currentTarget && (setGestion(null))}>
      <div className="bg-white rounded-xl w-full max-w-lg p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-1">Gestionar deseo</h3>
        <p className="text-sm text-slate-500 mb-1">{d.solicitante} · solicitado el {dstr(d.createdAt)}{d.fechaNecesidad ? ` · lo necesita para ${dstr(d.fechaNecesidad)}` : ''}</p>
        <p className="font-medium text-slate-800 mt-2">{d.titulo}</p>
        <p className="text-sm text-slate-600 mt-1 mb-3 whitespace-pre-wrap">{d.descripcion}</p>

        <label className="block text-sm text-slate-600 mb-1">Respuesta al solicitante</label>
        <textarea value={gestion.respuesta} onChange={(e) => setGestion({ ...gestion, respuesta: e.target.value })}
          rows={3} placeholder="Obligatoria al rechazar o pedir cambios; recomendable siempre."
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3" />

        <label className="block text-sm text-slate-600 mb-1">Proyecto del kanban (si se aprueba, opcional)</label>
        <select value={gestion.proyectoId} onChange={(e) => setGestion({ ...gestion, proyectoId: e.target.value })}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-4">
          <option value="">Sin proyecto (backlog general)</option>
          {(proyectos || []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>

        <div className="flex flex-wrap gap-2 justify-end">
          <button disabled={trabajando} onClick={() => accion(() => api.deseos.update(d.id, { estado: 'en_revision', respuesta: gestion.respuesta }))}
            className="px-3 py-2 text-sm border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 disabled:opacity-40">En revisión</button>
          <button disabled={trabajando} onClick={() => accion(() => api.deseos.update(d.id, { estado: 'requiere_cambios', respuesta: gestion.respuesta }), true)}
            className="px-3 py-2 text-sm border border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 disabled:opacity-40">Pedir cambios</button>
          <button disabled={trabajando} onClick={() => accion(() => api.deseos.update(d.id, { estado: 'rechazado', respuesta: gestion.respuesta }), true)}
            className="px-3 py-2 text-sm border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-40">Rechazar</button>
          <button disabled={trabajando} onClick={() => accion(() => api.deseos.aprobar(d.id, { respuesta: gestion.respuesta, proyectoId: gestion.proyectoId ? Number(gestion.proyectoId) : null }))}
            className="px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:opacity-90 disabled:opacity-40">Aprobar → Kanban</button>
        </div>
      </div>
    </div>
  );
}
