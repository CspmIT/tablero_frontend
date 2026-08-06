// "Mi día" (05/08 — ola 2 pedida por Carola, referencia: vista Día de Outlook).
// La jornada hora a hora: MIS reuniones como bloques sobre la línea de tiempo,
// ARRASTRABLES (mover de horario) y ESTIRABLES (cambiar duración) — al soltar,
// reprograma de verdad (PATCH → Outlook primero, respuestas se reinician).
// Solo el organizador/manager puede arrastrar (candadito para el resto).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useData } from '../data/DataContext.jsx';
import SwitchVista from '../components/SwitchVista.jsx';
import ReunionModal from './ReunionModal.jsx';
import { fmtISO } from './grillaUtils.js';

const H_INI = 6, H_FIN = 22, PX_HORA = 56;
const SNAP_MIN = 15;

const aMin = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const aHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export default function MiDia({ vista, setVista }) {
  const { api } = useData();
  const [fecha, setFecha] = useState(() => fmtISO(new Date()));
  const [reuniones, setReuniones] = useState([]);
  const [puedoGestionar, setPuedoGestionar] = useState({});
  const [drag, setDrag] = useState(null); // { id, tipo:'mover'|'estirar', iniY, minInicio, minFin, prevIni, prevFin }
  const [guardando, setGuardando] = useState(null);
  const [editando, setEditando] = useState(null); // reunión abierta en el modal
  const contRef = useRef(null);

  const cargar = useCallback(async () => {
    try {
      const r = await api.reuniones.list();
      setReuniones((r.reuniones || []).filter((x) => String(x.fecha).slice(0, 10) === fecha));
      setPuedoGestionar(r.puedoGestionar || {});
    } catch { /* */ }
  }, [api, fecha]);
  useEffect(() => { cargar(); }, [cargar]);

  const moverDia = (d) => {
    const f = new Date(fecha + 'T00:00:00');
    f.setDate(f.getDate() + d);
    setFecha(fmtISO(f));
  };

  const snap = (min) => Math.round(min / SNAP_MIN) * SNAP_MIN;
  const clamp = (min) => Math.max(H_INI * 60, Math.min(H_FIN * 60, min));

  const onPointerDown = (e, r, tipo) => {
    if (!puedoGestionar[r.id]) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({
      id: r.id, tipo, iniY: e.clientY,
      minInicio: aMin(r.horaInicio), minFin: aMin(r.horaFin),
      prevIni: aMin(r.horaInicio), prevFin: aMin(r.horaFin),
    });
  };

  const onPointerMove = (e) => {
    if (!drag) return;
    const dMin = snap(((e.clientY - drag.iniY) / PX_HORA) * 60);
    setDrag((d) => {
      if (!d) return d;
      if (d.tipo === 'mover') {
        const dur = d.prevFin - d.prevIni;
        let ini = clamp(d.prevIni + dMin);
        if (ini + dur > H_FIN * 60) ini = H_FIN * 60 - dur;
        return { ...d, minInicio: ini, minFin: ini + dur };
      }
      // estirar: solo el fin, mínimo 15'
      let fin = clamp(d.prevFin + dMin);
      if (fin < d.prevIni + SNAP_MIN) fin = d.prevIni + SNAP_MIN;
      return { ...d, minFin: fin };
    });
  };

  const onPointerUp = async () => {
    if (!drag) return;
    const d = drag; setDrag(null);
    if (d.minInicio === d.prevIni && d.minFin === d.prevFin) return; // sin cambios
    const r = reuniones.find((x) => x.id === d.id);
    if (!r) return;
    const nuevoIni = aHHMM(d.minInicio), nuevoFin = aHHMM(d.minFin);
    if (!confirm(`¿Reprogramar "${r.titulo}" a ${nuevoIni}–${nuevoFin}? Se actualiza en Outlook y las respuestas de los invitados se reinician.`)) { cargar(); return; }
    setGuardando(d.id);
    try {
      await api.reuniones.update(r.id, {
        titulo: r.titulo, fecha, horaInicio: nuevoIni, horaFin: nuevoFin,
        colaboradoresIds: Array.isArray(r.colaboradoresIds) ? r.colaboradoresIds : [],
        lugar: r.lugar || null, tags: Array.isArray(r.tags) ? r.tags : [],
      });
    } catch (e) { alert(e.message || 'No se pudo reprogramar'); }
    setGuardando(null);
    cargar();
  };

  const horas = [];
  for (let h = H_INI; h <= H_FIN; h++) horas.push(h);
  const hoy = fmtISO(new Date()) === fecha;
  const ahoraMin = new Date().getHours() * 60 + new Date().getMinutes();

  return (
    <div className="p-4 max-w-3xl mx-auto" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <SwitchVista vista={vista} setVista={setVista} />
        <div className="flex items-center gap-1.5">
          <button onClick={() => moverDia(-1)} className="px-2 py-1 rounded-lg hover:bg-slate-100">‹</button>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          <button onClick={() => moverDia(1)} className="px-2 py-1 rounded-lg hover:bg-slate-100">›</button>
          <button onClick={() => setFecha(fmtISO(new Date()))} className="text-sm border border-slate-200 px-2.5 py-1.5 rounded-lg hover:bg-slate-50">Hoy</button>
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-2">
        Arrastrá una reunión para moverla de horario, o estirá desde el borde inferior para cambiar su duración (solo las que organizás). Al soltar, se reprograma en Outlook.
      </p>

      <div ref={contRef} className="relative bg-white border border-slate-200 rounded-xl overflow-hidden select-none"
        style={{ height: (H_FIN - H_INI) * PX_HORA + 20 }}>
        {horas.map((h) => (
          <div key={h} className="absolute left-0 right-0 border-t border-slate-100 text-[10px] text-slate-400 pl-1"
            style={{ top: (h - H_INI) * PX_HORA }}>
            {String(h).padStart(2, '0')}:00
          </div>
        ))}
        {hoy && ahoraMin >= H_INI * 60 && ahoraMin <= H_FIN * 60 && (
          <div className="absolute left-10 right-0 h-0.5 bg-red-400 z-10" style={{ top: ((ahoraMin - H_INI * 60) / 60) * PX_HORA }} />
        )}
        {reuniones.map((r) => {
          const enDrag = drag?.id === r.id;
          const ini = enDrag ? drag.minInicio : aMin(r.horaInicio);
          const fin = enDrag ? drag.minFin : aMin(r.horaFin);
          const top = ((ini - H_INI * 60) / 60) * PX_HORA;
          const alto = Math.max(24, ((fin - ini) / 60) * PX_HORA);
          const gestiono = !!puedoGestionar[r.id];
          return (
            <div key={r.id}
              onPointerDown={(e) => onPointerDown(e, r, 'mover')}
              className={`absolute left-12 right-2 rounded-lg border px-2.5 py-1 overflow-hidden ${
                enDrag ? 'bg-coop-azul text-white border-coop-azul shadow-lg z-20' :
                guardando === r.id ? 'bg-slate-200 border-slate-300 opacity-60' :
                'bg-coop-azul/10 border-coop-azul/30 text-slate-800'
              } ${gestiono ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
              style={{ top, height: alto, touchAction: 'none' }}>
              <p className="text-xs font-semibold truncate pr-5">
                {!gestiono && '🔒 '}{r.titulo}
              </p>
              {gestiono && (
                <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setEditando(r); }}
                  title="Editar reunión completa (título, participantes, otro día…)"
                  className={`absolute top-1 right-1.5 text-[13px] ${enDrag ? 'text-white/80' : 'text-coop-azul/60 hover:text-coop-azul'}`}>✎</button>
              )}
              <p className={`text-[11px] ${enDrag ? 'text-white/90' : 'text-slate-500'}`}>
                {aHHMM(ini)}–{aHHMM(fin)}{r.lugar ? ` · ${r.lugar}` : ''}
              </p>
              {gestiono && (
                <div onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, r, 'estirar'); }}
                  className="absolute left-0 right-0 bottom-0 h-2.5 cursor-ns-resize flex justify-center items-end">
                  <span className={`w-8 h-1 rounded-full mb-0.5 ${enDrag ? 'bg-white/70' : 'bg-coop-azul/40'}`} />
                </div>
              )}
            </div>
          );
        })}
        {reuniones.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">Sin reuniones este día 🎉</p>
        )}
      </div>
      <p className="text-[11px] text-slate-400 mt-2">Mi día muestra tus reuniones (las tareas de la grilla no tienen horario: viven en la Grilla y Mi semana).</p>
      {editando && (
        <ReunionModal
          reunion={editando}
          fechaInicial={fecha}
          onDone={() => { setEditando(null); cargar(); }}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}
