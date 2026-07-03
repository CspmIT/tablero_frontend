import { fmtISO, fmtDDMM, addDays } from './grillaUtils.js';

// Fechas (lun a dom) de una semana a partir de su `range` ("DD/MM al ...").
export function datesOfWeekObj(weekObj, anio) {
  if (!weekObj?.range) return [];
  const m = weekObj.range.match(/^(\d{1,2})\/(\d{1,2})/);
  if (!m) return [];
  const start = new Date(anio, parseInt(m[2]) - 1, parseInt(m[1]));
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
}

export function findGuardiaByMonday(guardias, monday, anio) {
  if (!guardias?.length || !monday) return null;
  const targetIso = fmtISO(monday);
  return guardias.find((g) => { const ds = datesOfWeekObj(g, anio); return ds[0] && fmtISO(ds[0]) === targetIso; }) || null;
}

export function bridgeDaysAtStart(weekObj, feriados, anio) {
  if (!feriados) return 0;
  const ds = datesOfWeekObj(weekObj, anio);
  let count = 0;
  for (let i = 0; i < 2; i++) { if (feriados[fmtISO(ds[i])]) count++; else break; }
  return count;
}
export function bridgeDaysToNext(weekObj, feriados, guardias, anio) {
  if (!guardias?.length) return 0;
  const ds = datesOfWeekObj(weekObj, anio);
  const nextMonday = addDays(ds[0], 7);
  const nextWeek = findGuardiaByMonday(guardias, nextMonday, anio);
  return nextWeek ? bridgeDaysAtStart(nextWeek, feriados, anio) : 0;
}
export function ferMidWeek(weekObj, feriados, anio) {
  if (!feriados) return [];
  const ds = datesOfWeekObj(weekObj, anio);
  const bridge = bridgeDaysAtStart(weekObj, feriados, anio);
  const startIdx = Math.max(bridge, 1);
  const res = [];
  for (let i = startIdx; i < ds.length; i++) {
    const day = ds[i].getDay(); // 0 = domingo, 6 = sábado
    if (day === 0 || day === 6) continue; // un feriado en fin de semana no suma franco adicional
    const iso = fmtISO(ds[i]);
    if (feriados[iso]) res.push({ date: iso, name: feriados[iso] });
  }
  return res;
}

// Máximo de francos que puede sumar una guardia en una semana.
export const MAX_FRANCOS = 2;

// Francos ganados por una guardia: 1 base + feriados mid-week + puente a la semana
// siguiente, topeado en MAX_FRANCOS (nunca más de 2 francos por semana).
export function ganadosForAssignment(assignment, weekObj, feriados, anio, guardias) {
  if (assignment.vacation) return 0;
  const total = 1 + ferMidWeek(weekObj, feriados, anio).length + bridgeDaysToNext(weekObj, feriados, guardias, anio);
  return Math.min(total, MAX_FRANCOS);
}

// Genera las semanas (lun a dom) del año, desde el primer lunes.
export function generateWeeks(anio) {
  let d = new Date(anio, 0, 1);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  const weeks = [];
  let n = 1;
  while (d.getFullYear() === anio) {
    const sun = addDays(d, 6);
    weeks.push({ week: n, monday: new Date(d), range: `${fmtDDMM(d)} al ${fmtDDMM(sun)}` });
    n++;
    d = addDays(d, 7);
  }
  return weeks;
}

// Mezcla las filas guardadas (por número de semana) sobre las semanas generadas.
export function mergeWeeks(anio, storedRows) {
  const byWeek = {};
  for (const r of storedRows || []) byWeek[r.week] = r;
  return generateWeeks(anio).map((w) => ({
    ...w,
    asignaciones: Array.isArray(byWeek[w.week]?.asignaciones) ? byWeek[w.week].asignaciones : [],
  }));
}

// Estado de una celda (none | assigned | vac) y transición al siguiente estado.
export function cellState(asignaciones, collabId) {
  const a = (asignaciones || []).find((x) => x.id === collabId);
  if (!a) return 'none';
  return a.vacation ? 'vac' : 'assigned';
}
export const nextState = (s) => (s === 'none' ? 'assigned' : s === 'assigned' ? 'vac' : 'none');

// Aplica un estado a una celda y devuelve las nuevas asignaciones (igual que saveGuardiaCell).
export function setCell(asignaciones, collabId, state) {
  const without = (asignaciones || []).filter((a) => a.id !== collabId);
  if (state === 'none') return without;
  if (state === 'vac') return [...without, { id: collabId, vacation: true }];
  return [...without, { id: collabId }];
}

// Set de ids de guardia (asignados, sin vacaciones) de una semana.
export function guardSetOf(weekObj) {
  return new Set((weekObj?.asignaciones || []).filter((a) => !a.vacation).map((a) => a.id));
}
