// Gráfico de ingresos mensuales por producto (barras apiladas) — SVG artesanal,
// mismo estilo que "Composición del costo" del Dashboard. Componente COMPARTIDO:
// lo usan la solapa Ingresos y el Dashboard con los mismos datos del endpoint
// GET /leads/ingresos (una sola lógica, dos pantallas).

const MESES_ABR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmtUSD = (n) => 'US$ ' + Math.round(Number(n || 0)).toLocaleString('es-AR');

// Colores por producto (marca Cooptech); los no listados rotan por el ciclo.
const COLOR_PRODUCTO = {
  '+Agua': '#0E9CD8',
  'Reconecta': '#F28F20',
  'CoopCloud': '#243E91',
  'Centinela': '#7C3AED',
  'Call Center': '#059669',
  'Antivirus ESET': '#0891B2',
  'Cooptech (consultoría)': '#334155',
  'Otro': '#94A3B8',
};
const CICLO = ['#0E9CD8', '#F28F20', '#243E91', '#7C3AED', '#059669', '#0891B2', '#334155', '#94A3B8'];
export const colorProducto = (producto, idx = 0) => COLOR_PRODUCTO[producto] || CICLO[idx % CICLO.length];

// serie: [{ producto, meses: number[12] }] · totalMes: number[12] · mesLimite: 1-12
export default function IngresosChart({ serie = [], totalMes = [], mesLimite = 12, anio }) {
  const hayDatos = totalMes.some((v) => v > 0);
  if (!hayDatos) {
    return <p className="text-sm text-slate-400">Sin ingresos registrados en {anio}. Se arman con los leads ganados (fecha de ganado + implementación y/o abono mensual).</p>;
  }
  const W = 760, H = 340, padX = 28, padTop = 26, padBot = 40;
  const areaH = H - padTop - padBot, yBase = padTop + areaH;
  const xStep = (W - padX * 2) / 12, barW = xStep * 0.6;
  const maxTotal = Math.max(...totalMes, 1);
  return (
    <>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" style={{ maxHeight: 340 }}>
          {MESES_ABR.map((label, i) => {
            const x = padX + i * xStep + (xStep - barW) / 2, cx = x + barW / 2;
            let y = yBase;
            const segs = [];
            serie.forEach((f, si) => {
              const v = f.meses[i] || 0;
              if (v <= 0) return;
              const h = (v / maxTotal) * areaH;
              y -= h;
              segs.push(<rect key={si} x={x} y={y} width={barW} height={h} fill={colorProducto(f.producto, si)}>
                <title>{`${f.producto} · ${label}: ${fmtUSD(v)}`}</title>
              </rect>);
            });
            return (
              <g key={i} opacity={i + 1 > mesLimite ? 0.35 : 1}>
                {segs}
                {totalMes[i] > 0 && <text x={cx} y={y - 5} textAnchor="middle" fontSize="9" fontWeight="600" fill="#475569">{fmtUSD(totalMes[i])}</text>}
                <text x={cx} y={yBase + 16} textAnchor="middle" fontSize="11" fill="#94a3b8">{label}</text>
              </g>
            );
          })}
          <line x1={padX} y1={yBase} x2={W - padX} y2={yBase} stroke="#e2e8f0" strokeWidth="1" />
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-slate-500">
        {serie.map((f, si) => (
          <span key={f.producto} className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: colorProducto(f.producto, si) }} />
            {f.producto} <span className="font-mono text-slate-400">{fmtUSD(f.meses.reduce((a, b) => a + b, 0))}</span>
          </span>
        ))}
      </div>
    </>
  );
}
