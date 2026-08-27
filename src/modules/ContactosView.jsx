// Agenda de contactos externos (26/08, pedido de Leonardo): gente ajena a la
// organización — del ámbito, o que entró por el CRM — para invitar a reuniones
// sin tipear el mail cada vez. DOS fuentes en una sola lista:
//   · Manuales: se crean/editan/borran acá.
//   · CRM (chip azul): derivados EN VIVO de los leads con mail o teléfono —
//     no se duplican ni se desincronizan; se editan en su lead.
// El picker de «Invitados externos» de las reuniones se alimenta de esta agenda.
import { useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2, UserPlus } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const FORM_DEF = { nombre: '', email: '', telefono: '', organizacion: '', cargo: '', notas: '' };

export default function ContactosView() {
  const { api } = useData();
  const [contactos, setContactos] = useState(null); // null = cargando
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);       // FORM_DEF (+id al editar) | null
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
      ? lista.filter((c) => [c.nombre, c.email, c.organizacion, c.cargo, c.telefono].some((x) => norm(x).includes(n)))
      : lista;
    return [...filtrada].sort((a, b) => norm(a.nombre).localeCompare(norm(b.nombre)));
  }, [contactos, q]);

  const guardar = async () => {
    if (!form.nombre.trim()) return;
    try {
      if (form.id) await api.contactos.update(form.id, form);
      else await api.contactos.create(form);
      setForm(null); setError('');
      cargar();
    } catch (e) { setError(e.message || 'No se pudo guardar el contacto'); }
  };
  const borrar = async (c) => {
    try { await api.contactos.remove(c.id); setBorrando(null); cargar(); }
    catch (e) { setError(e.message || 'No se pudo eliminar'); }
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, mail, organización…"
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-72" />
        <span className="text-xs text-slate-400">{visibles.length} contacto{visibles.length === 1 ? '' : 's'}</span>
        <div className="flex-1" />
        {!form && (
          <button onClick={() => setForm({ ...FORM_DEF })}
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

      {form && (
        <div className="bg-white border border-coop-azul/40 rounded-xl p-4 mb-3 space-y-2">
          <p className="text-sm font-medium text-slate-700">{form.id ? 'Editar contacto' : 'Nuevo contacto'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input value={form.nombre} onChange={(e) => setForm((x) => ({ ...x, nombre: e.target.value }))}
              placeholder="Nombre y apellido *" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            <input value={form.email} onChange={(e) => setForm((x) => ({ ...x, email: e.target.value }))}
              placeholder="Email" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            <input value={form.telefono} onChange={(e) => setForm((x) => ({ ...x, telefono: e.target.value }))}
              placeholder="Teléfono" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            <input value={form.organizacion} onChange={(e) => setForm((x) => ({ ...x, organizacion: e.target.value }))}
              placeholder="Organización" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            <input value={form.cargo} onChange={(e) => setForm((x) => ({ ...x, cargo: e.target.value }))}
              placeholder="Cargo" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            <input value={form.notas} onChange={(e) => setForm((x) => ({ ...x, notas: e.target.value }))}
              placeholder="Notas (de dónde lo conocemos…)" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setForm(null)} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-500">Cancelar</button>
            <button onClick={guardar} disabled={!form.nombre.trim()} className="px-3 py-1.5 text-sm rounded-lg bg-coop-azul text-white disabled:opacity-40">Guardar</button>
          </div>
        </div>
      )}

      {contactos === null ? <p className="text-sm text-slate-400">Cargando…</p> : (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {visibles.length === 0 && (
            <p className="text-sm text-slate-400 p-4">
              Sin contactos{q ? ` para «${q.trim()}»` : ''}. Los leads del CRM con mail o teléfono aparecen acá solos; el resto se carga con «Nuevo contacto».
            </p>
          )}
          {visibles.map((c) => (
            <div key={c.id} className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 group">
              <span className="font-medium text-slate-800">{c.nombre}</span>
              {c.cargo && <span className="text-xs text-slate-400">{c.cargo}</span>}
              {c.organizacion && <span className="text-sm text-slate-500">· {c.organizacion}</span>}
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.origen === 'crm' ? 'bg-coop-azul/10 text-coop-azul' : 'bg-slate-100 text-slate-500'}`}
                title={c.origen === 'crm' ? 'Derivado del lead del CRM — se edita en su lead y acá se refleja solo' : 'Cargado a mano en la agenda'}>
                {c.origen === 'crm' ? 'CRM' : 'Manual'}
              </span>
              <span className="ml-auto flex items-center gap-3 shrink-0 text-sm">
                {c.email && <a href={`mailto:${c.email}`} className="text-coop-azul hover:underline">✉ {c.email}</a>}
                {c.telefono && <a href={`tel:${c.telefono}`} className="text-slate-500 hover:text-coop-azul">📞 {c.telefono}</a>}
                {c.origen === 'manual' && (
                  <span className="flex items-center gap-1">
                    <button onClick={() => setForm({ id: c.id, nombre: c.nombre, email: c.email || '', telefono: c.telefono || '', organizacion: c.organizacion || '', cargo: c.cargo || '', notas: c.notas || '' })}
                      title="Editar" className="text-slate-300 hover:text-coop-azul opacity-0 group-hover:opacity-100"><Pencil size={14} /></button>
                    {borrando === c.id ? (
                      <span className="flex items-center gap-1 text-xs">
                        <button onClick={() => borrar(c)} className="px-1.5 py-0.5 rounded bg-red-600 text-white">Sí</button>
                        <button onClick={() => setBorrando(null)} className="px-1.5 py-0.5 rounded border border-slate-300 text-slate-500">No</button>
                      </span>
                    ) : (
                      <button onClick={() => setBorrando(c.id)} title="Eliminar de la agenda"
                        className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 size={14} /></button>
                    )}
                  </span>
                )}
              </span>
              {c.notas && <p className="w-full text-xs text-slate-400">{c.notas}</p>}
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-400 mt-2">
        Esta agenda alimenta el «＋ Agregar desde Contactos» al invitar externos a una reunión. Los contactos con chip <b>CRM</b> vienen en vivo de los leads: si el lead corrige el mail, acá se refleja solo.
      </p>
    </div>
  );
}
