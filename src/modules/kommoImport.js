// Importador de leads exportados desde Kommo (.xlsx) al CRM del tablero.
// Mapea las columnas de Kommo a los campos del lead, traduce el estatus a la etapa
// del embudo, resuelve el responsable por nombre y junta los datos que no tienen
// campo propio dentro de "notas". Filtra leads de prueba y sin nombre real.

const norm = (s) => String(s ?? '').trim().toLowerCase();
const tieneValor = (v) => v != null && String(v).trim() !== '';

// Estatus de Kommo -> etapa del embudo del tablero (mapeo validado con Leonardo).
const ETAPA_POR_ESTATUS = {
  'incoming leads': 'contacto',
  'contacto inicial': 'contacto',
  'identificación de oportunidad': 'visita_agendada',
  'identificacion de oportunidad': 'visita_agendada',
  'presentación inicial': 'visita_realizada',
  'presentacion inicial': 'visita_realizada',
  'evaluación proyecto': 'propuesta',
  'evaluacion proyecto': 'propuesta',
  'presentación de presupuesto': 'propuesta',
  'presentacion de presupuesto': 'propuesta',
  'readecuación de proyecto': 'negociacion',
  'readecuacion de proyecto': 'negociacion',
  'aprobación de proyecto': 'ganado',
  'aprobacion de proyecto': 'ganado',
  'implementacion': 'ganado',
  'implementación': 'ganado',
  'facturación': 'ganado',
  'facturacion': 'ganado',
  'rechazo de proyecto': 'perdido',
  'lead no calificado': 'perdido',
};

// Kommo exporta el teléfono como texto con una comilla simple adelante.
function limpiarTel(v) {
  let s = String(v ?? '').trim();
  if (s.startsWith("'")) s = s.slice(1);
  return s.trim();
}

// Fechas de Kommo ("DD.MM.YYYY HH:MM:SS") o Date de Excel -> "YYYY-MM-DD".
function aISO(v) {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

export function parseLeadsFromRows(rows, colaboradores) {
  const ownerByName = new Map();
  for (const c of (colaboradores || [])) ownerByName.set(norm(c.nombre), c.id);

  const leads = [];
  let omitidos = 0;
  const sinOwner = new Set();
  const porEtapa = {};

  for (const row of rows) {
    const get = (k) => row[k];
    const nombre = String(get('Nombre del lead') ?? '').trim();
    const contacto = String(get('Contacto principal') ?? '').trim();
    if (norm(nombre) === 'kommo demo') { omitidos++; continue; }
    // En Kommo muchos leads no tienen nombre de oportunidad (quedan "Lead #..."):
    // en esos casos uso el contacto como nombre, para no perderlos.
    const generico = !nombre || /^lead\s*#/i.test(nombre);
    let organizacion;
    if (!generico) organizacion = nombre;
    else if (contacto) organizacion = contacto;
    else { omitidos++; continue; }

    const respName = String(get('Responsable') ?? '').trim();
    let ownerId = null;
    if (respName) {
      ownerId = ownerByName.get(norm(respName)) ?? null;
      if (ownerId == null) sinOwner.add(respName);
    }

    const etapa = ETAPA_POR_ESTATUS[norm(get('Estatus del lead'))] || 'contacto';
    porEtapa[etapa] = (porEtapa[etapa] || 0) + 1;

    let telefono = limpiarTel(get('Teléfono oficina (contacto)'));
    if (!telefono) telefono = limpiarTel(get('Teléfono celular (contacto)'));

    // Productos desde etiquetas (Reconecta / +Agua); ignorar las de importación
    const productos = [];
    const etiquetas = String(get('Etiquetas del lead') ?? '');
    if (/reconecta/i.test(etiquetas)) productos.push('Reconecta');
    if (/\+\s*agua/i.test(etiquetas)) productos.push('+Agua');

    // Datos sin campo propio -> notas
    const notasPartes = [];
    if (tieneValor(get('Nota 1'))) notasPartes.push(String(get('Nota 1')).trim());
    if (tieneValor(get('Nota 2'))) notasPartes.push(String(get('Nota 2')).trim());
    const servicios = [];
    if (norm(get('Energia')) === 'si') servicios.push('Energía');
    if (norm(get('Agua')) === 'si') servicios.push('Agua');
    if (norm(get('Telecomunicaciones')) === 'si') servicios.push('Telecomunicaciones');
    if (norm(get('Otro Servicio')) === 'si') servicios.push('Otro servicio');
    if (servicios.length) notasPartes.push('Servicios: ' + servicios.join(', '));
    if (tieneValor(get('Habitantes'))) notasPartes.push('Habitantes: ' + String(get('Habitantes')).trim());
    if (tieneValor(get('Provincia'))) notasPartes.push('Provincia: ' + String(get('Provincia')).trim());
    if (tieneValor(get('Prioridad'))) notasPartes.push('Prioridad: ' + String(get('Prioridad')).trim());
    if (tieneValor(get('Cargo (contacto)'))) notasPartes.push('Cargo: ' + String(get('Cargo (contacto)')).trim());
    if (tieneValor(get('DECISOR'))) notasPartes.push('Decisor: ' + String(get('DECISOR')).trim());
    const notas = notasPartes.join('\n') || null;

    const presupuesto = Number(String(get('Presupuesto') ?? '0').replace(/[^\d.-]/g, '')) || 0;

    leads.push({
      organizacion,
      contactoNombre: contacto || null,
      email: String(get('Correo (contacto)') ?? '').trim() || null,
      telefono: telefono || null,
      ciudad: String(get('Localidad') ?? '').trim() || null,
      ownerId,
      etapa,
      fuente: String(get('Como llego a Cooptech') ?? '').trim() || null,
      fechaPrimerContacto: aISO(get('Fecha de Creación')),
      proximaAccionFecha: aISO(get('Tareas próximas')),
      valorEstimadoUsd: presupuesto,
      notas,
      productos,
    });
  }

  return { leads, omitidos, sinOwner: [...sinOwner], porEtapa };
}
