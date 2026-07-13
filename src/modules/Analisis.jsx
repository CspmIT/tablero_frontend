import { useState, useEffect, useCallback } from 'react';
import { BarChart3, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';

// Solapa "Análisis". Primer reporte: horas extra por colaborador y mes.
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
            <BarChart3 size={20} className="text-coop-naranja" /> Análisis
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
