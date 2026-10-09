// Exportador de guardias al Excel del IMPORTADOR de RRHH (Mirko) — 09/10,
// primera pieza concreta del ítem 1 del backlog. Lógica PURA (sin React ni
// SheetJS): se testea sola; el modal de Guardias la usa para armar el archivo.
//
// Formato del importador (plantilla-guardias, relevada 09/10):
// - Hoja «Guardias»: Legajo · Empleado · Área · Inicio (dd/mm/aaaa) · Hora
//   inicio (HH:mm) · Fin (dd/mm/aaaa) · Hora fin (HH:mm) · Rol/turno · Gana
//   franco (sí/no).
// - UN BLOQUE del equipo completo POR SEMANA de guardia, copiado inmediatamente
//   abajo del anterior. Quien no hace guardia esa semana: el renglón queda con
//   legajo/nombre/área y el resto vacío.
// - Regla del teléfono (Leonardo): se recibe el PRIMER DÍA HÁBIL de la semana a
//   las 08:00 y se entrega el primer día hábil de la semana SIGUIENTE a las
//   08:00 (hábil = ni finde ni feriado — los puentes corren el inicio).
// - «Gana franco» solo admite «sí»: el importador no conoce el franco DOBLE
//   (feriado/puente). Esos casos salen en `francoDobles` para cargar el 2do a
//   mano — el xlsx va EXACTO al formato (decisión de Leonardo 09/10).
import { fmtISO, addDays } from './grillaUtils.js';
import { datesOfWeekObj, ganadosForAssignment } from './guardiasUtils.js';

export const ENCABEZADO_RRHH = ['Legajo', 'Empleado', 'Área', 'Inicio (dd/mm/aaaa)', 'Hora inicio (HH:mm)', 'Fin (dd/mm/aaaa)', 'Hora fin (HH:mm)', 'Rol/turno', 'Gana franco (sí/no)'];
export const AREA_DEFAULT = 'Dpto. IT';
// Hoja 2 de la plantilla, verbatim (instrucciones del importador para humanos).
export const HOJA_ROLES = [
  ['Área', 'Roles válidos (poné uno en la columna Rol/turno)'],
  ['Energía Eléctrica', 'Oficial de turno  ·  Ayudante de turno  ·  Jefe de turno'],
  ['Telefonía', 'Facilitador  ·  Técnico'],
  ['(otras áreas)', 'Sin rol — dejá la columna vacía'],
];

// Primer día hábil desde `desde` inclusive: ni sábado/domingo ni feriado.
export function primerHabil(desde, feriadosMap) {
  let d = new Date(desde);
  for (let i = 0; i < 14; i += 1) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6 && !(feriadosMap || {})[fmtISO(d)]) return d;
    d = addDays(d, 1);
  }
  return d; // 14 días sin hábiles no existe: defensa nomás
}

// Arma las filas del export y los avisos.
// - semanas: weekObjs TILDADOS (con asignaciones), de la grilla de Guardias.
// - roster: colaboradores que hacen guardia (activos), en el orden a listar.
// - mapping: { [colabId]: { legajo, nombre } } — el nombre con el que RRHH los
//   lista (suele ser «Apellido Nombre»); vacío = usa el nombre del tablero.
// - weeks: TODAS las semanas del año (para el puente a la semana siguiente).
// Devuelve { filas, francoDobles, faltanLegajos } — filas con Date para las
// fechas y '08:00' para las horas (el modal las escribe con el tipo correcto).
export function armarExportRrhh({ semanas, roster, mapping, area, feriadosMap, anio, weeks }) {
  const filas = [];
  const francoDobles = [];
  const faltan = new Set();
  const ordenadas = [...(semanas || [])].sort((a, b) => a.week - b.week);
  for (const w of ordenadas) {
    const ds = datesOfWeekObj(w, anio);
    if (!ds.length) continue;
    const inicio = primerHabil(ds[0], feriadosMap);
    const fin = primerHabil(addDays(ds[0], 7), feriadosMap);
    for (const c of roster) {
      const m = (mapping || {})[c.id] || {};
      const legajoCrudo = String(m.legajo ?? '').trim();
      const legajo = /^\d+$/.test(legajoCrudo) ? Number(legajoCrudo) : legajoCrudo;
      const nombre = String(m.nombre || '').trim() || c.nombre;
      const a = (w.asignaciones || []).find((x) => x.id === c.id && !x.vacation);
      if (a) {
        if (!legajoCrudo) faltan.add(nombre);
        filas.push([legajo, nombre, area, inicio, '08:00', fin, '08:00', '', 'sí']);
        const ganados = ganadosForAssignment(a, w, feriadosMap, anio, weeks);
        if (ganados >= 2) francoDobles.push({ nombre, week: w.week, range: w.range });
      } else {
        filas.push([legajo, nombre, area, '', '', '', '', '', '']);
      }
    }
  }
  return { filas, francoDobles, faltanLegajos: [...faltan] };
}

// Semanas exportables de un año: las que tienen al menos UNA guardia efectiva
// (vacaciones no cuentan — esa semana la persona no está de guardia).
export function semanasExportables(weeks) {
  return (weeks || []).filter((w) => (w.asignaciones || []).some((a) => !a.vacation));
}
