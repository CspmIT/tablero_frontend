import { fmtISO, addDays, isActiveOnDate, activeDaysInRange, isInterno, collabsActiveInRange } from './grillaUtils.js';

export const UNIDADES = [
  { id: 'adm', label: 'Adm.', full: 'Administración' },
  { id: 'energia', label: 'Energía', full: 'Energía Eléctrica' },
  { id: 'agua', label: 'Agua', full: 'Agua Potable' },
  { id: 'tele', label: 'Tele.', full: 'Telecomunicaciones' },
  { id: 'canal50', label: 'Canal 50', full: 'Canal 50' },
  { id: 'cac', label: 'CAC', full: 'CAC' },
  { id: 'alm_taller', label: 'Alm./Taller', full: 'Almacén / Taller' },
  { id: 'serv_sociales', label: 'Serv. Soc.', full: 'Servicios Sociales' },
];

const NO_LABORABLES = new Set(['vacaciones', 'franco', 'franco_cumple', 'feriado', 'licencia']);

export function teamPersonDays(collabs, start, end) {
  return collabs.reduce((s, c) => s + activeDaysInRange(c, start, end), 0);
}

export function weekendPersonDays(collabs, start, end) {
  let total = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow === 0 || dow === 6) collabs.forEach((c) => { if (isActiveOnDate(c, cur)) total += 1; });
    cur.setDate(cur.getDate() + 1);
  }
  return total;
}

export function feriadosPersonDays(collabs, start, end, feriados) {
  if (!feriados) return 0;
  let total = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6 && feriados[fmtISO(cur)]) collabs.forEach((c) => { if (isActiveOnDate(c, cur)) total += 1; });
    cur.setDate(cur.getDate() + 1);
  }
  return total;
}

// Cuenta días por estado (de la grilla) por colaborador, en el año.
export function statusCountsByCollab(entries) {
  const out = {};
  for (const e of entries || []) {
    const id = e.colaboradorId;
    if (id == null) continue;
    if (!out[id]) out[id] = { vacaciones: 0, franco: 0, franco_cumple: 0, licencia: 0, feriado: 0 };
    if (e.estado in out[id]) out[id][e.estado] += 1;
  }
  return out;
}

// Resumen CPN Deusebio (en persona-días) para un año.
export function computeCostosAnio(colaboradores, entries, feriados, anio) {
  const yearStart = new Date(anio, 0, 1);
  const yearEnd = new Date(anio, 11, 31);
  const yearCollabs = colaboradores.filter((c) => isInterno(c) && activeDaysInRange(c, yearStart, yearEnd) > 0);
  const counts = statusCountsByCollab(entries);

  const cmt = teamPersonDays(yearCollabs, yearStart, yearEnd);
  const totalVacaciones = yearCollabs.reduce((s, c) => s + (counts[c.id]?.vacaciones || 0), 0);
  const cmp = cmt - totalVacaciones;
  const weekendPD = weekendPersonDays(yearCollabs, yearStart, yearEnd);
  const feriadosPD = feriadosPersonDays(yearCollabs, yearStart, yearEnd, feriados);
  const nap = cmp - weekendPD - feriadosPD;
  const totalFrancos = yearCollabs.reduce((s, c) => s + (counts[c.id]?.franco || 0) + (counts[c.id]?.franco_cumple || 0), 0);
  const totalLicencias = yearCollabs.reduce((s, c) => s + (counts[c.id]?.licencia || 0), 0);
  const ausentismoReal = totalFrancos + totalLicencias;
  const nar = nap - ausentismoReal;

  const ociosidadAnticipada = cmp - nap; // estructural: fines de semana + feriados
  const ociosidadOperativa = nap - nar;  // gestionable: francos + licencias
  const ociosidadTotal = ociosidadAnticipada + ociosidadOperativa;
  const calDays = Math.round((yearEnd - yearStart) / 86400000) + 1;

  return {
    cmt, cmp, nap, nar,
    totalVacaciones, weekendPD, feriadosPD, totalFrancos, totalLicencias, ausentismoReal,
    ociosidadAnticipada, ociosidadOperativa, ociosidadTotal,
    ociosidadPct: cmp > 0 ? Math.round((ociosidadTotal / cmp) * 100) : 0,
    fteEquivalente: calDays > 0 ? cmt / calDays : 0,
    headcount: yearCollabs.length,
  };
}

export { NO_LABORABLES };

// --- Distribución por unidad de negocio (semanal, por colaborador) ---
// asignaciones[colaboradorId] = { peso_pct, weeks: [ { unidades: { adm, energia, ... } } ] }.
// El costo del mes se reparte por peso_pct (peso del colaborador); las unidades se cargan
// semana por semana. Cooptech% (activable) = 1 − Σ(unidades) de cada semana.

// Semanas del mes: arrancan en el primer lunes >= día 1 (idéntico al standalone).
export function weeksOfMonth(monthKey) {
  if (!monthKey) return [];
  const [y, m] = monthKey.split('-').map(Number);
  let monday = new Date(y, m - 1, 1);
  const dow = monday.getDay() || 7;
  if (dow !== 1) monday.setDate(monday.getDate() + (8 - dow));
  const weeks = [];
  let n = 1;
  while (monday.getMonth() === m - 1 && monday.getFullYear() === y) {
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    weeks.push({ num: n, monday: new Date(monday), sunday: new Date(sunday) });
    monday.setDate(monday.getDate() + 7);
    n++;
  }
  return weeks;
}

export function sumUnidades(unidades) {
  return UNIDADES.reduce((s, u) => s + (parseFloat(unidades?.[u.id]) || 0), 0);
}

// Suma de los pesos asignados a cada unidad a lo largo de las semanas. El input ya esta en escala
// del mes (cada semana vale 1/nWeeks), por eso la suma da el peso de la unidad en el mes.
export function monthlyUnidadesSum(weeks) {
  const out = {};
  UNIDADES.forEach((u) => { out[u.id] = 0; });
  if (!weeks || weeks.length === 0) return out;
  weeks.forEach((w) => { UNIDADES.forEach((u) => { out[u.id] += parseFloat(w?.unidades?.[u.id]) || 0; }); });
  return out;
}

export function cooptechPctUnidades(unidades, pesoSemana = 1) {
  return Math.max(0, pesoSemana - sumUnidades(unidades));
}

// Fraccion interna de la semana dedicada a Cooptech (0..1), para el calculo de horas. Las unidades
// vienen en escala del mes (cada semana topea en 1/nWeeks), asi que la fraccion es 1 - nWeeks * suma.
export function cooptechFraccionSemana(unidades, nWeeks) {
  return Math.max(0, 1 - (nWeeks || 1) * sumUnidades(unidades));
}

// Horas activables del mes (Cooptech): por colaborador y semana, cooptechPct × horas productivas
// de lunes a viernes (activo, no feriado, sin estado no laborable). Idéntico al standalone.
export function horasActivablesMes(monthKey, collabs, asignaciones, feriados, entriesMap) {
  if (!asignaciones) return 0;
  let total = 0;
  const weeks = weeksOfMonth(monthKey);
  collabs.forEach((c) => {
    const ca = asignaciones[c.id];
    if (!ca?.weeks) return;
    ca.weeks.forEach((wk, idx) => {
      const w = weeks[idx];
      if (!w) return;
      const cpt = cooptechFraccionSemana(wk.unidades, weeks.length);
      let horasProd = 0;
      for (let i = 0; i < 5; i++) {
        const d = addDays(w.monday, i);
        if (!isActiveOnDate(c, d)) continue;
        const iso = fmtISO(d);
        const e = entriesMap?.[`${c.id}:${iso}`];
        const isFer = feriados?.[iso];
        if (isFer && (!e || e.estado === 'feriado')) continue;
        if (e && NO_LABORABLES.has(e.estado)) continue;
        horasProd += 8;
      }
      total += cpt * horasProd;
    });
  });
  return total;
}

// Resumen del mes: filas por colaborador (peso_pct + unidades promedio), totales por unidad,
// costo Cooptech y horas activables.
export function distribucionMes(monthKey, collabs, asignaciones, costoLaboralMes, feriados, entriesMap) {
  const internos = collabs.filter((c) => isInterno(c));
  const rows = [];
  const totalesPorUnidad = {};
  UNIDADES.forEach((u) => { totalesPorUnidad[u.id] = 0; });
  let cooptechCosto = 0;

  internos.forEach((c) => {
    const a = asignaciones?.[c.id] || {};
    const peso = Number(a.peso_pct) || 0;
    const unidades = monthlyUnidadesSum(a.weeks || []);
    const cpt = Math.max(0, 1 - sumUnidades(unidades));
    const costoIndiv = (Number(costoLaboralMes) || 0) * peso;
    UNIDADES.forEach((u) => { totalesPorUnidad[u.id] += costoIndiv * (unidades[u.id] || 0); });
    cooptechCosto += costoIndiv * cpt;
    rows.push({ id: c.id, nombre: c.nombre, peso, cpt, costoIndiv, unidades });
  });

  const horasActivables = horasActivablesMes(monthKey, internos, asignaciones, feriados, entriesMap);
  const pesoTotal = rows.reduce((s, r) => s + r.peso, 0);
  return { rows, totalesPorUnidad, cooptechCosto, horasActivables, pesoTotal };
}


// Tendencia mensual del año: costo laboral, horas activables, ocupación productiva.
export function calcMonthlyTrends(anio, costosMap, colaboradores, feriados, entriesMap, MONTHS) {
  const yearStart = new Date(anio, 0, 1);
  const yearEnd = new Date(anio, 11, 31);
  const yearCollabs = collabsActiveInRange(colaboradores, yearStart, yearEnd);
  const out = [];
  for (let m = 0; m < 12; m++) {
    const monthKey = `${anio}-${String(m + 1).padStart(2, '0')}`;
    const md = costosMap?.[monthKey];
    const costoLab = Number(md?.costoLaboral) || 0;
    const cotiz = Number(md?.cotizacionDolar) || 1;
    const horasActivables = horasActivablesMes(monthKey, colaboradores.filter((c) => isInterno(c)), md?.asignaciones || {}, feriados, entriesMap);
    const monthStart = new Date(anio, m, 1);
    const monthEnd = new Date(anio, m + 1, 0);
    let diasProd = 0, diasPotencial = 0;
    yearCollabs.forEach((c) => {
      const cur = new Date(monthStart);
      while (cur <= monthEnd) {
        const dow = cur.getDay();
        if (dow !== 0 && dow !== 6 && isActiveOnDate(c, cur)) {
          const iso = fmtISO(cur);
          diasPotencial++;
          const e = entriesMap?.[`${c.id}:${iso}`];
          const isFer = feriados?.[iso];
          const noTrabaja = (e && NO_LABORABLES.has(e.estado)) || (isFer && (!e || e.estado === 'feriado'));
          if (!noTrabaja) diasProd++;
        }
        cur.setDate(cur.getDate() + 1);
      }
    });
    const dist = distribucionMes(monthKey, colaboradores, md?.asignaciones || {}, costoLab, feriados, entriesMap);
    const costoCooptech = dist.cooptechCosto;
    const costoOperacion = Object.values(dist.totalesPorUnidad).reduce((s, v) => s + v, 0);
    out.push({ monthIdx: m, monthKey, label: (MONTHS?.[m] || monthKey).slice(0, 3), costoLab, cotiz, horasActivables, diasProd, diasPotencial, ocupacionPct: diasPotencial > 0 ? diasProd / diasPotencial : 0, costoCooptech, costoOperacion });
  }
  return out;
}
