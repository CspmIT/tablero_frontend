import { useState, useEffect, useCallback, useMemo } from 'react';
import { useData } from '../data/DataContext.jsx';
import ReunionModal from './ReunionModal.jsx';
import StatusBadge from './StatusBadge.jsx';
import SwitchVista from '../components/SwitchVista.jsx';
import { fmtISO, buildEntriesMap, isActiveCollab, isWorkingDay, STATUS_TYPES } from './grillaUtils.js';

// Vista "Mi mes" (pedido Carola, 07/07): calendario mensual de SOLO LECTURA por
// colaborador. Panorama completo de estados e ítems del mes; la edición sigue
// viviendo en la grilla semanal / Mi semana.

const mesActualStr = () => new Date().toISOString().slice(0, 7);
const MESES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function MiMes({ vista = 'mimes', setVista }) {
  const { api, me, colaboradores } = useData();
  const [mes, setMes] = useState(mesActualStr);
  const [colabId, setColabId] = useState(null); // null hasta resolver "yo"
  const [entries, setEntries] = useState({});
  const [feriadosMap, setFeriadosMap] = useState({});
  const [cargando, setCargando] = useState(true);
  const [diaAbierto, setDiaAbierto] = useState(null); // { fecha, dia, entry, feriado } (modal escritorio)
  const [selDia, setSelDia] = useState(() => fmtISO(new Date())); // día elegido en la vista móvil
  // Ola reuniones (16/07): próximas reuniones donde participo, con gestión.
  const [reuniones, setReuniones] = useState([]);
  const [puedoGestionar, setPuedoGestionar] = useState({});
  const [reunionModal, setReunionModal] = useState(null); // null | { reunion? }
  const cargarReuniones = useCallback(async () => {
    try {
      const r = await api.reuniones.list();
      setReuniones(r.reuniones || []);
      setPuedoGestionar(r.puedoGestionar || {});
    } catch { setReuniones([]); }
  }, [api]);
  useEffect(() => { cargarReuniones(); }, [cargarReuniones]);
  const cancelarReunion = async (r) => {
    if (!window.confirm(`¿Cancelar "${r.titulo}"? Outlook les avisa a todos y se quita de la grilla.`)) return;
    try {
      const res = await api.reuniones.cancelar(r.id);
      if (res.graphError) alert(res.graphError);
      cargarReuniones(); recargar?.();
    } catch (e) { alert(e.message || 'No se pudo cancelar'); }
  };

  const activos = colaboradores.filter(isActiveCollab);
  // Por defecto, el usuario logueado; si no está en la lista (p.ej. gerencial externo), el primero.
  useEffect(() => {
    if (colabId != null) return;
    const propio = activos.find((c) => c.id === me?.colaboradorId);
    if (propio) setColabId(propio.id);
    else if (activos.length) setColabId(activos[0].id);
  }, [me, activos, colabId]);

  const [anio, mesNum] = useMemo(() => mes.split('-').map(Number), [mes]);
  const primerDia = useMemo(() => new Date(anio, mesNum - 1, 1), [anio, mesNum]);
  const ultimoDia = useMemo(() => new Date(anio, mesNum, 0), [anio, mesNum]);

  const recargar = useCallback(async () => {
    if (!colabId) return;
    setCargando(true);
    try {
      const [ents, fers] = await Promise.all([
        api.grilla.list({ colaboradorId: colabId, desde: fmtISO(primerDia), hasta: fmtISO(ultimoDia) }),
        api.feriados.list(),
      ]);
      setEntries(buildEntriesMap(ents));
      const fmap = {};
      for (const f of (fers.data || fers || [])) fmap[String(f.fecha).slice(0, 10)] = f.nombre;
      setFeriadosMap(fmap);
    } finally {
      setCargando(false);
    }
  }, [api, colabId, primerDia, ultimoDia]);
  useEffect(() => { recargar(); }, [recargar]);

  // Semanas del mes: filas de lunes a viernes (la grilla registra días hábiles).
  const semanas = useMemo(() => {
    const filas = [];
    const d = new Date(primerDia);
    // Retroceder al lunes de la semana del día 1
    const dow = (d.getDay() + 6) % 7; // 0 = lunes
    d.setDate(d.getDate() - dow);
    while (d <= ultimoDia) {
      const fila = [];
      for (let i = 0; i < 5; i++) {
        fila.push(new Date(d));
        d.setDate(d.getDate() + 1);
      }
      d.setDate(d.getDate() + 2); // saltear el fin de semana
      filas.push(fila);
    }
    return filas;
  }, [primerDia, ultimoDia]);

  const cambiarMes = (delta) => {
    const nd = new Date(anio, mesNum - 1 + delta, 1);
    setMes(`${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}`);
  };

  const irAHoy = () => {
    setMes(mesActualStr());
    setSelDia(fmtISO(new Date()));
    // en el celu, deslizar hasta el detalle del día
    setTimeout(() => {
      document.getElementById('mimes-detalle')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  };

  const colab = activos.find((c) => c.id === colabId);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <SwitchVista vista={vista} setVista={setVista} />
        <div className="flex items-center gap-2">
          <select value={colabId ?? ''} onChange={(e) => setColabId(Number(e.target.value))}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
            {activos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <div className="inline-flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            <button onClick={() => cambiarMes(-1)} className="px-2.5 py-1 rounded-lg text-slate-500 hover:bg-white">‹</button>
            <span className="text-sm font-medium text-slate-700 px-2 min-w-[130px] text-center">
              {MESES_ES[mesNum - 1]} {anio}
            </span>
            <button onClick={() => cambiarMes(1)} className="px-2.5 py-1 rounded-lg text-slate-500 hover:bg-white">›</button>
          </div>
          <button onClick={irAHoy} className="px-3 py-1.5 rounded-lg text-sm border border-coop-azul text-coop-azul hover:bg-coop-azul/5">Hoy</button>
          <button onClick={() => setReunionModal({})} className="px-3 py-1.5 rounded-lg text-sm bg-coop-naranja text-white hover:opacity-90">+ Reunión</button>
        </div>
      </div>

      <p className="text-sm text-slate-500 mb-3">
        Calendario mensual de solo lectura{colab ? <> de <span className="font-medium text-slate-700">{colab.nombre}</span></> : ''}.
        Para editar un día, usá la grilla semanal.
      </p>

      {reuniones.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-3 mb-4">
          <p className="text-sm font-medium text-slate-600 mb-2">Mis próximas reuniones</p>
          <ul className="space-y-1.5">
            {reuniones.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm flex-wrap">
                <span className="text-xs text-slate-400 whitespace-nowrap">{String(r.fecha).slice(0, 10).split('-').reverse().join('/')} · {r.horaInicio}–{r.horaFin}</span>
                <span className="break-words min-w-0 flex-1">
                  {r.tipo === 'cliente' ? `Videollamada · ${r.titulo}` : r.titulo}
                  {r.modalidad === 'presencial' && r.lugar ? <span className="text-slate-400"> · {r.lugar}</span> : null}
                  {r.joinUrl && <a href={r.joinUrl} target="_blank" rel="noreferrer" className="text-coop-azul hover:underline ml-1.5">Teams</a>}
                </span>
                {puedoGestionar[r.id] && (
                  <span className="flex gap-1.5 shrink-0">
                    <button onClick={() => setReunionModal({ reunion: r })} className="text-xs border border-slate-300 px-2 py-1 rounded-lg hover:border-coop-azul hover:text-coop-azul">Reprogramar</button>
                    <button onClick={() => cancelarReunion(r)} className="text-xs border border-red-200 text-red-500 px-2 py-1 rounded-lg hover:bg-red-50">Cancelar</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {cargando ? <p className="text-slate-500 text-sm">Cargando…</p> : (<>
        {/* ============ Vista móvil (estilo app Calendar): mes completo de un
            vistazo, días pintados con los colores de la grilla, y detalle del
            día seleccionado debajo. ============ */}
        <div className="sm:hidden">
          <div className="grid grid-cols-5 gap-1 mb-1">
            {['L', 'M', 'X', 'J', 'V'].map((d) => (
              <span key={d} className="text-center text-[11px] font-medium text-slate-400">{d}</span>
            ))}
          </div>
          {semanas.map((fila, i) => (
            <div key={i} className="grid grid-cols-5 gap-1 mb-1">
              {fila.map((dia) => {
                const iso = fmtISO(dia);
                const delMes = dia.getMonth() === mesNum - 1;
                const entry = colabId ? entries[`${colabId}:${iso}`] : null;
                const feriado = feriadosMap[iso];
                const st = entry ? STATUS_TYPES[entry.status] : (feriado ? STATUS_TYPES.feriado : null);
                const esHoy = iso === fmtISO(new Date());
                const sel = iso === selDia;
                return (
                  <button key={iso} onClick={() => setSelDia(iso)}
                    className={`h-11 rounded-lg text-sm font-medium flex flex-col items-center justify-center relative ${
                      !delMes ? 'opacity-35' : ''
                    } ${sel ? 'ring-2 ring-coop-azul' : esHoy ? 'ring-1 ring-coop-azul/50' : ''}`}
                    style={st ? { background: st.bg, color: st.color } : { background: '#f8fafc', color: '#94a3b8' }}>
                    {dia.getDate()}
                    {entry?.horas_extra?.horas ? <span className="absolute top-0.5 right-1 text-[9px]">+</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
          {/* Leyenda compacta */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 mb-3">
            {Object.entries(STATUS_TYPES).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1 text-[10px] text-slate-500">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: v.color }} /> {v.label}
              </span>
            ))}
          </div>
          {/* Detalle del día seleccionado */}
          <div id="mimes-detalle" className="bg-white rounded-xl border border-slate-200 p-4 scroll-mt-4">
            {(() => {
              const entry = colabId ? entries[`${colabId}:${selDia}`] : null;
              const feriado = feriadosMap[selDia];
              const [ay, am, ad] = selDia.split('-').map(Number);
              const diaSel = new Date(ay, am - 1, ad);
              const items = (entry?.items || []).filter((it) => it && String(it.text || '').trim());
              const nombreDia = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][diaSel.getDay()];
              return (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-slate-800">{nombreDia} {ad} de {MESES_ES[am - 1]}</span>
                    {entry && <StatusBadge status={entry.status} entryTime={entry.entry_time} viajeLabel={entry.viaje_label} />}
                  </div>
                  {feriado && <p className="text-sm text-violet-600 mb-2">🎌 {feriado}</p>}
                  {items.length > 0 ? (
                    <ul className="space-y-2">
                      {items.map((it, j) => (
                        <li key={j} className="text-sm text-slate-700 border-b border-slate-50 pb-1.5">
                          <div className="flex items-start gap-1.5">
                            <span className={it.wip ? 'text-emerald-500' : 'text-slate-300'}>•</span>
                            <span className="break-words min-w-0 flex-1">{it.text}</span>
                            {it.link && (
                              <a href={it.link} target="_blank" rel="noreferrer" title="Abrir la reunión de Teams"
                                className="shrink-0" style={{ color: '#6264A7' }}>▶</a>
                            )}
                            {Number(it.horas) > 0 && <span className="text-xs text-slate-400 whitespace-nowrap">{it.horas} hs</span>}
                          </div>
                          {Array.isArray(it.tags) && it.tags.length > 0 && (
                            <div className="flex gap-1 flex-wrap mt-1 ml-4">
                              {it.tags.map((t, k) => <span key={k} className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{t}</span>)}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-400">{entry || feriado ? 'Sin actividades cargadas.' : 'Sin registro este día.'}</p>
                  )}
                  {entry?.horas_extra?.horas ? (
                    <p className="text-sm mt-2 text-coop-naranja font-medium">⏱ Horas extra: +{entry.horas_extra.horas} hs ({entry.horas_extra.ingreso} → {entry.horas_extra.salida})</p>
                  ) : null}
                </>
              );
            })()}
          </div>
        </div>

        {/* ============ Vista escritorio: la tabla de casillas fijas ============ */}
        <div className="overflow-x-auto hidden sm:block">
          <table className="w-full border-separate" style={{ borderSpacing: 4 }}>
            <thead>
              <tr>
                {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'].map((d) => (
                  <th key={d} className="text-left text-xs font-medium text-slate-500 px-2 pb-1 w-1/5">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {semanas.map((fila, i) => (
                <tr key={i}>
                  {fila.map((dia) => {
                    const iso = fmtISO(dia);
                    const delMes = dia.getMonth() === mesNum - 1;
                    const entry = colabId ? entries[`${colabId}:${iso}`] : null;
                    const feriado = feriadosMap[iso];
                    const items = (entry?.items || []).filter((it) => it && String(it.text || '').trim());
                    const sinTags = entry && isWorkingDay(entry.status) && items.length > 0
                      && items.filter((it) => !(Array.isArray(it.tags) && it.tags.length)).length;
                    const VISIBLES = 2;
                    const ocultos = Math.max(0, items.length - VISIBLES) + (feriado && items.length ? 0 : 0);
                    const hayContenido = entry || feriado;
                    return (
                      <td key={iso}
                        onClick={() => hayContenido && setDiaAbierto({ fecha: iso, dia, entry, feriado })}
                        className={`align-top rounded-lg border p-0 ${
                          delMes ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-50'
                        } ${hayContenido ? 'cursor-pointer hover:border-coop-azul/40' : ''}`}
                        style={{ width: '20%' }}>
                        {/* contenedor interno de altura DURA: la td de una tabla estira
                            con el contenido (height = mínimo), este div no. */}
                        <div className="p-2 overflow-hidden" style={{ height: 116 }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-slate-500">{dia.getDate()}</span>
                          <span className="flex items-center gap-1">
                            {sinTags ? (
                              <span title={`${sinTags} actividad${sinTags > 1 ? 'es' : ''} sin etiqueta`}
                                className="w-4 h-4 rounded-full bg-amber-100 text-amber-600 text-[10px] font-bold leading-4 text-center select-none">!</span>
                            ) : null}
                            {entry?.horas_extra?.horas ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-coop-naranja/15 text-coop-naranja font-medium">
                                +{entry.horas_extra.horas} hs
                              </span>
                            ) : null}
                          </span>
                        </div>
                        {feriado && <p className="text-[10px] text-violet-600 mb-1 truncate" title={feriado}>{feriado}</p>}
                        {entry && <StatusBadge status={entry.status} entryTime={entry.entry_time} viajeLabel={entry.viaje_label} />}
                        {items.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {items.slice(0, VISIBLES).map((it, j) => (
                              <li key={j} className="text-[11px] text-slate-600 truncate">· {it.text}</li>
                            ))}
                          </ul>
                        )}
                        {ocultos > 0 && (
                          <span className="inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                            +{ocultos} más
                          </span>
                        )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>)}

      {reunionModal && (
        <ReunionModal
          reunion={reunionModal.reunion || null}
          fechaInicial={selDia}
          onDone={() => { setReunionModal(null); cargarReuniones(); recargar?.(); }}
          onClose={() => setReunionModal(null)}
        />
      )}

      {diaAbierto && (
        <DiaDetalleModal ctx={diaAbierto} colaborador={colab} onClose={() => setDiaAbierto(null)} />
      )}
    </div>
  );
}

// Detalle de un día del calendario (solo lectura): estado, feriado, actividades
// completas con etiquetas y marca WIP, y horas extra. La edición sigue en la grilla.
function DiaDetalleModal({ ctx, colaborador, onClose }) {
  const { fecha, dia, entry, feriado } = ctx;
  const items = (entry?.items || []).filter((it) => it && String(it.text || '').trim());
  const fmt = dia.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold capitalize">{fmt}</h3>
        {colaborador && <p className="text-sm text-slate-500 mb-3">{colaborador.nombre}</p>}
        {feriado && <p className="text-sm text-violet-600 mb-2">Feriado: {feriado}</p>}
        {entry
          ? <div className="mb-3"><StatusBadge status={entry.status} entryTime={entry.entry_time} viajeLabel={entry.viaje_label} /></div>
          : <p className="text-sm text-slate-400 mb-3">Sin carga en la grilla.</p>}
        {items.length > 0 && (
          <ul className="space-y-2">
            {items.map((it, j) => (
              <li key={j} className="text-sm text-slate-700 border border-slate-100 rounded-lg px-3 py-2">
                <div className="flex items-start gap-1.5">
                  <span className={it.wip ? 'text-emerald-500' : 'text-slate-300'}>•</span>
                  <span className="break-words min-w-0">{it.text}</span>
                  {Number(it.horas) > 0 && <span className="text-xs text-slate-400 whitespace-nowrap ml-auto">{it.horas} hs</span>}
                </div>
                {Array.isArray(it.tags) && it.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-1.5 ml-4">
                    {it.tags.map((t) => (
                      <span key={t} className="px-2 py-0.5 rounded bg-coop-azul/10 text-coop-azul text-[11px]">{t}</span>
                    ))}
                  </div>
                ) : (
                  <p className="ml-4 mt-1 text-[11px] text-amber-600">Sin etiqueta — no suma a horas por proyecto</p>
                )}
              </li>
            ))}
          </ul>
        )}
        {entry?.horas_extra?.horas ? (
          <p className="text-sm text-slate-600 mt-3">
            Horas extra: <span className="font-medium text-coop-naranja">+{entry.horas_extra.horas} hs</span>
            {entry.horas_extra.ingreso && entry.horas_extra.salida ? ` (${entry.horas_extra.ingreso} → ${entry.horas_extra.salida})` : ''}
          </p>
        ) : null}
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-coop-negro text-white rounded-lg hover:opacity-90">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
