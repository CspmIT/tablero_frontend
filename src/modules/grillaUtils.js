// Utilidades de Grilla / WIP — portadas del standalone (misma lógica exacta),
// adaptadas a los nombres de campo del backend (estado/entryTime/viajeLabel/horasExtra,
// tipo, activo, nombre, fechaIngreso/fechaSalida, periodos[{desde,hasta}]).

export const STATUS_TYPES = {
  present: { label: 'Presente', color: '#2f9e8c', bg: '#e2f2ee' },
  home_office: { label: 'Home Office', color: '#1F76BB', bg: '#e7f1f9' },
  vacaciones: { label: 'Vacaciones', color: '#b45309', bg: '#fdeede' },
  franco: { label: 'Franco', color: '#A51357', bg: '#f7e4ee' },
  franco_cumple: { label: 'Franco cumpleaños', color: '#d4537e', bg: '#fae6ed' },
  feriado: { label: 'Feriado', color: '#64748b', bg: '#eaedf2' },
  licencia: { label: 'Licencia', color: '#c0392b', bg: '#fbe6e6' },
  viaje: { label: 'Viaje', color: '#243E91', bg: '#e6ebf6' },
};

export const FRANCO_STATUSES = new Set(['franco', 'franco_cumple']);
export const NON_WORKING_STATUSES = new Set(['franco', 'franco_cumple', 'feriado', 'vacaciones', 'licencia']);
export const isWorkingDay = (status) => !!status && !NON_WORKING_STATUSES.has(status);

export const ENTRY_TIMES = ['06:00', '07:00', '08:00', '09:00'];
export const DAYS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

// --- Semana ---
export function getMonday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}
export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
export function fmtISO(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
export function fmtDDMM(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
}
export function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}
export function getWeekKey(collaboratorId, weekStart) {
  const w = getISOWeek(weekStart);
  return `${collaboratorId}:${weekStart.getFullYear()}-W${String(w).padStart(2, '0')}`;
}
export function hoursBetween(ingreso, salida) {
  if (!ingreso || !salida) return 0;
  const [hi, mi] = ingreso.split(':').map(Number);
  const [hs, ms] = salida.split(':').map(Number);
  return Math.max(0, hs + ms / 60 - (hi + mi / 60));
}

// --- WIP ---
export function computeDailyWipPct(entry) {
  if (!entry || !isWorkingDay(entry.status)) return null;
  const valid = (entry.items || []).filter((it) => it && it.text && it.text.trim());
  if (valid.length === 0) return 0;
  const wipCount = valid.filter((it) => it.wip).length;
  return wipCount / valid.length;
}
export function computeWeeklyWipStats(collaboratorId, weekStart, entries) {
  let sum = 0;
  let workedDays = 0;
  for (let i = 0; i < 5; i++) {
    const d = addDays(weekStart, i);
    const e = entries[`${collaboratorId}:${fmtISO(d)}`];
    const pct = computeDailyWipPct(e);
    if (pct === null) continue;
    workedDays++;
    sum += pct;
  }
  return { workedDays, wipPctAvg: workedDays > 0 ? sum / workedDays : null };
}
export function fmtWipHours(stats) {
  if (!stats || stats.wipPctAvg === null) return null;
  const h = stats.wipPctAvg * stats.workedDays * 8;
  const r = Math.round(h * 10) / 10;
  return Number.isInteger(r) ? `${r}h` : `${r.toFixed(1)}h`;
}

// Dedicación de la semana: horas WIP sobre la semana completa de 40h.
// = wipPctAvg × díasTrabajados / 5. Un día de WIP de 5 = 20%; la semana entera = 100%.
export function dedicacionSemanalPct(stats) {
  if (!stats || stats.wipPctAvg === null) return null;
  return Math.min(1, (stats.wipPctAvg * stats.workedDays) / 5);
}

// --- Actividad por períodos (para mostrar solo los activos en la semana) ---
const d10 = (v) => (v ? String(v).slice(0, 10) : null);

export const isActiveCollab = (c) => c.activo !== false;
export const isInterno = (c) => c.tipo !== 'externo' && c.tipo !== 'gerencial' && c.tipo !== 'tercerizado';

export function ensurePeriodos(collab) {
  if (Array.isArray(collab.periodos) && collab.periodos.length > 0) {
    return collab.periodos.filter((p) => p && p.desde).map((p) => ({ desde: d10(p.desde), hasta: d10(p.hasta) }));
  }
  return [{ desde: d10(collab.fechaIngreso) || '2020-01-01', hasta: d10(collab.fechaSalida) }];
}
export function isActiveOnDate(collab, date) {
  const periodos = ensurePeriodos(collab);
  const d = date instanceof Date ? date : new Date(date + 'T00:00:00');
  const dISO = fmtISO(d);
  return periodos.some((p) => {
    const desdeOK = !p.desde || p.desde <= dISO;
    const hastaOK = !p.hasta || dISO <= p.hasta;
    return desdeOK && hastaOK;
  });
}
export function activeDaysInRange(collab, start, end) {
  const periodos = ensurePeriodos(collab);
  let total = 0;
  periodos.forEach((p) => {
    const pStart = p.desde ? new Date(p.desde + 'T00:00:00') : new Date(2000, 0, 1);
    const pEnd = p.hasta ? new Date(p.hasta + 'T00:00:00') : new Date(2999, 0, 1);
    const s = pStart > start ? pStart : start;
    const e = pEnd < end ? pEnd : end;
    if (e >= s) total += Math.floor((e - s) / 86400000) + 1;
  });
  return total;
}
export function collabsActiveInRange(collaborators, start, end) {
  return collaborators.filter((c) => isInterno(c) && activeDaysInRange(c, start, end) > 0);
}

// --- Mapas backend -> memoria ---
// Entradas: clave `${colaboradorId}:${YYYY-MM-DD}` con la forma que usa la lógica de WIP.
export function buildEntriesMap(rows) {
  const map = {};
  for (const r of rows || []) {
    map[`${r.colaboradorId}:${String(r.fecha).slice(0, 10)}`] = {
      status: r.estado,
      entry_time: r.entryTime || null,
      viaje_label: r.viajeLabel || null,
      items: Array.isArray(r.items) ? r.items : [],
      horas_extra: r.horasExtra || null,
    };
  }
  return map;
}
// WIP semanal: clave igual a getWeekKey -> `${colaboradorId}:${anio}-W${semana}`.
export function buildWipsMap(rows) {
  const map = {};
  for (const r of rows || []) {
    map[`${r.colaboradorId}:${r.anio}-W${String(r.semanaIso).padStart(2, '0')}`] = r.texto;
  }
  return map;
}
