// Agenda de contactos externos (26/08; TABLA editable 27/08, pedido de Leonardo:
// «en esa vista es posible detectar faltantes con mayor facilidad»). Columnas
// fijas aunque haya vacíos: Nombre · Organización · Teléfono · Email · Proyecto
// del CRM · Comentarios. DOS fuentes en una lista:
//   · Manuales: se crean/editan/borran acá (comentarios incluidos).
//   · CRM (chip azul): derivados EN VIVO de los leads. EDITARLOS ACÁ GUARDA EN
//     EL LEAD (PATCH /leads/:id con contactoNombre/organización/teléfono/email)
//     — al abrir «Editar lead» en el Embudo, el modal ya trae lo corregido.
//     El CRM padre recibe onLeadActualizado para refrescar su lista en memoria.
// El picker de «Invitados externos» de las reuniones se alimenta de esta agenda.
import { useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2, UserPlus } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const FORM_DEF = { nombre: '', email: '', telefono: '', organizacion: '', cargo: '', notas: '' };
const ETAPA_LABEL = { nuevo: 'Nuevo', contactado: 'Contactado', reunion: 'Reunión', propuesta: 'Propuesta', visita_realizada: 'Visita realizada', ganado: 'Ganado', perdido: 'Perdido', declinado: 'Declinado' };

export default function ContactosView({ onLeadActualizado }) {
  const { api } = useData();
  const [contactos, setContactos] = useState(null); // null = cargando
  const [q, setQ] = useState('');
  const [alta, setAlta] = useState(null);       // FORM_DEF | null (solo alta manual)
  const [fila, setFila] = useState(null);       // edición inline: { id, nombre, organizacion, telefono, email, notas } | null
  const [borrando, setBorrando] = useState(null);
  const [error, setError] = useState('');

  const cargar = () => {
    api.contactos.list().then((r) => setContactos(r.contactos || [])).catch(() => setContactos([]));
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const visibles = useMemo(() => {
    const lista = contactos || [];
    const n = norm(q.trim());
    const filtrada = n
      ? lista.filter((c) => [c.nombre, c.email, c.organizacion, c.cargo, c.telefono, (c.productos || []).join(' ')].some((x) => norm(x).includes(n)))
      : lista;
    return [...filtrada].sort((a, b) => norm(a.nombre).localeCompare(norm(b.nombre)));
  }, [contactos, q]);

  const crear = async () => {
    if (!alta.nombre.trim()) return;
    try { await api.contactos.create(alta); setAlta(null); setError(''); cargar(); }
    catch (e) { setError(e.message || 'No se pudo crear el contacto'); }
  };

  // Guardar la fila en edición: manual → agenda; CRM → EL LEAD (misma verdad).
  const guardarFila = async (c) => {
    if (!fila.nombre.trim()) { setError('El nombre no puede quedar vacío.'); return; }
    try {
      if (c.origen === 'crm') {
        const upd = await api.leads.update(c.leadId, {
          contactoNombre: fila.nombre,
          organizacion: fila.organizacion,
          telefono: fila.telefono,
          email: fila.email,
        });
        onLeadActualizado?.(upd); // el Embudo/modal del CRM quedan al día sin recargar
      } else {
        await api.contactos.update(c.id, { nombre: fila.nombre, organizacion: fila.organizacion, telefono: fila.telefono, email: fila.email, notas: fila.notas });
      }
      setFila(null); setError('');
      cargar();
    } catch (e) { setError(e.message || 'No se pudo guardar'); }
  };
  const borrar = async (c) => {
    try { await api.contactos.remove(c.id); setBorrando(null); cargar(); }
    catch (e) { setError(e.message || 'No se pudo eliminar'); }
  };

  const editarFila = (c) => setFila({
    id: c.id, nombre: c.nombre || '', organizacion: c.organizacion || '',
    telefono: c.telefono || '', email: c.email || '', notas: c.notas || '',
  });

  const inputCelda = (campo, ancho = 'w-full') => (
    <input value={fila[campo]} onChange={(e) => setFila((x) => ({ ...x, [campo]: e.target.value }))}
      onKeyDown={(e) => { if (e.key === 'Escape') setFila(null); }}
      className={`${ancho} border border-coop-azul/50 rounded px-1.5 py-1 text-sm bg-blue-50/40`} />
  );

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, mail, organización, proyecto…"
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-80" />
        <span className="text-xs text-slate-400">{visibles.length} contacto{visibles.length === 1 ? '' : 's'}</span>
        <div className="flex-1" />
        {!alta && (
          <button onClick={() => setAlta({ ...FORM_DEF })}
            className="bg-coop-naranja text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 flex items-center gap-1.5">
            <UserPlus size={15} /> Nuevo contacto
          </button>
        )}
      </div>
      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 flex items-center justify-between gap-2">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {alta && (
        <div className="bg-white border border-coop-azul/40 rounded-xl p-4 mb-3 space-y-2">
          <p className="text-sm font-medium text-slate-700">Nuevo contacto (manual)</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input value={alta.nombre} onChange={(e) => setAlta((x) => ({ ...x, nombre: e.target.value }))} placeholder="Nombre y apellido *" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            <input value={alta.organizacion} onChange={(e) => setAlta((x) => ({ ...x, organizacion: e.target.value }))} placeholder="Organización" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            <input value={alta.cargo} onChange={(e) => setAlta((x) => ({ ...x, cargo: e.target.value }))} placeholder="Cargo" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            <input value={alta.telefono} onChange={(e) => setAlta((x) => ({ ...x, telefono: e.target.value }))} placeholder="Teléfono" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            <input value={alta.email} onChange={(e) => setAlta((x) => ({ ...x, email: e.target.value }))} placeholder="Email" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            <input value={alta.notas} onChange={(e) => setAlta((x) => ({ ...x, notas: e.target.value }))} placeholder="Comentarios" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setAlta(null)} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-500">Cancelar</button>
            <button onClick={crear} disabled={!alta.nombre.trim()} className="px-3 py-1.5 text-sm rounded-lg bg-coop-azul text-white disabled:opacity-40">Guardar</button>
          </div>
        </div>
      )}

      {contactos === null ? <p className="text-sm text-slate-400">Cargando…</p> : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 900 }}>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-200">
                <th className="px-3 py-2 font-semibold">Nombre</th>
                <th className="px-3 py-2 font-semibold">Organización</th>
                <th className="px-3 py-2 font-semibold">Teléfono</th>
                <th className="px-3 py-2 font-semibold">Email</th>
                <th className="px-3 py-2 font-semibold">Proyecto del CRM</th>
                <th className="px-3 py-2 font-semibold">Comentarios</th>
                <th className="px-3 py-2 font-semibold">Origen</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                  Sin contactos{q ? ` para «${q.trim()}»` : ''}. Los leads del CRM con mail o teléfono aparecen solos; el resto con «Nuevo contacto».
                </td></tr>
              )}
              {visibles.map((c) => {
                const editando = fila?.id === c.id;
                return (
                  <tr key={c.id} className="group hover:bg-slate-50/60 align-top">
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {editando ? inputCelda('nombre', 'w-40') : (c.nombre || <span className="text-slate-300">—</span>)}
                      {!editando && c.cargo && <div className="text-[11px] font-normal text-slate-400">{c.cargo}</div>}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{editando ? inputCelda('organizacion', 'w-40') : (c.organizacion || <span className="text-slate-300">—</span>)}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{editando ? inputCelda('telefono', 'w-36') : (c.telefono ? <a href={`tel:${c.telefono}`} className="hover:text-coop-azul">{c.telefono}</a> : <span className="text-slate-300">—</span>)}</td>
                    <td className="px-3 py-2 text-slate-600">{editando ? inputCelda('email', 'w-48') : (c.email ? <a href={`mailto:${c.email}`} className="text-coop-azul hover:underline break-all">{c.email}</a> : <span className="text-slate-300">—</span>)}</td>
                    <td className="px-3 py-2">
                      {c.origen === 'crm' ? (
                        <span className="flex flex-wrap gap-1 items-center">
                          {(c.productos || []).map((p) => <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-coop-azul/10 text-coop-azul">{p}</span>)}
                          {c.etapa && <span className="text-[10px] text-slate-400">{ETAPA_LABEL[c.etapa] || c.etapa}</span>}
                          {!(c.productos || []).length && !c.etapa && <span className="text-slate-300">—</span>}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-500 text-xs max-w-[220px]">
                      {editando
                        ? (c.origen === 'manual' ? inputCelda('notas') : <span className="text-slate-300" title="Los comentarios de un contacto del CRM viven en su lead">—</span>)
                        : (c.notas || <span className="text-slate-300">—</span>)}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.origen === 'crm' ? 'bg-coop-azul/10 text-coop-azul' : 'bg-slate-100 text-slate-500'}`}
                        title={c.origen === 'crm' ? 'Espejo del lead del CRM — editarlo acá guarda en el lead' : 'Cargado a mano en la agenda'}>
                        {c.origen === 'crm' ? 'CRM' : 'Manual'}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      {editando ? (
                        <span className="flex items-center gap-1.5 justify-end">
                          <button onClick={() => guardarFila(c)} className="px-2 py-1 text-xs rounded-lg bg-coop-azul text-white">Guardar</button>
                          <button onClick={() => setFila(null)} className="px-2 py-1 text-xs rounded-lg border border-slate-300 text-slate-500">✕</button>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 justify-end opacity-0 group-hover:opacity-100">
                          <button onClick={() => editarFila(c)} title={c.origen === 'crm' ? 'Editar (guarda en el lead del CRM)' : 'Editar'}
                            className="text-slate-300 hover:text-coop-azul"><Pencil size={14} /></button>
                          {c.origen === 'manual' && (borrando === c.id ? (
                            <span className="flex items-center gap-1 text-xs">
                              <button onClick={() => borrar(c)} className="px-1.5 py-0.5 rounded bg-red-600 text-white">Sí</button>
                              <button onClick={() => setBorrando(null)} className="px-1.5 py-0.5 rounded border border-slate-300 text-slate-500">No</button>
                            </span>
                          ) : (
                            <button onClick={() => setBorrando(c.id)} title="Eliminar de la agenda" className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-400 mt-2">
        Esta agenda alimenta el «＋ Agregar desde Contactos» al invitar externos a una reunión. Editar un contacto <b>CRM</b> guarda directo en su lead — el modal «Editar lead» del Embudo abre con los datos actualizados. Los comentarios son propios de los contactos manuales.
      </p>
    </div>
  );
}
