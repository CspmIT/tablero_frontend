export const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DOW_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Acepta "YYYY-MM-DD" o "MM-DD" y devuelve "MM-DD" (validado). Portado del standalone.
export function normalizeCumpleStr(s) {
  if (!s || typeof s !== 'string') return null;
  let mm, dd;
  const long = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const short = s.match(/^(\d{2})-(\d{2})$/);
  if (long) { mm = parseInt(long[2]); dd = parseInt(long[3]); }
  else if (short) { mm = parseInt(short[1]); dd = parseInt(short[2]); }
  else return null;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

export function fmtCumpleDisplay(mmdd) {
  const norm = normalizeCumpleStr(mmdd);
  if (!norm) return '—';
  const [mm, dd] = norm.split('-').map(Number);
  return `${String(dd).padStart(2, '0')} ${MONTHS_ES[mm - 1].slice(0, 3)}`;
}

// mm-dd a partir de los campos del colaborador (cumpleMes/cumpleDia), o null.
export const mmddFromCollab = (c) =>
  c.cumpleMes && c.cumpleDia ? `${String(c.cumpleMes).padStart(2, '0')}-${String(c.cumpleDia).padStart(2, '0')}` : null;

export function fmtFeriadoDate(iso) {
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
  const dmy = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  return { dmy, dow: DOW_ES[d.getDay()] };
}

export function cumpleDateInYear(mmdd, year) {
  const norm = normalizeCumpleStr(mmdd);
  if (!norm) return null;
  const [mm, dd] = norm.split('-').map(Number);
  return new Date(year, mm - 1, dd);
}

export function cumpleYaPaso(mmdd, today = new Date()) {
  const norm = normalizeCumpleStr(mmdd);
  if (!norm) return false;
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  const cd = cumpleDateInYear(norm, t.getFullYear());
  return cd <= t;
}
