// Enfoques: el backend guarda el enum en MAYÚSCULAS; acá mapeamos a etiqueta + color.
export const ENFOQUES = [
  { v: 'ORGANIZACION', label: 'Organización', color: '#243E91' },
  { v: 'ELECTRONICA', label: 'Electrónica', color: '#F28F20' },
  { v: 'DESARROLLO_WEB', label: 'Desarrollo web', color: '#1F76BB' },
  { v: 'COMERCIALIZACION', label: 'Comercialización', color: '#A51357' },
  { v: 'OPERACION', label: 'Operación', color: '#2f9e8c' },
];

export function enfoqueInfo(v) {
  return ENFOQUES.find((e) => e.v === v) || { v: null, label: 'Sin enfoque', color: '#94a3b8' };
}

// Sugiere el próximo código tipo "OE08" tomando el mayor número usado.
export function nextObjetivoCode(list) {
  let max = 0;
  for (const o of list || []) {
    const m = String(o.codigo || '').match(/(\d+)/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `OE${String(max + 1).padStart(2, '0')}`;
}

// % de un proyecto = promedio ponderado de sus tareas (done = 100, peso default 1).
export function computeProyectoPct(proyId, tareas) {
  const cs = (tareas || []).filter((t) => t.proyectoId === proyId);
  if (cs.length === 0) return null;
  let wSum = 0, num = 0;
  cs.forEach((t) => {
    const w = typeof t.weight === 'number' && t.weight > 0 ? t.weight : 1;
    const pct = t.kanbanCol === 'done' ? 100 : (typeof t.pct === 'number' ? t.pct : 0);
    wSum += w;
    num += pct * w;
  });
  return wSum > 0 ? Math.round(num / wSum) : 0;
}

// % auto de un objetivo = promedio de los % de sus proyectos linkeados.
export function computeObjetivoPctFromProyectos(objId, proyectos, tareas) {
  const ps = (proyectos || []).filter((p) => p.objetivoId === objId);
  if (ps.length === 0) return null;
  let count = 0, sum = 0;
  ps.forEach((p) => {
    const pct = computeProyectoPct(p.id, tareas);
    if (pct !== null) { sum += pct; count++; }
  });
  return count > 0 ? Math.round(sum / count) : null;
}

// Año de una fecha ISO o Date; null si no se puede leer.
function anioDe(v) {
  if (!v) return null;
  const m = String(v).match(/^(\d{4})/);
  if (m) return Number(m[1]);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.getFullYear();
}

// Objetivo 8: cada lead del año suma 0,5%; cada lead-evento suma 10% adicional. Sin tope.
export function computeObjetivoPctPorLeads(leads, anio) {
  const delAnio = (leads || []).filter((l) => anioDe(l.fechaPrimerContacto || l.createdAt) === anio);
  const eventos = delAnio.filter((l) => l.esEvento);
  const pct = delAnio.length * 0.5 + eventos.length * 10;
  return { pct: Math.round(pct), leads: delAnio.length, eventos: eventos.length };
}

// Objetivo 9: suma del valor estimado (US$) de los leads ganados con aprobación de presupuesto del año, sobre la meta. Sin tope.
export function computeObjetivoPctPorMonto(obj, leads, anio) {
  const meta = Number(obj.metaNumerica) || 0;
  const ganados = (leads || []).filter((l) => l.etapa === 'ganado' && anioDe(l.presupuestoAprobadoFecha) === anio);
  const monto = ganados.reduce((s, l) => s + (Number(l.valorEstimadoUsd) || 0), 0);
  const pct = meta > 0 ? Math.round((monto / meta) * 100) : 0;
  return { pct, monto, meta, count: ganados.length };
}

// Resuelve el avance según el modo: manual (override) > por_leads > por_monto_ganado > auto por proyectos.
export function resolveObjetivoPct(obj, proyectos, tareas, leads) {
  const am = obj.avanceManual == null ? null : Number(obj.avanceManual);
  const manual = typeof am === 'number' && !isNaN(am) && am > 0 ? Math.round(am * 100) : null;
  if (manual !== null) return { pct: manual, source: 'manual' };

  const anio = new Date().getFullYear();
  if (obj.calculo === 'por_leads') {
    const r = computeObjetivoPctPorLeads(leads, anio);
    return { pct: r.pct, source: 'leads', detalle: r };
  }
  if (obj.calculo === 'por_monto_ganado') {
    const r = computeObjetivoPctPorMonto(obj, leads, anio);
    return { pct: r.pct, source: 'monto', detalle: r };
  }
  const auto = computeObjetivoPctFromProyectos(obj.id, proyectos, tareas);
  if (auto !== null) return { pct: auto, source: 'auto' };
  return { pct: 0, source: 'none' };
}

export function iniciales(c) {
  if (c?.iniciales) return c.iniciales;
  return String(c?.nombre || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}
