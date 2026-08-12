// Mis notas (ola 3, 07/08) — texto libre semanal, dentro de Novedades del CRM.
// Reemplaza las notas del celu / block / Word borrador. Todos ven las de todos;
// cada uno edita SOLO la suya (lo impone el backend con el token). Semanas
// navegables ‹ › y editables hacia atrás. Nota vacía = se borra (patrón WIP).
import { useEffect, useState, useCallback } from 'react';
import { StickyNote } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';
import { getMonday, addDays, getISOWeek } from './grillaUtils.js';

const fmtDM = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
const fmtHora = (v) => { try { const d = new Date(v); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; } catch { return ''; } };

export default function MisNotas() {
  const { api, me } = useData();
  // OJO: /auth/me devuelve colaboradorId, NO id (bug 10/08: la nota propia
  // aparecía como ajena y el textarea quedaba vacío por comparar con me.id).
  const miId = Number(me?.colaboradorId ?? me?.id);
  const [lunes, setLunes] = useState(() => getMonday(new Date()));
  const anio = lunes.getFullYear();
  const semanaIso = getISOWeek(lunes);
  const [notas, setNotas] = useState([]);
  const [texto, setTexto] = useState('');
  const [textoOriginal, setTextoOriginal] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [msj, setMsj] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await api.notas.list(anio, semanaIso);
      const todas = r?.notas || [];
      setNotas(todas);
      const mia = todas.find((n) => Number(n.colaboradorId) === miId);
      setTexto(mia?.texto || '');
      setTextoOriginal(mia?.texto || '');
    } catch { setNotas([]); setTexto(''); setTextoOriginal(''); }
    setCargando(false);
  }, [api, anio, semanaIso, miId]);
  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async () => {
    setGuardando(true); setMsj(null);
    try {
      await api.notas.set({ anio, semanaIso, texto });
      setMsj(texto.trim() ? '✓ Guardada' : '✓ Borrada');
      setTimeout(() => setMsj(null), 4000);
      await cargar();
    } catch (e) { alert(e.message || 'No se pudo guardar la nota'); }
    finally { setGuardando(false); }
  };

  const esHoy = getMonday(new Date()).getTime() === lunes.getTime();
  const ajenas = notas.filter((n) => Number(n.colaboradorId) !== miId);
  const sinGuardar = texto !== textoOriginal;

  return (
    <div className="mt-5 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h3 className="text-base font-semibold text-slate-700 flex items-center gap-2">
          <StickyNote size={16} className="text-coop-naranja" /> Mis notas
          <span className="text-sm font-normal text-slate-400">semana del {fmtDM(lunes)} al {fmtDM(addDays(lunes, 6))}</span>
        </h3>
        <span className="flex items-center gap-1 text-sm">
          <button onClick={() => setLunes(addDays(lunes, -7))} className="px-2 py-1 rounded hover:bg-slate-100">‹</button>
          {!esHoy && <button onClick={() => setLunes(getMonday(new Date()))} className="px-2 py-1 rounded text-coop-azul hover:bg-slate-100 text-xs">Hoy</button>}
          <button onClick={() => setLunes(addDays(lunes, 7))} className="px-2 py-1 rounded hover:bg-slate-100">›</button>
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <p className="text-xs text-slate-400 mb-1.5">Tu nota de la semana (texto libre; la ven todos, solo vos la editás; vacía = se borra)</p>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} disabled={cargando}
          placeholder="Escribí acá lo que antes iba al celu o al Word borrador…"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-coop-azul/40 focus:border-coop-azul" />
        <div className="flex items-center gap-2 mt-1.5">
          <button onClick={guardar} disabled={guardando || cargando || !sinGuardar}
            className="text-sm bg-coop-azul text-white px-4 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-40">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          {msj && <span className="text-sm text-emerald-600 font-medium">{msj}</span>}
          {sinGuardar && !msj && <span className="text-xs text-amber-600">Cambios sin guardar</span>}
        </div>
      </div>

      {ajenas.length > 0 && (
        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          {ajenas.map((n) => (
            <div key={n.colaboradorId} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-slate-600 mb-1">{n.nombre} <span className="font-normal text-slate-400">· {fmtHora(n.updatedAt)}</span></p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.texto}</p>
            </div>
          ))}
        </div>
      )}
      {!cargando && ajenas.length === 0 && (
        <p className="text-xs text-slate-400 mt-2">Nadie más dejó notas esta semana.</p>
      )}
    </div>
  );
}
