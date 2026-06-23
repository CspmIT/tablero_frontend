// Parser de la planilla "Horario Flexible" (grilla semanal) -> entradas de grilla.
// Estructura por bloque de semana (se repite cada ~19 filas):
//   fila Week NN | fila fechas | fila días (Lun..Vie) | fila horas (06/07/08/09) + "Colaborador" | filas de colaboradores
// Cada día ocupa 4 columnas (06:00, 07:00, 08:00, 09:00). El nombre va en "Apellido, Nombre"/"Nombre, Apellido".

const HORAS = ['06:00', '07:00', '08:00', '09:00'];
const DIA_COLS = [1, 5, 9, 13, 17]; // col inicial de Lun, Mar, Mié, Jue, Vie (0-based)

const up = (v) => String(v == null ? '' : v).trim().toUpperCase();

// Separa el texto de tareas de una celda en ítems. Separadores: "/", ",", ";"
// y guion SOLO cuando está rodeado de espacios (para no romper nombres como "a-b-c").
function splitTareas(celda) {
  if (typeof celda !== 'string' || !celda.trim()) return [];
  return celda
    .split(/\s*[/;,]\s*|\s+[-–]\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text) => ({ text, wip: false, tags: [] }));
}

function toISO(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // dd/mm/yyyy
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

// Devuelve { estado, entryTime, viajeLabel } a partir de las 4 celdas de un día, o null si está vacío.
function estadoDeCeldas(celdas) {
  const idxX = celdas.findIndex((c) => up(c) === 'X');
  if (idxX >= 0) return { estado: 'present', entryTime: HORAS[idxX] || null, viajeLabel: null };
  const textoCelda = celdas.find((c) => up(c) && up(c) !== 'X');
  if (!textoCelda) return null;
  const t = up(textoCelda);
  if (t.includes('HOME OFFICE') || t.includes('HOMEOFFICE')) return { estado: 'home_office', entryTime: null, viajeLabel: null };
  if (t.includes('CUMPLE')) return { estado: 'franco_cumple', entryTime: null, viajeLabel: null };
  if (t.includes('FRANCO')) return { estado: 'franco', entryTime: null, viajeLabel: null };
  if (t.includes('VACACION')) return { estado: 'vacaciones', entryTime: null, viajeLabel: null };
  if (t.includes('LICENCIA')) return { estado: 'licencia', entryTime: null, viajeLabel: null };
  if (t.includes('VIAJE')) return { estado: 'viaje', entryTime: null, viajeLabel: String(textoCelda).trim().replace(/^VIAJE\s*/i, '') || 'Viaje' };
  if (t.includes('FERIADO')) return { estado: 'feriado', entryTime: null, viajeLabel: null };
  return null; // desconocido: no se importa
}

// Normaliza un nombre a un set de tokens (sin acentos, sin coma, en minúsculas).
export function tokensNombre(nombre) {
  return String(nombre || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
    .split(' ').filter(Boolean).sort();
}
function mismoNombre(a, b) {
  const ta = tokensNombre(a), tb = tokensNombre(b);
  if (!ta.length || !tb.length) return false;
  return ta.length === tb.length && ta.every((x, i) => x === tb[i]);
}

// Parser de la hoja "Tareas 20xx": una actividad por día (cols 2..6 = Lun..Vie).
// Devuelve un mapa `${colaboradorId}:${fecha}` -> texto de la actividad.
const TAREA_DIA_COLS = [2, 3, 4, 5, 6];
export function parseTareasRows(rows, colaboradores, anioEsperado) {
  const bloques = [];
  rows.forEach((r, i) => {
    for (const c of [0, 1]) {
      const v = r && r[c];
      if (typeof v === 'string' && v.trim().toLowerCase().startsWith('week')) { bloques.push(i); break; }
    }
  });
  const map = {};
  const matchCache = {};
  const resolver = (nombre) => {
    if (nombre in matchCache) return matchCache[nombre];
    const col = colaboradores.find((c) => mismoNombre(c.nombre, nombre));
    matchCache[nombre] = col ? col.id : null;
    return matchCache[nombre];
  };
  for (let b = 0; b < bloques.length; b++) {
    const start = bloques[b];
    const fin = b + 1 < bloques.length ? bloques[b + 1] : rows.length;
    const filaFechas = rows[start + 1] || [];
    const fechas = TAREA_DIA_COLS.map((c) => toISO(filaFechas[c]));
    for (let i = start + 4; i < fin; i++) {
      const r = rows[i]; if (!r) continue;
      const nombre = r[1];
      if (typeof nombre !== 'string' || !nombre.includes(',')) continue;
      const cid = resolver(nombre.trim());
      if (!cid) continue;
      TAREA_DIA_COLS.forEach((col, d) => {
        const fecha = fechas[d];
        const texto = r[col];
        if (!fecha || (anioEsperado && !fecha.startsWith(String(anioEsperado)))) return;
        if (typeof texto === 'string' && texto.trim()) map[`${cid}:${fecha}`] = texto.trim();
      });
    }
  }
  return map;
}

// Mezcla las actividades (tareasMap) dentro de las entradas de grilla.
// Si una actividad cae en un día sin asistencia cargada, crea un día "present" con esa actividad.
export function mergeTareas(entries, tareasMap) {
  let conItems = 0;
  const index = {};
  entries.forEach((e) => { index[`${e.colaboradorId}:${e.fecha}`] = e; });
  for (const [key, texto] of Object.entries(tareasMap || {})) {
    const item = { text: texto, wip: false, tags: [] };
    if (index[key]) {
      index[key].items = [item];
    } else {
      const [cid, fecha] = key.split(':');
      const nuevo = { colaboradorId: Number(cid), fecha, estado: 'present', entryTime: null, viajeLabel: null, items: [item] };
      entries.push(nuevo); index[key] = nuevo;
    }
    conItems++;
  }
  return { entries, conItems };
}

// Devuelve { entries:[{colaboradorId, fecha, estado, entryTime, viajeLabel}], noMatch:[nombres], porEstado, rango }.
export function parseGrillaRows(rows, colaboradores, anioEsperado) {
  // detectar inicios de bloque
  const bloques = [];
  rows.forEach((r, i) => {
    for (const c of [0, 1]) {
      const v = r && r[c];
      if (typeof v === 'string' && v.trim().toLowerCase().startsWith('week')) { bloques.push(i); break; }
    }
  });

  const entries = [];
  const noMatch = new Set();
  const matchCache = {};
  const resolver = (nombreHoja) => {
    if (nombreHoja in matchCache) return matchCache[nombreHoja];
    const col = colaboradores.find((c) => mismoNombre(c.nombre, nombreHoja));
    matchCache[nombreHoja] = col ? col.id : null;
    if (!col) noMatch.add(nombreHoja);
    return matchCache[nombreHoja];
  };

  for (let b = 0; b < bloques.length; b++) {
    const start = bloques[b];
    const fin = b + 1 < bloques.length ? bloques[b + 1] : rows.length;
    const filaFechas = rows[start + 1] || [];
    const filaColabInicio = start + 4; // Week, fechas, días, horas, colaboradores...
    // fechas por día
    const fechas = DIA_COLS.map((c) => toISO(filaFechas[c]));
    for (let i = filaColabInicio; i < fin; i++) {
      const r = rows[i]; if (!r) continue;
      const nombre = r[0];
      if (typeof nombre !== 'string' || !nombre.includes(',')) continue;
      const cid = resolver(nombre.trim());
      if (!cid) continue;
      // Fila de abajo: tareas del día (si no es otra fila de colaborador).
      const filaTareas = rows[i + 1];
      const hayTareas = filaTareas && !(typeof filaTareas[0] === 'string' && filaTareas[0].includes(','));
      DIA_COLS.forEach((col0, d) => {
        const fecha = fechas[d];
        if (!fecha || (anioEsperado && !fecha.startsWith(String(anioEsperado)))) return;
        const celdas = [r[col0], r[col0 + 1], r[col0 + 2], r[col0 + 3]];
        const est = estadoDeCeldas(celdas);
        const items = hayTareas ? splitTareas(filaTareas[col0]) : [];
        if (!est && items.length === 0) return;
        entries.push({
          colaboradorId: cid, fecha,
          ...(est || { estado: 'present', entryTime: null, viajeLabel: null }),
          items,
        });
      });
    }
  }

  const porEstado = {};
  let minF = null, maxF = null;
  for (const e of entries) {
    porEstado[e.estado] = (porEstado[e.estado] || 0) + 1;
    if (!minF || e.fecha < minF) minF = e.fecha;
    if (!maxF || e.fecha > maxF) maxF = e.fecha;
  }
  return { entries, noMatch: [...noMatch], porEstado, rango: { desde: minF, hasta: maxF }, bloques: bloques.length };
}
