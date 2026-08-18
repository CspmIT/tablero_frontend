import { useState, useEffect, useMemo } from 'react';
import { Video } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';
import ReunionModal from './ReunionModal.jsx';
import {
  STATUS_TYPES, ENTRY_TIMES, isWorkingDay, hoursBetween, fmtDDMM, fmtISO,
} from './grillaUtils.js';

const FULL_DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm';

// Métricas OV (18/08, pedido de Gerencia de Operaciones): si el ítem lleva el
// tag «Oficina Virtual», se clasifica ACÁ MISMO (tipo × causa) — el ticket
// nace clasificado y la bandeja de Métricas OV no acumula (lección del punto
// 18 del registro: etiquetar en el origen). Los campos viajan ADENTRO del
// ítem (ovTipo/ovCausa/...), sin migración; el spread de cleanItems los
// preserva y el PUT de grilla hace merge por id.
const OV_TIPOS = [['incidente', 'Incidente'], ['solicitud', 'Solicitud']];
const OV_CAUSAS = [
  ['ov_interna', 'Operación interna OV'],
  ['interna_otra', 'Otra causa interna'],
  ['procoop', 'Procoop y dependencias'],
  ['terceros', 'Software de terceros'],
];
const esItemOV = (it) => (Array.isArray(it?.tags) ? it.tags : []).some(
  (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() === 'oficina virtual',
);

// Normalización para sugerir sin importar mayúsculas/acentos/símbolos
// ("mas agua" encuentra "+Agua" si comparten raíz, "MASAGUA" encuentra "masagua").
const normTag = (s) => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

function TagChips({ tags, onAdd, onRemove, catalogo = [] }) {
  const [val, setVal] = useState('');
  const [foco, setFoco] = useState(false);
  const [selIdx, setSelIdx] = useState(-1); // resaltado con flechas; -1 = nada

  // Sugerencias: primero las que EMPIEZAN igual, después las que contienen.
  const sugerencias = useMemo(() => {
    const q = normTag(val);
    if (!q) return [];
    const usadas = new Set(tags.map(normTag));
    const cand = catalogo.filter((n) => !usadas.has(normTag(n)));
    const empieza = cand.filter((n) => normTag(n).startsWith(q));
    const contiene = cand.filter((n) => !normTag(n).startsWith(q) && normTag(n).includes(q));
    return [...empieza, ...contiene].slice(0, 6);
  }, [val, tags, catalogo]);

  const agregar = (nombre) => {
    const t = String(nombre || '').trim();
    if (!t) return;
    // Si lo tipeado coincide (normalizado) con uno del catálogo, gana el canónico.
    const canonico = catalogo.find((n) => normTag(n) === normTag(t));
    const final = canonico || t;
    if (!tags.includes(final)) onAdd(final);
    setVal('');
  };

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1 relative">
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-coop-azul/10 text-coop-azul text-xs">
          {t}
          <button type="button" onClick={() => onRemove(t)} className="hover:text-red-500">×</button>
        </span>
      ))}
      <span className="relative">
        <input
          value={val}
          onChange={(e) => { setVal(e.target.value); setSelIdx(-1); }}
          onFocus={() => setFoco(true)}
          onBlur={() => setTimeout(() => setFoco(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && sugerencias.length) {
              e.preventDefault(); setSelIdx((i) => (i + 1) % sugerencias.length);
            } else if (e.key === 'ArrowUp' && sugerencias.length) {
              e.preventDefault(); setSelIdx((i) => (i <= 0 ? sugerencias.length - 1 : i - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              agregar(selIdx >= 0 && sugerencias[selIdx] ? sugerencias[selIdx] : val);
              setSelIdx(-1);
            } else if (e.key === 'Escape') { setFoco(false); setSelIdx(-1); }
          }}
          placeholder="+ tag (Enter)"
          className="text-xs border border-slate-200 rounded px-2 py-0.5 w-28"
        />
        {foco && sugerencias.length > 0 && (
          <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[140px]">
            {sugerencias.map((sug, i) => (
              <button key={sug} type="button" onMouseDown={(e) => { e.preventDefault(); agregar(sug); setSelIdx(-1); }}
                onMouseEnter={() => setSelIdx(i)}
                className={`block w-full text-left px-3 py-1 text-xs text-slate-700 ${i === selIdx ? 'bg-coop-azul/15' : 'hover:bg-coop-azul/10'}`}>
                {sug}
              </button>
            ))}
          </div>
        )}
      </span>
    </div>
  );
}

export default function DayEditModal({ open, onClose, collaborator, date, entry, weeklyWipText, feriadoName, onSave, onReunionCreada }) {
  const { api, me, tags: tagsRegistro } = useData();
  // Ola reuniones: crear una reunión directamente desde el día de la grilla
  // (el ítem lo agrega el backend en la grilla de todos los participantes; el
  // modal del día se cierra para que la recarga muestre el día actualizado).
  const [reunionOpen, setReunionOpen] = useState(false);
  // Catálogo para autocompletar: registro Tag + todas las etiquetas en uso en la
  // grilla (el endpoint las trae por frecuencia). Fallback: solo registro.
  const [sugerenciasFull, setSugerenciasFull] = useState(null);
  useEffect(() => {
    if (!open || sugerenciasFull) return;
    api.etiquetas.sugerencias()
      .then((r) => setSugerenciasFull(r?.sugerencias || []))
      .catch(() => setSugerenciasFull([]));
  }, [open, api, sugerenciasFull]);
  const catalogoTags = useMemo(() => {
    const delRegistro = (tagsRegistro || []).map((t) => t.nombre);
    const todas = [...(sugerenciasFull || []), ...delRegistro];
    return [...new Set(todas)];
  }, [tagsRegistro, sugerenciasFull]);
  const [status, setStatus] = useState('present');
  const [entryTime, setEntryTime] = useState('08:00');
  const [viajeLabel, setViajeLabel] = useState('');
  const [items, setItems] = useState([{ text: '', wip: false, tags: [], horas: null }]);
  const [hsExtraOn, setHsExtraOn] = useState(false);
  const [hsIng, setHsIng] = useState('18:00');
  const [hsSal, setHsSal] = useState('20:00');

  useEffect(() => {
    if (!open) return;
    if (entry) {
      setStatus(entry.status || 'present');
      setEntryTime(entry.entry_time || '08:00');
      setViajeLabel(entry.viaje_label || '');
      const its = entry.items && entry.items.length
        ? entry.items.map((it) => (typeof it === 'string'
            ? { text: it, wip: false, tags: [], horas: null }
            : { ...it, text: it?.text || '', wip: !!it?.wip, tags: Array.isArray(it?.tags) ? [...it.tags] : [], horas: (Number(it?.horas) > 0 ? Number(it.horas) : null) }))
        : [{ text: '', wip: false, tags: [], horas: null }];
      setItems(its);
      const hx = entry.horas_extra;
      setHsExtraOn(!!hx);
      setHsIng(hx?.ingreso || '18:00');
      setHsSal(hx?.salida || '20:00');
    } else {
      // Día sin carga: si hay feriado nacional, queda pre-asignado como "Feriado".
      setStatus(feriadoName ? 'feriado' : 'present');
      setEntryTime('08:00');
      setViajeLabel('');
      setItems(weeklyWipText ? [{ text: weeklyWipText, wip: true, tags: [], horas: null }] : [{ text: '', wip: false, tags: [], horas: null }]);
      setHsExtraOn(false);
      setHsIng('18:00');
      setHsSal('20:00');
    }
  }, [open, entry, weeklyWipText, feriadoName]);

  // Reparto del día (8 hs): los ítems con horas explícitas las usan; el resto
  // del día se divide entre los que no especifican. Igual criterio que las
  // estadísticas de horas por proyecto.
  const itemsValidos = items.filter((it) => it.text && it.text.trim());
  const sumExpl = itemsValidos.reduce((a, it) => a + (Number(it.horas) > 0 ? Number(it.horas) : 0), 0);
  const sinEspecificar = itemsValidos.filter((it) => !(Number(it.horas) > 0)).length;
  const restoDia = Math.max(0, 8 - sumExpl);
  const horasAuto = sinEspecificar ? Math.round((restoDia / sinEspecificar) * 10) / 10 : 0;
  const excedido = sumExpl > 8;

  if (!open || !collaborator || !date) return null;

  const dt = date instanceof Date ? date : new Date(date + 'T00:00:00');
  const dayName = FULL_DAYS[dt.getDay()];
  // "Franco cumpleaños" disponible si el colaborador tiene cumple cargado y la fecha
  // es de su mes de cumpleaños en adelante (gate por mes, igual que canTakeCumpleOn).
  const showCumpleOption = !!(collaborator?.cumpleMes && collaborator?.cumpleDia) && dt.getMonth() >= (collaborator.cumpleMes - 1);

  const setItem = (i, patch) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => setItems((arr) => [...arr, { text: '', wip: false, tags: [], horas: null }]);
  const removeItem = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i));

  // Ítems de reunión: la ✕ solo lo quita de TU día; cancelar para todos
  // (Outlook avisa + se limpia la grilla de todos) es la acción explícita.
  const quitarConAviso = (i) => {
    const it = items[i];
    if (it?.reunionId) {
      if (!window.confirm('Este ítem pertenece a una reunión. La ✕ solo lo quita de TU día (la reunión sigue en pie para los demás). Para cancelarla para todos usá el botón violeta "Cancelar reunión". ¿Quitarlo solo de tu día?')) return;
    }
    removeItem(i);
  };
  const cancelarReunionDeItem = async (it) => {
    if (!it?.reunionId) return;
    if (!window.confirm('¿Cancelar la reunión PARA TODOS? Outlook envía la cancelación a los invitados y el ítem se quita de la grilla de todos los participantes.')) return;
    try {
      const r = await api.reuniones.cancelar(it.reunionId);
      if (r.graphError) alert(r.graphError);
      (onReunionCreada || onClose)(); // cierra y recarga la grilla
    } catch (e) { alert(e.message || 'No se pudo cancelar (solo el organizador o un manager pueden)'); }
  };
  const toggleWip = (i) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, wip: !it.wip } : it)));
  const addTag = (i, t) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, tags: [...it.tags, t] } : it)));
  const removeTag = (i, t) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, tags: it.tags.filter((x) => x !== t) } : it)));

  const workingDay = isWorkingDay(status);
  // El spread preserva los campos invisibles de los ítems de reunión
  // (reunionId, link): sin ellos, reprogramar/cancelar no encuentra el ítem.
  const cleanItems = items.map((it) => ({
    ...it,
    text: it?.text || '',
    wip: !!it?.wip,
    tags: Array.isArray(it?.tags) ? it.tags.filter((t) => typeof t === 'string' && t.trim()) : [],
    horas: Number(it?.horas) > 0 ? Number(it.horas) : null,
  }));
  const validItems = cleanItems.filter((it) => it.text.trim());
  const wipItemCount = validItems.filter((it) => it.wip).length;
  const dailyPct = workingDay && validItems.length > 0 ? Math.round((wipItemCount / validItems.length) * 100) : null;

  const weeklyAlreadyItem = weeklyWipText && items.some((it) => (it?.text || '').trim().toLowerCase() === weeklyWipText.trim().toLowerCase());

  const handleSave = () => {
    onSave({
      status,
      entry_time: status === 'present' ? entryTime : null,
      viaje_label: status === 'viaje' ? viajeLabel : null,
      items: cleanItems,
      horas_extra: hsExtraOn ? { ingreso: hsIng, salida: hsSal, horas: hoursBetween(hsIng, hsSal) } : null,
    });
  };
  const handleDelete = () => {
    if (window.confirm('¿Borrar lo cargado para este día?')) onSave(null);
  };

  const statusKeys = Object.keys(STATUS_TYPES).filter(
    (key) => key !== 'franco_cumple' || showCumpleOption || status === 'franco_cumple'
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold">{collaborator.nombre}</h3>
            <p className="text-sm text-slate-500">{dayName} · {fmtDDMM(dt)}/{dt.getFullYear()}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        {feriadoName && !entry && (
          <div className="text-sm rounded-lg px-3 py-2 mb-3 bg-slate-100 text-slate-600">
            <b>Feriado nacional:</b> {feriadoName}. Quedó pre-asignado como "Feriado"; cambialo si trabajaste por causa especial.
          </div>
        )}

        {/* Estado del día */}
        <div className="mb-3">
          <label className="block text-sm text-slate-600 mb-1">Estado del día</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {statusKeys.map((key) => {
              const cfg = STATUS_TYPES[key];
              const sel = status === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatus(key)}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs ${sel ? 'border-coop-azul ring-1 ring-coop-azul' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Horario de ingreso (presente) */}
        {status === 'present' && (
          <div className="mb-3">
            <label className="block text-sm text-slate-600 mb-1">Horario flexible de ingreso</label>
            <div className="flex flex-wrap gap-2">
              {ENTRY_TIMES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setEntryTime(t)}
                  className={`px-3 py-1.5 rounded-lg border text-sm ${entryTime === t ? 'border-coop-azul ring-1 ring-coop-azul' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Detalle del viaje */}
        {status === 'viaje' && (
          <div className="mb-3">
            <label className="block text-sm text-slate-600 mb-1">Detalle del viaje (opcional)</label>
            <input value={viajeLabel} onChange={(e) => setViajeLabel(e.target.value)} placeholder="Ej: VIAJE COOPTECH, VIAJE RIO TERCERO..." className={inputCls} />
          </div>
        )}

        {/* Lo que hice hoy (días laborables) */}
        {workingDay && (
          <div className="mb-3">
            <label className="block text-sm text-slate-600 mb-1">
              Lo que hice hoy
              {dailyPct !== null && <span className="ml-2 text-xs text-emerald-600">· {dailyPct}% del día al WIP</span>}
            </label>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="border border-slate-200 rounded-lg p-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-4 text-center">{idx + 1}</span>
                    <input
                      value={it.text}
                      onChange={(e) => setItem(idx, { text: e.target.value })}
                      placeholder={idx === 0 ? 'Tarea principal del día' : 'Otra cosa que hice…'}
                      className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                    />
                    {it.link && (
                      <a href={it.link} target="_blank" rel="noreferrer" title="Abrir la reunión de Teams"
                        className="shrink-0 p-1.5 rounded-lg hover:bg-slate-100" style={{ color: '#6264A7' }}>
                        <Video size={16} />
                      </a>
                    )}
                    {it.reunionId && (
                      <button type="button" onClick={() => cancelarReunionDeItem(it)}
                        title="Cancelar la reunión para todos (Outlook avisa)"
                        className="shrink-0 text-[10px] px-1.5 py-1 rounded-lg border border-red-200 text-red-500 hover:bg-red-50">
                        Cancelar<br/>reunión
                      </button>
                    )}
                    <span className="relative shrink-0" title="Horas dedicadas (vacío = comparte el resto del día)">
                      <input
                        type="number" min="0" max="12" step="0.5"
                        value={it.horas ?? ''}
                        onChange={(e) => setItem(idx, { horas: e.target.value === '' ? null : Number(e.target.value) })}
                        placeholder={it.text && it.text.trim() && !(Number(it.horas) > 0) ? String(horasAuto) : ''}
                        className="w-16 border border-slate-300 rounded-lg pl-2 pr-6 py-1.5 text-sm text-right"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none">hs</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleWip(idx)}
                      className={`px-2 py-1 rounded text-xs border ${it.wip ? 'bg-emerald-500 text-white border-emerald-500' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                      title="Marcar como foco principal (WIP)"
                    >
                      WIP
                    </button>
                    {items.length > 1 && (
                      <button type="button" onClick={() => quitarConAviso(idx)} title={it.reunionId ? 'Quitar solo de tu día' : 'Quitar'} className="text-slate-400 hover:text-red-500">×</button>
                    )}
                  </div>
                  <TagChips tags={it.tags} onAdd={(t) => addTag(idx, t)} onRemove={(t) => removeTag(idx, t)} catalogo={catalogoTags} />
                  {/* Clasificacion Metricas OV: nace clasificado desde el origen */}
                  {esItemOV(it) && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span className="text-[10px] text-slate-400">Ticket OV:</span>
                      <select value={it.ovTipo || ''}
                        onChange={(e) => setItem(idx, { ovTipo: e.target.value || null, ovPor: me?.nombre ?? null, ovFecha: new Date().toISOString().slice(0, 10) })}
                        className={`text-[11px] border rounded-lg px-1.5 py-1 ${it.ovTipo ? 'border-slate-300' : 'border-amber-300 bg-amber-50'}`}>
                        <option value="">— Tipo —</option>
                        {OV_TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                      </select>
                      <select value={it.ovCausa || ''}
                        onChange={(e) => setItem(idx, { ovCausa: e.target.value || null, ovPor: me?.nombre ?? null, ovFecha: new Date().toISOString().slice(0, 10) })}
                        className={`text-[11px] border rounded-lg px-1.5 py-1 ${it.ovCausa ? 'border-slate-300' : 'border-amber-300 bg-amber-50'}`}>
                        <option value="">— Causa —</option>
                        {OV_CAUSAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                      </select>
                      {!(it.ovTipo && it.ovCausa) && <span className="text-[10px] text-amber-600">sin clasificar (va a la bandeja de Metricas OV)</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-2 text-sm">
              <button type="button" onClick={addItem} className="text-coop-azul hover:underline">+ Agregar otra cosa</button>
              {itemsValidos.length > 0 && (
                <span className={`ml-2 text-[11px] ${excedido ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
                  {excedido
                    ? `Especificaste ${sumExpl} hs: supera las 8 del día`
                    : sinEspecificar > 0 && sumExpl > 0
                      ? `${sumExpl} hs especificadas · ${restoDia} hs restantes entre ${sinEspecificar} sin especificar (${horasAuto} hs c/u)`
                      : sinEspecificar > 0
                        ? `8 hs repartidas entre ${sinEspecificar} tarea${sinEspecificar > 1 ? 's' : ''} (${horasAuto} hs c/u)`
                        : `${sumExpl} hs especificadas en total`}
                </span>
              )}
              {weeklyWipText && !weeklyAlreadyItem && (
                <button type="button" onClick={() => setItems((arr) => [...arr, { text: weeklyWipText, wip: true, tags: [], horas: null }])} className="text-coop-azul hover:underline">
                  + Agregar WIP de la semana
                </button>
              )}
            </div>
          </div>
        )}

        {/* Horas extra */}
        <div className="mb-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={hsExtraOn} onChange={(e) => setHsExtraOn(e.target.checked)} />
            Cargar horas extra
          </label>
          {hsExtraOn && (
            <div className="flex flex-wrap items-end gap-3 mt-2">
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Ingreso</label>
                <input type="time" value={hsIng} onChange={(e) => setHsIng(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Salida</label>
                <input type="time" value={hsSal} onChange={(e) => setHsSal(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Total</label>
                <div className="font-mono text-sm text-slate-700 py-1.5">{hoursBetween(hsIng, hsSal).toFixed(1)} hs</div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center mt-5">
          <div>
            {entry && (
              <button onClick={handleDelete} className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">Borrar día</button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setReunionOpen(true)}
              title="Crear una reunión este día: evento en tu Outlook con invitaciones, e impacto en la grilla de todos los participantes"
              className="px-3 py-2 text-sm border border-coop-naranja text-coop-naranja rounded-lg hover:bg-coop-naranja/5">🗓 + Reunión</button>
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
            <button onClick={handleSave} className="px-4 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90">Guardar</button>
          </div>
        </div>
      </div>

      {reunionOpen && (
        <ReunionModal
          fechaInicial={fmtISO(dt)}
          onDone={() => { setReunionOpen(false); onReunionCreada?.(); }}
          onClose={() => setReunionOpen(false)}
        />
      )}
    </div>
  );
}
