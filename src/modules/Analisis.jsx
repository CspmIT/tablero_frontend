import { useState, useEffect, useCallback } from 'react';
import { BarChart3, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';

// Solapa "Reportes" (dentro del grupo Análisis). Primer reporte: horas extra
// por colaborador y mes.
// El dato sale de la grilla (horasExtra: ingreso/salida/duración); acá solo se
// agrupa y presenta. Regla de la casa: lo que no figura en el tablero no se considera.

const mesActual = () => new Date().toISOString().slice(0, 7);

export default function Analisis() {
  const { api } = useData();
  const [mes, setMes] = useState(mesActual);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [abiertos, setAbiertos] = useState({}); // colaboradorId -> bool

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setDatos(await api.analisis.horasExtra(mes));
    } catch (e) {
      setError(e.message || 'No se pudo cargar el reporte');
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [api, mes]);

  useEffect(() => { recargar(); }, [recargar]);

  const filas = datos?.colaboradores || [];

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            <BarChart3 size={20} className="text-coop-naranja" /> Reportes
          </h1>
          <p className="text-sm text-slate-500">Horas extra por colaborador, según lo registrado en la grilla.</p>
        </div>
        <label className="text-sm text-slate-600 flex items-center gap-2">
          Mes
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm
                       focus:outline-none focus:ring-2 focus:ring-coop-azul/40 focus:border-coop-azul" />
        </label>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">{error}</div>
      )}
      {cargando && <p className="text-slate-500 text-sm">Cargando…</p>}

      {!cargando && !error && (
        filas.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-500">
            Sin horas extra registradas en {mes}.
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-left">
                  <th className="px-4 py-2.5 font-medium">Colaborador</th>
                  <th className="px-4 py-2.5 font-medium text-center">Días con extra</th>
                  <th className="px-4 py-2.5 font-medium text-right">Total horas</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <Fila key={f.colaboradorId} fila={f}
                    abierto={!!abiertos[f.colaboradorId]}
                    onToggle={() => setAbiertos((a) => ({ ...a, [f.colaboradorId]: !a[f.colaboradorId] }))} />
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold text-slate-700 border-t border-slate-200">
                  <td className="px-4 py-2.5">Total del mes</td>
                  <td />
                  <td className="px-4 py-2.5 text-right flex items-center justify-end gap-1.5">
                    <Clock size={14} className="text-coop-naranja" /> {fmtHoras(datos.totalGeneral)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      )}

      <SeccionOciosidad api={api} />
      <SeccionExplorador api={api} />
      <SeccionRotacion api={api} />

    </div>
  );
}

// --- Ociosidad anual por colaborador (26/07): jornada 8 hs -------------------
function SeccionOciosidad({ api }) {
  const { colaboradores } = useData();
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [datos, setDatos] = useState(null);
  const [abierta, setAbierta] = useState(false);
  useEffect(() => {
    if (!abierta) return;
    api.analisis.ociosidad(anio).then(setDatos).catch(() => setDatos(null));
  }, [api, anio, abierta]);
  const filas = datos?.colaboradores || [];
  return (
    <div className="mt-8">
      <button onClick={() => setAbierta(a => !a)} className="flex items-center gap-2 text-slate-800 font-semibold">
        {abierta ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Ociosidad anual <span className="text-sm font-normal text-slate-400">(jornada de 8 hs)</span>
      </button>
      {abierta && (
        <div className="mt-3">
          <div className="flex items-center gap-2 mb-2 text-sm">
            <button onClick={() => setAnio(anio - 1)} className="px-2 py-0.5 rounded hover:bg-slate-100">‹</button>
            <span className="text-slate-600 font-medium">{anio}</span>
            <button onClick={() => setAnio(anio + 1)} className="px-2 py-0.5 rounded hover:bg-slate-100">›</button>
            {datos?.hasta && anio === new Date().getFullYear() && <span className="text-xs text-slate-400">· contado hasta {fmtFecha(datos.hasta)}</span>}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-200">
                  <th className="px-3 py-2 text-left">Colaborador</th>
                  <th className="px-3 py-2 text-right">Fin de semana</th>
                  <th className="px-3 py-2 text-right">Feriados</th>
                  <th className="px-3 py-2 text-right bg-slate-50">Semisuma calendario</th>
                  <th className="px-3 py-2 text-right">Vacaciones</th>
                  <th className="px-3 py-2 text-right">Francos</th>
                  <th className="px-3 py-2 text-right">Licencias</th>
                  <th className="px-3 py-2 text-right bg-slate-50">Semisuma personal</th>
                  <th className="px-3 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filas.map(f => (
                  <tr key={f.colaboradorId}>
                    <td className="px-3 py-2">{f.nombre}</td>
                    <td className="px-3 py-2 text-right font-mono">{f.horasFinde}</td>
                    <td className="px-3 py-2 text-right font-mono">{f.horasFeriados}</td>
                    <td className="px-3 py-2 text-right font-mono bg-slate-50">{f.semisumaCalendario}</td>
                    <td className="px-3 py-2 text-right font-mono">{f.horasVacaciones}</td>
                    <td className="px-3 py-2 text-right font-mono">{f.horasFrancos}</td>
                    <td className="px-3 py-2 text-right font-mono">{f.horasLicencias}</td>
                    <td className="px-3 py-2 text-right font-mono bg-slate-50">{f.semisumaPersonal}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-coop-azul">{f.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">Criterio: fin de semana y feriados (solo los que caen en día hábil) según calendario y vigencia del colaborador; vacaciones, francos (incl. cumpleaños) y licencias según el estado cargado en la grilla. Todo × 8 hs.</p>
        </div>
      )}
    </div>
  );
}

// --- Rotación de personal (26/07): activos/altas/bajas por mes ---------------
function SeccionRotacion({ api }) {
  const hoyMes = new Date().toISOString().slice(0, 7);
  const hace12 = () => { const d = new Date(); d.setMonth(d.getMonth() - 11); return d.toISOString().slice(0, 7); };
  const [desde, setDesde] = useState(hace12);
  const [hasta, setHasta] = useState(hoyMes);
  const [datos, setDatos] = useState(null);
  const [abierta, setAbierta] = useState(false);
  useEffect(() => {
    if (!abierta || !desde || !hasta || desde > hasta) return;
    api.analisis.rotacion(desde, hasta).then(setDatos).catch(() => setDatos(null));
  }, [api, abierta, desde, hasta]);

  const meses = datos?.meses || [];
  const maxAct = Math.max(1, ...meses.map(m => m.activos));
  const lblMes = (k) => { const [y, m] = k.split('-'); return `${m}/${y.slice(2)}`; };

  return (
    <div className="mt-8">
      <button onClick={() => setAbierta(a => !a)} className="flex items-center gap-2 text-slate-800 font-semibold">
        {abierta ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Rotación de personal <span className="text-sm font-normal text-slate-400">(activos, altas y bajas por mes)</span>
      </button>
      {abierta && (
        <div className="mt-3">
          <div className="flex items-center gap-2 mb-3 text-sm flex-wrap">
            <label className="text-slate-500">Desde</label>
            <input type="month" value={desde} onChange={(e) => setDesde(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1 text-sm" />
            <label className="text-slate-500">Hasta</label>
            <input type="month" value={hasta} onChange={(e) => setHasta(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1 text-sm" />
          </div>
          {meses.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
              <div className="flex items-end gap-2 min-w-fit" style={{ height: 150 }}>
                {meses.map((m) => (
                  <div key={m.mes} className="flex flex-col items-center gap-1 w-11 shrink-0" title={`${lblMes(m.mes)}: ${m.activos} activos · ${m.altas} altas · ${m.bajas} bajas`}>
                    <span className="text-[10px] font-mono text-slate-600">{m.activos}</span>
                    <div className="w-7 bg-coop-azul/80 rounded-t" style={{ height: `${Math.max(6, (m.activos / maxAct) * 100)}px` }} />
                    <div className="h-4 flex gap-0.5 text-[9px] font-mono">
                      {m.altas > 0 && <span className="text-emerald-600">+{m.altas}</span>}
                      {m.bajas > 0 && <span className="text-rose-500">−{m.bajas}</span>}
                    </div>
                    <span className="text-[9px] text-slate-400">{lblMes(m.mes)}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2">Barra = colaboradores activos en el mes (según períodos de vigencia). <span className="text-emerald-600">+altas</span> / <span className="text-rose-500">−bajas</span> del mes. Cuenta solo el equipo del área (manager/colaborador). Sin períodos cargados: cuenta si está activo hoy; un inactivo sin períodos no cuenta (cargale el período con su fecha de baja para que aparezca en el mes real).</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Explorador de etiquetas combinadas (AND / intersección) ----------------
// Años y colaboradores funcionan como "tags virtuales": chips del mismo AND.
function SeccionExplorador({ api }) {
  const { colaboradores } = useData();
  const [catalogo, setCatalogo] = useState([]);
  const [anios, setAnios] = useState([]);
  const [sel, setSel] = useState({ tags: [], anios: [], colabs: [] });
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [abierta, setAbierta] = useState(false);

  useEffect(() => {
    if (!abierta) return;
    api.etiquetas.uso().then(r => setCatalogo((r?.etiquetas || r?.tags || []).map(t => t.tag || t.nombre).filter(Boolean))).catch(() => {});
    api.analisis.rangoAnios().then(r => setAnios(r?.anios || [])).catch(() => {});
  }, [api, abierta]);

  useEffect(() => {
    const hay = sel.tags.length || sel.anios.length || sel.colabs.length;
    if (!hay) { setResultado(null); return; }
    setCargando(true);
    api.analisis.tagsCombo({
      tags: sel.tags.join(','), anios: sel.anios.join(','), colaboradores: sel.colabs.join(','),
    }).then(setResultado).catch(() => setResultado(null)).finally(() => setCargando(false));
  }, [api, sel]);

  const toggle = (grupo, valor) => setSel(s => ({
    ...s, [grupo]: s[grupo].includes(valor) ? s[grupo].filter(x => x !== valor) : [...s[grupo], valor],
  }));
  const Chip = ({ activo, onClick, children }) => (
    <button onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${activo ? 'bg-coop-azul text-white border-coop-azul' : 'bg-white text-slate-600 border-slate-200 hover:border-coop-azul/50'}`}>
      {children}
    </button>
  );

  return (
    <div className="mt-8">
      <button onClick={() => setAbierta(a => !a)} className="flex items-center gap-2 text-slate-800 font-semibold">
        {abierta ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Explorador de etiquetas <span className="text-sm font-normal text-slate-400">(combinaciones: suma solo lo que tiene TODO lo elegido)</span>
      </button>
      {abierta && (
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-xs text-slate-500 mb-1.5">Etiquetas</p>
            <div className="flex flex-wrap gap-1.5">
              {catalogo.map(t => <Chip key={t} activo={sel.tags.includes(t)} onClick={() => toggle('tags', t)}>{t}</Chip>)}
              {catalogo.length === 0 && <span className="text-xs text-slate-300">Sin etiquetas registradas aún</span>}
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1.5">Años <span className="text-slate-300">(autogenerados de las tareas)</span></p>
            <div className="flex flex-wrap gap-1.5">
              {anios.map(a => <Chip key={a} activo={sel.anios.includes(a)} onClick={() => toggle('anios', a)}>{a}</Chip>)}
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1.5">Colaboradores <span className="text-slate-300">(como etiqueta virtual)</span></p>
            <div className="flex flex-wrap gap-1.5">
              {(colaboradores || []).filter(c => c.activo !== false).map(c =>
                <Chip key={c.id} activo={sel.colabs.includes(c.id)} onClick={() => toggle('colabs', c.id)}>{c.nombre}</Chip>)}
            </div>
          </div>

          {cargando && <p className="text-sm text-slate-400">Calculando…</p>}
          {resultado && !cargando && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap gap-6 mb-3">
                <div><p className="text-xs text-slate-400">Horas declaradas</p><p className="text-2xl font-semibold text-coop-azul">{resultado.totalHoras.toLocaleString('es-AR')} hs</p></div>
                <div><p className="text-xs text-slate-400">Ítems</p><p className="text-2xl font-semibold text-slate-700">{resultado.items}</p></div>
                <div><p className="text-xs text-slate-400">Personas</p><p className="text-2xl font-semibold text-slate-700">{resultado.personas}</p></div>
              </div>
              {resultado.porColaborador.length > 0 && (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {resultado.porColaborador.map(f => (
                      <tr key={f.colaboradorId}>
                        <td className="py-1.5">{f.nombre}</td>
                        <td className="py-1.5 text-right font-mono">{f.horas.toLocaleString('es-AR')} hs</td>
                        <td className="py-1.5 text-right text-xs text-slate-400 w-20">{f.items} ítems</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {resultado.porAnio.length > 1 && (
                <p className="text-xs text-slate-500 mt-2">Por año: {resultado.porAnio.map(a => `${a.anio}: ${a.horas.toLocaleString('es-AR')} hs`).join(' · ')}</p>
              )}
              {resultado.itemsSinHoras > 0 && (
                <p className="text-xs text-amber-600 mt-2">⚠ {resultado.itemsSinHoras} ítem(s) de esta combinación no tienen horas declaradas y no suman.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Fila({ fila, abierto, onToggle }) {
  return (
    <>
      <tr onClick={onToggle}
        className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer select-none">
        <td className="px-4 py-2.5 flex items-center gap-2 text-slate-700">
          {abierto ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />}
          <span className="font-medium">{fila.nombre}</span>
          {fila.sector && <span className="text-xs text-slate-400">· {fila.sector}</span>}
        </td>
        <td className="px-4 py-2.5 text-center text-slate-600">{fila.dias.length}</td>
        <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{fmtHoras(fila.totalHoras)}</td>
      </tr>
      {abierto && (
        <tr className="border-t border-slate-100 bg-slate-50/60">
          <td colSpan={3} className="px-4 py-2">
            <table className="w-full text-xs text-slate-600">
              <tbody>
                {fila.dias.map((d) => (
                  <tr key={d.fecha}>
                    <td className="py-1 pl-6 w-32">{fmtFecha(d.fecha)}</td>
                    <td className="py-1">{d.ingreso && d.salida ? `${d.ingreso} → ${d.salida}` : '—'}</td>
                    <td className="py-1 text-right pr-2">{fmtHoras(d.horas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

function fmtHoras(h) {
  return `${(Math.round(Number(h) * 10) / 10).toLocaleString('es-AR')} hs`;
}

function fmtFecha(iso) {
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
}
