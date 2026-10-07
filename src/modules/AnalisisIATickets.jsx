import { useEffect, useState } from 'react';

// ─────────────── Análisis IA de tickets recurrentes (07/10) ───────────────
// Pedido de Sofía (gerencia de administración): los tickets son carga humana
// y el mismo problema aparece escrito distinto — el agrupado lo hace la IA
// (semántico), y a partir de cómo se resolvieron propone soluciones de fondo.
// El último informe queda guardado en el backend: ABRIRLO no cuesta API;
// REGENERAR sí, por eso es de conducción y pide confirmación.
const IMPACTO_BADGE = {
  alto: 'bg-red-100 text-red-700',
  medio: 'bg-amber-100 text-amber-700',
  bajo: 'bg-slate-100 text-slate-600',
};
const fmtFecha = (f) => String(f).slice(0, 10).split('-').reverse().join('/');
const hoyISO = () => new Date().toISOString().slice(0, 10);
const mesesAtrasISO = (n) => {
  const d = new Date(); d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
};

export default function AnalisisIATickets({ api, puedeGenerar, onClose, onGenerado }) {
  const [analisis, setAnalisis] = useState(undefined); // undefined = cargando, null = nunca generado
  const [error, setError] = useState('');
  const [generando, setGenerando] = useState(false);
  const [confirmando, setConfirmando] = useState(false); // paso 2 del botón (cuesta API)
  const [desde, setDesde] = useState(mesesAtrasISO(6));
  const [hasta, setHasta] = useState(hoyISO());

  useEffect(() => {
    api.asistente.analisisTickets()
      .then((r) => setAnalisis(r?.analisis ?? null))
      .catch((e) => { setAnalisis(null); setError(e.message || 'No se pudo traer el último informe.'); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generar = async () => {
    setConfirmando(false);
    setGenerando(true);
    setError('');
    try {
      const r = await api.asistente.generarAnalisisTickets({ desde, hasta });
      setAnalisis(r?.analisis ?? null);
      onGenerado?.(); // 07/10 bis: el panel de informes del Asistente se refresca
    } catch (e) {
      setError(e.message || 'No se pudo generar el análisis.');
    } finally {
      setGenerando(false);
    }
  };

  const inf = analisis?.informe;
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center overflow-y-auto p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-6">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">✨ Análisis IA · tickets recurrentes</h3>
          {analisis?.generadoEl && (
            <span className="text-xs text-slate-400">
              Generado por {analisis.generadoPor || '—'} el {new Date(analisis.generadoEl).toLocaleDateString('es-AR')}{' '}
              · período {fmtFecha(analisis.periodo?.desde)} → {fmtFecha(analisis.periodo?.hasta)}
            </span>
          )}
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600 px-2">✕</button>
        </div>

        {/* Regenerar: SOLO conducción (cada corrida consume la API de IA) */}
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center gap-2 text-sm">
          {puedeGenerar ? (
            <>
              <span className="text-slate-500">Período a analizar:</span>
              <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)}
                disabled={generando} className="border border-slate-300 rounded-lg px-2 py-1 text-sm" />
              <span className="text-slate-400 text-xs">→</span>
              <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)}
                disabled={generando} className="border border-slate-300 rounded-lg px-2 py-1 text-sm" />
              {generando ? (
                <span className="text-coop-azul flex items-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-coop-azul border-t-transparent rounded-full animate-spin" />
                  Analizando los tickets… suele tardar 1 a 2 minutos. No cierres esta ventana.
                </span>
              ) : confirmando ? (
                <span className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500">Consume la API de IA, ¿generar?</span>
                  <button onClick={generar} className="px-2.5 py-1 rounded-lg bg-coop-azul text-white text-sm">Sí, generar</button>
                  <button onClick={() => setConfirmando(false)} className="px-2.5 py-1 rounded-lg border border-slate-300 text-slate-500 text-sm">No</button>
                </span>
              ) : (
                <button onClick={() => setConfirmando(true)}
                  className="px-3 py-1.5 rounded-lg bg-coop-azul text-white text-sm hover:opacity-90">
                  {analisis ? 'Regenerar informe' : 'Generar informe'}
                </button>
              )}
            </>
          ) : (
            <span className="text-xs text-slate-400">El informe lo genera la conducción (manager/gerencial); acá ves el último generado.</span>
          )}
        </div>

        <div className="px-5 py-4">
          {error && (
            <div className="mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 flex items-center justify-between gap-2">
              <span>{error}</span>
              <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">✕</button>
            </div>
          )}

          {analisis === undefined && <p className="text-sm text-slate-400">Cargando…</p>}

          {analisis === null && !generando && (
            <p className="text-sm text-slate-500">
              Todavía no hay ningún informe generado. {puedeGenerar
                ? 'Elegí el período y generá el primero: la IA agrupa los tickets que describen el mismo problema (aunque estén escritos distinto) y propone soluciones de fondo.'
                : 'Pedile a la conducción que genere el primero.'}
            </p>
          )}

          {inf && (
            <>
              <div className="mb-4 bg-coop-azul/5 border border-coop-azul/20 rounded-xl px-4 py-3">
                <p className="text-xs font-semibold text-coop-azul uppercase tracking-wide mb-1">Resumen</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{inf.resumen}</p>
                <p className="text-[11px] text-slate-400 mt-2">
                  {analisis.totalAnalizados < analisis.totalPeriodo
                    ? `Se analizaron los ${analisis.totalAnalizados} tickets más recientes de los ${analisis.totalPeriodo} del período (tope del informe).`
                    : `Se analizaron los ${analisis.totalAnalizados} tickets del período.`}
                  {' '}El agrupado lo hace la IA: verificá los ids antes de tomar decisiones.
                </p>
              </div>

              {inf.grupos.length === 0 && (
                <p className="text-sm text-slate-500">La IA no encontró problemas que se repitan en el período.</p>
              )}

              <div className="grid gap-3">
                {inf.grupos.map((g, i) => (
                  <div key={i} className="border border-slate-200 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="text-sm font-semibold text-slate-800">{g.patron}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-coop-azul/10 text-coop-azul">{g.frecuencia} tickets</span>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded ${IMPACTO_BADGE[g.impacto] || IMPACTO_BADGE.medio}`}>impacto {g.impacto}</span>
                    </div>
                    <p className="text-sm text-slate-600 mb-1"><span className="text-slate-400">Síntoma:</span> {g.sintoma}</p>
                    {g.solucionTipica && (
                      <p className="text-sm text-slate-600 mb-1"><span className="text-slate-400">Cómo se viene resolviendo:</span> {g.solucionTipica}</p>
                    )}
                    <p className="text-sm text-slate-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5 mt-1.5">
                      <span className="font-medium text-emerald-700">Solución de fondo propuesta:</span> {g.propuestaDeFondo}
                    </p>
                    {g.ticketIds?.length > 0 && (
                      <p className="text-[11px] text-slate-400 mt-1.5">
                        Tickets: {g.ticketIds.map((id) => `#${id}`).join(', ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
