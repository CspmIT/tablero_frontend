export const PRODUCTOS_CRM = ['+Agua', 'Reconecta', 'Centinela', 'CoopCloud', 'Cooptech (consultoría)', 'Otro'];

export const TIPOS_ETAPA = [
  { v: 'unica', label: 'Única' },
  { v: 'por_equipo', label: 'Por equipo' },
];

export const COLUMNS = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'To-do' },
  { id: 'doing', label: 'Doing' },
  { id: 'done', label: 'Done' },
];

export const PRIORIDADES = [
  { v: 'baja', label: 'Baja', color: '#94a3b8' },
  { v: 'media', label: 'Media', color: '#1F76BB' },
  { v: 'alta', label: 'Alta', color: '#F28F20' },
  { v: 'urgente', label: 'Urgente', color: '#c0392b' },
];

export const ESTADOS_PROYECTO = [
  { v: 'activo', label: 'Activo' },
  { v: 'pausado', label: 'Pausado' },
  { v: 'cerrado', label: 'Cerrado' },
];

export const prioInfo = (v) => PRIORIDADES.find((p) => p.v === v) || PRIORIDADES[1];

export function fmtCorta(v) {
  if (!v) return '';
  const d = new Date(String(v).slice(0, 10) + 'T00:00:00');
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const hoyISO = () => new Date().toISOString().slice(0, 10);

// % de una card por unidades por equipo (cada unidad hecha = 100).
export function unidadesPct(unidades) {
  if (!Array.isArray(unidades) || unidades.length === 0) return 0;
  const done = unidades.filter((u) => u.hecho).length;
  return Math.round((100 * done) / unidades.length);
}
