import { useState, useEffect } from 'react';
import {
  STATUS_TYPES, ENTRY_TIMES, isWorkingDay, hoursBetween, fmtDDMM,
} from './grillaUtils.js';

const FULL_DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm';

function TagChips({ tags, onAdd, onRemove }) {
  const [val, setVal] = useState('');
  const add = () => {
    const t = val.trim();
    if (t && !tags.includes(t)) onAdd(t);
    setVal('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-coop-azul/10 text-coop-azul text-xs">
          {t}
          <button type="button" onClick={() => onRemove(t)} className="hover:text-red-500">×</button>
        </span>
      ))}
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        placeholder="+ tag (Enter)"
        className="text-xs border border-slate-200 rounded px-2 py-0.5 w-28"
      />
    </div>
  );
}

export default function DayEditModal({ open, onClose, collaborator, date, entry, weeklyWipText, feriadoName, onSave }) {
  const [status, setStatus] = useState('present');
  const [entryTime, setEntryTime] = useState('08:00');
  const [viajeLabel, setViajeLabel] = useState('');
  const [items, setItems] = useState([{ text: '', wip: false, tags: [] }]);
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
            ? { text: it, wip: false, tags: [] }
            : { text: it?.text || '', wip: !!it?.wip, tags: Array.isArray(it?.tags) ? [...it.tags] : [] }))
        : [{ text: '', wip: false, tags: [] }];
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
      setItems(weeklyWipText ? [{ text: weeklyWipText, wip: true, tags: [] }] : [{ text: '', wip: false, tags: [] }]);
      setHsExtraOn(false);
      setHsIng('18:00');
      setHsSal('20:00');
    }
  }, [open, entry, weeklyWipText, feriadoName]);

  if (!open || !collaborator || !date) return null;

  const dt = date instanceof Date ? date : new Date(date + 'T00:00:00');
  const dayName = FULL_DAYS[dt.getDay()];
  // "Franco cumpleaños" disponible si el colaborador tiene cumple cargado y la fecha
  // es de su mes de cumpleaños en adelante (gate por mes, igual que canTakeCumpleOn).
  const showCumpleOption = !!(collaborator?.cumpleMes && collaborator?.cumpleDia) && dt.getMonth() >= (collaborator.cumpleMes - 1);

  const setItem = (i, patch) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => setItems((arr) => [...arr, { text: '', wip: false, tags: [] }]);
  const removeItem = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i));
  const toggleWip = (i) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, wip: !it.wip } : it)));
  const addTag = (i, t) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, tags: [...it.tags, t] } : it)));
  const removeTag = (i, t) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, tags: it.tags.filter((x) => x !== t) } : it)));

  const workingDay = isWorkingDay(status);
  const cleanItems = items.map((it) => ({
    text: it?.text || '',
    wip: !!it?.wip,
    tags: Array.isArray(it?.tags) ? it.tags.filter((t) => typeof t === 'string' && t.trim()) : [],
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
                    <button
                      type="button"
                      onClick={() => toggleWip(idx)}
                      className={`px-2 py-1 rounded text-xs border ${it.wip ? 'bg-emerald-500 text-white border-emerald-500' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                      title="Marcar como foco principal (WIP)"
                    >
                      WIP
                    </button>
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeItem(idx)} title="Quitar" className="text-slate-400 hover:text-red-500">×</button>
                    )}
                  </div>
                  <TagChips tags={it.tags} onAdd={(t) => addTag(idx, t)} onRemove={(t) => removeTag(idx, t)} />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-2 text-sm">
              <button type="button" onClick={addItem} className="text-coop-azul hover:underline">+ Agregar otra cosa</button>
              {weeklyWipText && !weeklyAlreadyItem && (
                <button type="button" onClick={() => setItems((arr) => [...arr, { text: weeklyWipText, wip: true, tags: [] }])} className="text-coop-azul hover:underline">
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
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
            <button onClick={handleSave} className="px-4 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
