import { STATUS_TYPES } from './grillaUtils.js';

// Etiqueta de estado del día. Texto: viaje -> destino; presente -> hora; resto -> label.
export default function StatusBadge({ status, entryTime, viajeLabel }) {
  const cfg = STATUS_TYPES[status];
  if (!cfg) return null;
  const text = status === 'viaje' && viajeLabel ? viajeLabel : status === 'present' && entryTime ? entryTime : cfg.label;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium" style={{ background: cfg.bg, color: cfg.color }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
      {text}
    </span>
  );
}
