import { useMemo } from 'react';
import { X } from 'lucide-react';

// Orden de avance del embudo (sin "perdido"): permite medir hasta qué etapa llegó cada lead.
const ORDEN = ['contacto', 'visita_agendada', 'visita_realizada', 'propuesta', 'negociacion', 'trial', 'ganado'];
const idx = (e) => ORDEN.indexOf(e);

const fmtUSD = (n) => 'US$ ' + Math.round(Number(n) || 0).toLocaleString('es-AR');
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);

function Kpi({ label, value, hint }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</div>
      <div className="text-xl font-semibold text-slate-800 leading-tight mt-0.5">{value}</div>
      {hint && <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}

export default function CRMMetricas({ open, leads, periodo, onClose }) {
  const m = useMemo(() => {
    const ls = leads || [];
    const total = ls.length;
    const noPerdidos = ls.filter((l) => l.etapa !== 'perdido');
    const alcanzaron = (e) => noPerdidos.filter((l) => idx(l.etapa) >= idx(e)).length;
    const oportunidad = alcanzaron('visita_agendada');
    const propuesta = alcanzaron('propuesta');
    const ganadoN = alcanzaron('ganado');

    const ganados = ls.filter((l) => l.etapa === 'ganado');
    const perdidos = ls.filter((l) => l.etapa === 'perdido');
    const montoGanado = ganados.reduce((s, l) => s + (Number(l.valorEstimadoUsd) || 0), 0);
    const pipeline = noPerdidos.filter((l) => l.etapa !== 'ganado').reduce((s, l) => s + (Number(l.valorEstimadoUsd) || 0), 0);

    const tiempos = ls.map((l) => {
      if (!l.presupuestoEnviadoFecha || !l.presupuestoAprobadoFecha) return null;
      const env = new Date(String(l.presupuestoEnviadoFecha).slice(0, 10) + 'T00:00:00');
      const apr = new Date(String(l.presupuestoAprobadoFecha).slice(0, 10) + 'T00:00:00');
      const d = Math.round((apr - env) / 86400000);
      return d >= 0 ? d : null;
    }).filter((v) => v != null);
    const tiempoMedio = tiempos.length ? Math.round(tiempos.reduce((s, v) => s + v, 0) / tiempos.length) : null;

    // Fuentes: "Otros" usa el detalle libre; vacío => "Sin especificar".
    const g = {};
    ls.forEach((l) => {
      let key = l.fuente;
      if (key === 'Otros' && l.fuenteOtra) key = l.fuenteOtra;
      if (!key) key = 'Sin especificar';
      g[key] = (g[key] || 0) + 1;
    });
    const fuentes = Object.entries(g).map(([fuente, count]) => ({ fuente, count })).sort((a, b) => b.count - a.count);
    const maxFuente = Math.max(1, ...fuentes.map((f) => f.count));

    return {
      total, oportunidad, propuesta, ganadoN,
      ganadosCount: ganados.length, perdidosCount: perdidos.length,
      montoGanado, ticket: ganados.length ? montoGanado / ganados.length : 0, pipeline,
      tiempoMedio,
      tasaPerdida: total ? perdidos.length / total : null,
      conv1: total ? oportunidad / total : null,
      conv2: oportunidad ? propuesta / oportunidad : null,
      conv3: propuesta ? ganadoN / propuesta : null,
      convGlobal: total ? ganados.length / total : null,
      fuentes, maxFuente,
    };
  }, [leads]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <div>
            <h3 className="font-semibold text-slate-800">Métricas de efectividad</h3>
            <p className="text-xs text-slate-500">{periodo === 'acumulado' ? 'Acumulado (todo el histórico)' : `Año ${periodo}`} · {m.total} lead{m.total === 1 ? '' : 's'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-100 text-slate-500"><X size={18} /></button>
        </div>

        <div className="p-4 flex flex-col gap-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Conversión del embudo</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Kpi label="Leads → Oportunidad" value={pct(m.conv1)} hint={`${m.oportunidad} de ${m.total}`} />
              <Kpi label="Oportunidad → Propuesta" value={pct(m.conv2)} hint={`${m.propuesta} de ${m.oportunidad}`} />
              <Kpi label="Propuesta → Ganado" value={pct(m.conv3)} hint={`${m.ganadoN} de ${m.propuesta}`} />
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Resultados</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Kpi label="Conversión global" value={pct(m.convGlobal)} hint={`${m.ganadosCount} ganados de ${m.total}`} />
              <Kpi label="Monto ganado" value={fmtUSD(m.montoGanado)} hint={`${m.ganadosCount} lead${m.ganadosCount === 1 ? '' : 's'}`} />
              <Kpi label="Ticket promedio" value={fmtUSD(m.ticket)} hint="por lead ganado" />
              <Kpi label="Pipeline activo" value={fmtUSD(m.pipeline)} hint="en juego, sin cerrar" />
              <Kpi label="Tasa de pérdida" value={pct(m.tasaPerdida)} hint={`${m.perdidosCount} perdido${m.perdidosCount === 1 ? '' : 's'}`} />
              <Kpi label="Tiempo medio de aprobación" value={m.tiempoMedio == null ? '—' : `${m.tiempoMedio} días`} hint="presupuesto enviado → aprobado" />
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Leads por fuente</div>
            {m.fuentes.length === 0 ? (
              <p className="text-sm text-slate-400 italic">Sin datos.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {m.fuentes.map((f) => (
                  <div key={f.fuente} className="flex items-center gap-2">
                    <div className="w-24 sm:w-32 shrink-0 text-xs text-slate-600 truncate text-right">{f.fuente}</div>
                    <div className="flex-1 bg-slate-100 rounded h-5 overflow-hidden">
                      <div className="h-full bg-coop-azul rounded" style={{ width: `${(f.count / m.maxFuente) * 100}%` }} />
                    </div>
                    <div className="w-8 shrink-0 text-xs font-mono text-slate-700 text-right">{f.count}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-400">Las conversiones se calculan sobre la etapa actual de cada lead (los perdidos no suman avance). Respetan el período y el criterio de fecha seleccionados arriba.</p>
        </div>
      </div>
    </div>
  );
}
