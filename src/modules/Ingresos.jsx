// Solapa "Ingresos" (ola 3, 07/08) — grupo Análisis, manager + gerencial.
// Mes a mes detallado por lead ganado (implementación + abono mensual) y
// debajo el gráfico de barras apiladas por producto (compartido con Dashboard).
// Fuente: GET /leads/ingresos — implementación = monto facturado ?? valor del
// presupuesto (mes de la fecha de ganado); abono = abono mensual ?? CoopCloud
// (desde la fecha de ganado hasta el mes corriente; ingresos, no proyección).
import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';
import IngresosChart, { colorProducto } from '../components/IngresosChart.jsx';

const MESES_ABR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmtUSD = (n) => 'US$ ' + Math.round(Number(n || 0)).toLocaleString('es-AR');
const fmtCorto = (n) => Math.round(Number(n || 0)).toLocaleString('es-AR');
const fmtFecha = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');

export default function Ingresos() {
  const { api } = useData();
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vivo = true;
    setCargando(true); setError(null);
    api.leads.ingresos(anio)
      .then((d) => { if (vivo) setDatos(d); })
      .catch((e) => { if (vivo) setError(e.message || 'No se pudo cargar'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [api, anio]);

  const detalle = datos?.detalle || [];
  const totalMes = datos?.totalMes || Array(12).fill(0);
  const totalAnio = totalMes.reduce((a, b) => a + b, 0);
  const mesLimite = datos?.mesLimite ?? 12;
  // MRR corriente: suma de abonos activos en el último mes con ingresos.
  const mrr = mesLimite >= 1 ? detalle.reduce((s, d) => s + (d.meses[mesLimite - 1]?.abono || 0), 0) : 0;
  const implementacionesAnio = detalle.reduce((s, d) => s + d.meses.reduce((x, m) => x + m.implementacion, 0), 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h2 className="text-xl font-semibold text-coop-negro flex items-center gap-2">
          <TrendingUp size={20} className="text-coop-naranja" /> Ingresos <span className="text-sm font-normal text-slate-400">{anio}</span>
        </h2>
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => setAnio(anio - 1)} className="px-2 py-1 rounded hover:bg-slate-100">‹</button>
          <span className="font-medium">{anio}</span>
          <button onClick={() => setAnio(anio + 1)} className="px-2 py-1 rounded hover:bg-slate-100">›</button>
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-3">Leads ganados: costo de implementación (una vez, al mes de ganado) + abono mensual (desde el mes de ganado). En US$.</p>

      {cargando && <p className="text-slate-500">Cargando ingresos…</p>}
      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">{error}</div>}

      {!cargando && !error && datos && (
        <>
          {datos.sinFecha?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-800 mb-3">
              <b>{datos.sinFecha.length}</b> lead{datos.sinFecha.length === 1 ? '' : 's'} ganado{datos.sinFecha.length === 1 ? '' : 's'} sin <b>fecha de ganado</b> (no entran al mes a mes): {datos.sinFecha.map((l) => l.organizacion).join(' · ')}. Completala desde la ficha en el CRM.
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 max-w-2xl">
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <p className="text-xs text-slate-400">Total {anio}</p>
              <p className="text-lg font-semibold text-coop-negro">{fmtUSD(totalAnio)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <p className="text-xs text-slate-400">Abonos activos ({mesLimite >= 1 ? MESES_ABR[mesLimite - 1] : '—'})</p>
              <p className="text-lg font-semibold text-coop-negro">{fmtUSD(mrr)}<span className="text-xs font-normal text-slate-400"> /mes</span></p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <p className="text-xs text-slate-400">Implementaciones {anio}</p>
              <p className="text-lg font-semibold text-coop-negro">{fmtUSD(implementacionesAnio)}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 overflow-x-auto">
            <p className="text-sm font-semibold text-slate-600 mb-2">Detalle mes a mes</p>
            {detalle.length === 0 ? (
              <p className="text-sm text-slate-400">Sin leads ganados con ingresos en {anio}.</p>
            ) : (
              <table className="text-xs min-w-[860px] w-full">
                <thead>
                  <tr className="text-slate-400">
                    <th className="text-left font-medium py-1 pr-2">Lead</th>
                    <th className="text-left font-medium py-1 pr-2">Ganado</th>
                    <th className="text-right font-medium py-1 pr-3">Impl. / Abono</th>
                    {MESES_ABR.map((m, i) => (
                      <th key={m} className={`text-right font-medium py-1 px-1.5 ${i + 1 > mesLimite ? 'text-slate-300' : ''}`}>{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detalle.map((d, di) => (
                    <tr key={d.id} className="border-t border-slate-100">
                      <td className="py-1.5 pr-2 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-sm inline-block shrink-0" style={{ background: colorProducto(d.producto, di) }} />
                          <span className="font-medium text-slate-700">{d.organizacion}</span>
                          <span className="text-slate-400">{d.productos.join(' + ')}</span>
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 text-slate-500 whitespace-nowrap">{fmtFecha(d.fechaGanado)}</td>
                      <td className="py-1.5 pr-3 text-right whitespace-nowrap text-slate-500">
                        {d.implementacion ? <span title={d.implementacionOrigen === 'facturado' ? 'Monto facturado' : 'Valor del presupuesto'}>{fmtCorto(d.implementacion)}</span> : '—'}
                        {' / '}
                        {d.abono ? <span title={d.abonoOrigen === 'coopcloud' ? 'Abono CoopCloud (automático)' : 'Abono mensual'}>{fmtCorto(d.abono)}<span className="text-slate-400">/m</span></span> : '—'}
                      </td>
                      {d.meses.map((m, i) => {
                        const total = m.implementacion + m.abono;
                        return (
                          <td key={i} className={`py-1.5 px-1.5 text-right font-mono ${total ? 'text-slate-700' : 'text-slate-200'}`}
                            title={total ? `${MESES_ABR[i]}: ${m.implementacion ? `implementación ${fmtCorto(m.implementacion)}` : ''}${m.implementacion && m.abono ? ' + ' : ''}${m.abono ? `abono ${fmtCorto(m.abono)}` : ''}` : undefined}>
                            {total ? fmtCorto(total) : '·'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 font-semibold text-slate-700">
                    <td className="py-1.5 pr-2" colSpan={3}>Total</td>
                    {totalMes.map((v, i) => (
                      <td key={i} className={`py-1.5 px-1.5 text-right font-mono ${v ? '' : 'text-slate-300'}`}>{v ? fmtCorto(v) : '·'}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-1 mb-3">
              <span className="text-sm font-semibold text-slate-600">Ingresos por producto · {anio}</span>
              <span className="text-xs text-slate-400">implementación + abonos, US$ por mes</span>
            </div>
            <IngresosChart serie={datos.serie} totalMes={totalMes} mesLimite={mesLimite} anio={anio} />
          </div>
        </>
      )}
    </div>
  );
}
