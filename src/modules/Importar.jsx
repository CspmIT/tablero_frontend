import { useState } from 'react';
import { useData } from '../data/DataContext.jsx';

const SNIPPET = "copy(localStorage.getItem('it_horario_v1'))";

const LABELS = {
  colaboradores: 'Colaboradores', clientes: 'Clientes', tags: 'Etiquetas', objetivos: 'Objetivos',
  feriados: 'Feriados', plantillas: 'Plantillas', leads: 'Leads', proyectos: 'Proyectos',
  tareas: 'Tareas', grilla: 'Grilla', wips: 'WIP semanal', guardias: 'Guardias',
  francos: 'Francos especiales', carryover: 'Vacaciones acumuladas', costos: 'Costos',
};

export default function Importar() {
  const { api, recargar } = useData();
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState('idle'); // idle | corriendo | listo | error
  const [resultado, setResultado] = useState(null);
  const [mensajeError, setMensajeError] = useState('');
  const [reseteando, setReseteando] = useState(false);
  const [resetMsg, setResetMsg] = useState('');

  // Blanquea toda la base (doble confirmación). El backend además exige la palabra clave.
  const blanquear = async () => {
    if (!window.confirm('¿Borrar TODOS los datos de la base (colaboradores, grilla, leads, costos, todo)? Esta acción no se puede deshacer.')) return;
    if (!window.confirm('Confirmá de nuevo: la base va a quedar vacía para reimportar desde cero. ¿Blanquear todo?')) return;
    setReseteando(true); setResetMsg('');
    try {
      const res = await api.importarReset();
      setResetMsg(`Base blanqueada: ${res.total} registros borrados. Ya podés reimportar.`);
      setResultado(null); setEstado('idle');
      if (recargar) recargar();
    } catch (e) {
      setResetMsg('Error al blanquear: ' + (e.message || ''));
    } finally {
      setReseteando(false);
    }
  };

  const onArchivo = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setTexto(String(reader.result || ''));
    reader.readAsText(f);
  };

  const importar = async () => {
    let data;
    try {
      data = JSON.parse(texto);
    } catch {
      setEstado('error'); setMensajeError('El texto no es un JSON válido. Pegá el contenido exportado del standalone.');
      return;
    }
    if (!data || typeof data !== 'object' || !Array.isArray(data.collaborators)) {
      setEstado('error'); setMensajeError('El JSON no parece el volcado del tablero (falta "collaborators").');
      return;
    }
    if (!window.confirm('Esto va a cargar los datos en la base. Conviene hacerlo sobre una base recién migrada (vacía). ¿Continuar?')) return;
    setEstado('corriendo'); setMensajeError(''); setResultado(null);
    try {
      const res = await api.importar(data);
      setResultado(res); setEstado('listo');
      if (recargar) recargar();
    } catch (e) {
      setEstado('error'); setMensajeError(e.message || 'Error al importar.');
    }
  };

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-semibold text-coop-negro mb-1">Importar datos del standalone</h2>
      <p className="text-sm text-slate-500 mb-5">Trae todo lo que tenías cargado en la versión vieja (equipo, grilla, guardias, costos, leads, etc.) a la base nueva.</p>

      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-rose-700">Blanquear la base</div>
            <div className="text-xs text-rose-600 mt-0.5">Borra todos los datos para reimportar desde cero (evita duplicados y casos espurios).</div>
          </div>
          <button onClick={blanquear} disabled={reseteando}
            className="shrink-0 bg-rose-600 text-white text-sm rounded-lg px-4 py-2 hover:opacity-90 disabled:opacity-40">
            {reseteando ? 'Blanqueando…' : 'Blanquear todo'}
          </button>
        </div>
        {resetMsg && <div className="text-xs mt-2 text-rose-700">{resetMsg}</div>}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <div className="text-sm font-semibold text-slate-600 mb-2">1. Exportar desde el tablero viejo</div>
        <ol className="text-sm text-slate-600 list-decimal ml-5 space-y-1">
          <li>Abrí el archivo standalone (<span className="font-mono text-xs">Tablero_de_mando_standalone…html</span>) en el navegador.</li>
          <li>Abrí la consola (F12 → pestaña «Console»).</li>
          <li>Pegá esto y presioná Enter (copia los datos al portapapeles):
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="bg-slate-100 rounded px-2 py-1 text-xs font-mono break-all">{SNIPPET}</code>
              <button onClick={() => navigator.clipboard?.writeText(SNIPPET)} className="text-xs text-coop-azul hover:underline">copiar</button>
            </div>
          </li>
          <li>Volvé acá y pegá (Ctrl+V) en el cuadro de abajo, o subí el archivo <span className="font-mono text-xs">.json</span>.</li>
        </ol>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-slate-600">2. Pegar o subir</div>
          <label className="text-xs text-coop-azul hover:underline cursor-pointer">
            subir archivo .json
            <input type="file" accept="application/json,.json" onChange={onArchivo} className="hidden" />
          </label>
        </div>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={6}
          placeholder='Pegá acá el JSON exportado…'
          className="w-full border border-slate-200 rounded-lg px-3 py-2 font-mono text-xs" />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={importar} disabled={!texto.trim() || estado === 'corriendo'}
            className="bg-coop-azul text-white text-sm rounded-lg px-4 py-2 disabled:opacity-40">
            {estado === 'corriendo' ? 'Importando…' : 'Importar'}
          </button>
          {estado === 'error' && <span className="text-sm text-rose-600">{mensajeError}</span>}
        </div>
      </div>

      {resultado && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-sm font-semibold text-slate-600 mb-2">
            Resultado · <span className="text-emerald-600">{resultado.totalCreados} creados</span>
            {resultado.totalErrores > 0 && <span className="text-rose-500"> · {resultado.totalErrores} con error</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {Object.entries(resultado.detalle || {}).map(([k, v]) => (
                  <tr key={k}>
                    <td className="py-1.5 text-slate-600">{LABELS[k] || k}</td>
                    <td className="py-1.5 text-right font-mono text-emerald-600">{v.creados}</td>
                    <td className="py-1.5 text-right font-mono text-rose-400 w-20">{v.errores.length > 0 ? `${v.errores.length} err` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {Object.entries(resultado.detalle || {}).some(([, v]) => v.errores.length > 0) && (
            <details className="mt-3">
              <summary className="text-xs text-slate-500 cursor-pointer">Ver errores</summary>
              <div className="mt-2 text-xs text-rose-600 space-y-1 max-h-48 overflow-auto">
                {Object.entries(resultado.detalle).flatMap(([k, v]) => v.errores.slice(0, 10).map((er, i) => (
                  <div key={`${k}-${i}`}><span className="text-slate-400">{LABELS[k] || k}:</span> {er}</div>
                )))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
