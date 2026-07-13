import { useState } from 'react';
import * as XLSX from 'xlsx';
import { useData } from '../data/DataContext.jsx';
import { parseGrillaRows, parseTareasRows, mergeTareas } from './grillaXlsx.js';

const ESTADO_LABEL = {
  present: 'Presente', home_office: 'Home Office', vacaciones: 'Vacaciones', franco: 'Franco',
  franco_cumple: 'Franco cumpleaños', feriado: 'Feriado', licencia: 'Licencia', viaje: 'Viaje',
};

export default function ImportarGrilla() {
  const { api, colaboradores, recargar } = useData();
  const [hojas, setHojas] = useState([]);     // nombres de hojas-año detectadas
  const [wb, setWb] = useState(null);
  const [hoja, setHoja] = useState('');
  const [parsed, setParsed] = useState(null); // { entries, noMatch, porEstado, rango, bloques }
  const [estado, setEstado] = useState('idle'); // idle | corriendo | listo
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);

  const onArchivo = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(''); setParsed(null); setResultado(null);
    try {
      const buf = await f.arrayBuffer();
      const libro = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
      const anios = libro.SheetNames.filter((n) => /^\d{4}$/.test(n.trim()));
      if (!anios.length) { setError('No encontré ninguna hoja de año (ej. "2026") en el archivo.'); return; }
      setWb(libro); setHojas(anios);
      const def = anios.sort().reverse()[0];
      setHoja(def);
      analizar(libro, def);
    } catch (err) { setError('No pude leer el Excel: ' + (err.message || '')); }
  };

  const analizar = (libro, nombreHoja) => {
    const ws = libro.Sheets[nombreHoja];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    const res = parseGrillaRows(rows, colaboradores, Number(nombreHoja));
    // Si además existe una hoja "Tareas <año>", sumar esas actividades.
    const wsTareas = libro.Sheets[`Tareas ${nombreHoja}`];
    if (wsTareas) {
      const rowsT = XLSX.utils.sheet_to_json(wsTareas, { header: 1, raw: true, defval: '' });
      const tareasMap = parseTareasRows(rowsT, colaboradores, Number(nombreHoja));
      mergeTareas(res.entries, tareasMap);
    }
    res.conItems = res.entries.filter((e) => e.items && e.items.length).length;
    setParsed(res);
  };

  const cambiarHoja = (n) => { setHoja(n); setResultado(null); if (wb) analizar(wb, n); };

  const importar = async () => {
    if (!parsed?.entries.length) return;
    if (!window.confirm(`Se van a cargar ${parsed.entries.length} días de grilla del año ${hoja}. Se sobrescribe lo que ya exista en esos días. ¿Continuar?`)) return;
    setEstado('corriendo'); setResultado(null);
    try {
      const res = await api.grilla.bulk(parsed.entries);
      setResultado(res); setEstado('listo');
      if (recargar) recargar();
    } catch (err) { setEstado('idle'); setError(err.message || 'Error al importar.'); }
  };

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-semibold text-coop-negro mb-1">Importar grilla desde Excel</h2>
      <p className="text-sm text-slate-500 mb-5">Carga la grilla semanal (presencias, home office, viajes, licencias, francos, feriados) desde la planilla «Horario Flexible». Cada hoja de año contiene un año.</p>

      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="text-sm text-coop-azul hover:underline cursor-pointer">
            Elegir archivo .xlsx
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onArchivo} className="hidden" />
          </label>
          {hojas.length > 0 && (
            <span className="text-sm text-slate-600">
              Hoja (año):{' '}
              <select value={hoja} onChange={(e) => cambiarHoja(e.target.value)} className="border border-slate-300 rounded px-2 py-1 text-sm">
                {hojas.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </span>
          )}
        </div>
        {error && <p className="text-sm text-rose-600 mt-2">{error}</p>}
      </div>

      {parsed && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
          <div className="text-sm font-semibold text-slate-600 mb-2">
            Previsualización · <span className="text-coop-azul">{parsed.entries.length} días</span>
            {parsed.rango.desde && <span className="text-slate-400 font-normal"> · {parsed.rango.desde} a {parsed.rango.hasta} · {parsed.bloques} semanas</span>}
          </div>
          {parsed.conItems > 0 && <div className="text-xs text-slate-500 mb-2">{parsed.conItems} días con actividades cargadas.</div>}
          <div className="flex flex-wrap gap-3 mb-3">
            {Object.entries(parsed.porEstado).map(([k, v]) => (
              <span key={k} className="text-sm"><span className="text-slate-400">{ESTADO_LABEL[k] || k}:</span> <span className="font-mono">{v}</span></span>
            ))}
          </div>
          {parsed.noMatch.length > 0 && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">
              No encontré en el equipo a: <b>{parsed.noMatch.join(', ')}</b>. Esos colaboradores se omiten. Revisá que el nombre en Equipo coincida (nombre y apellido).
            </div>
          )}
          <button onClick={importar} disabled={!parsed.entries.length || estado === 'corriendo'}
            className="bg-coop-azul text-white text-sm rounded-lg px-4 py-2 disabled:opacity-40">
            {estado === 'corriendo' ? 'Importando…' : `Importar ${parsed.entries.length} días`}
          </button>
        </div>
      )}

      {resultado && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-sm font-semibold">
            <span className="text-emerald-600">{resultado.creados} días cargados</span>
            {resultado.errores?.length > 0 && <span className="text-rose-500"> · {resultado.errores.length} con error</span>}
          </div>
          {resultado.errores?.length > 0 && (
            <details className="mt-2"><summary className="text-xs text-slate-500 cursor-pointer">Ver errores</summary>
              <div className="mt-2 text-xs text-rose-600 space-y-1 max-h-40 overflow-auto">
                {resultado.errores.slice(0, 15).map((er, i) => <div key={i}>{er}</div>)}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
