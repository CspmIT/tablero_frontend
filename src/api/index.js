import { http, postSSE } from './client.js';

// Helper para generar el CRUD estándar de un recurso.
function recurso(path) {
  return {
    list: (query) => http.get(path, query),
    get: (id) => http.get(`${path}/${id}`),
    create: (body) => http.post(path, body),
    update: (id, body) => http.patch(`${path}/${id}`, body),
    remove: (id) => http.del(`${path}/${id}`),
  };
}

export const api = {
  me: () => http.get('/auth/me'),
  // Emite el JWT final a partir de { email, tokenApp } (público; sin auth previa).
  loginCooptech: (body) => http.post('/auth/loginCooptech', body),

  colaboradores: {
    ...recurso('/colaboradores'),
    periodos: (id) => http.get(`/colaboradores/${id}/periodos`),
    addPeriodo: (id, body) => http.post(`/colaboradores/${id}/periodos`, body),
    inactivar: (id, body) => http.post(`/colaboradores/${id}/inactivar`, body),
    eliminar: (id, force) => http.del(`/colaboradores/${id}${force ? '?force=1' : ''}`),
  },
  proyectos: recurso('/proyectos'),
  tareas: recurso('/tareas'),
  actividades: { list: (query) => http.get('/actividades', query) },
  objetivos: recurso('/objetivos'),
  tags: recurso('/tags'),
  plantillas: recurso('/plantillas'),
  clientes: recurso('/clientes'),
  guardias: {
    list: (anio) => http.get('/guardias', { anio }),
    setWeek: (body) => http.put('/guardias', body),
  },
  carryover: {
    list: (anio) => http.get('/carryover', { anio }),
    set: (body) => http.put('/carryover', body),
  },
  francos: recurso('/francos'),
  feriados: recurso('/feriados'),

  leads: {
    ...recurso('/leads'),
    actividades: (id) => http.get(`/leads/${id}/actividades`),
    addActividad: (id, body) => http.post(`/leads/${id}/actividades`, body),
    ganar: (id, body) => http.post(`/leads/${id}/ganar`, body),
    facturacion: (id) => http.get(`/leads/${id}/facturacion`),
    setFacturacion: (id, body) => http.put(`/leads/${id}/facturacion`, body),
    videollamada: (id, body) => http.post(`/leads/${id}/videollamada`, body),
    visitasTecnicas: () => http.get('/leads/visitas-tecnicas'),
    productosCatalogo: () => http.get('/leads/productos-catalogo'),
    guardarProductos: (productos) => http.put('/leads/productos-catalogo', { productos }),
    relevamientoAgua: (id) => http.get(`/leads/${id}/relevamiento-agua`),
    guardarRelevamientoAgua: (id, estado) => http.put(`/leads/${id}/relevamiento-agua`, { estado }),
    ingresos: (anio) => http.get('/leads/ingresos', { anio }),
    tareas: (id) => http.get(`/leads/${id}/tareas`),
    addTarea: (id, body) => http.post(`/leads/${id}/tareas`, body),
    setTarea: (id, tareaId, body) => http.patch(`/leads/${id}/tareas/${tareaId}`, body),
    delTarea: (id, tareaId) => http.del(`/leads/${id}/tareas/${tareaId}`),
  },

  archivos: {
    list: (query) => http.get('/archivos', query),
    // El archivo se sube primero al gateway (api/minio.js → saveImage) y luego
    // se registra acá su referencia (key + metadata) como JSON.
    create: (body) => http.post('/archivos', body),
    get: (id) => http.get(`/archivos/${id}`),
    // Mover de carpeta (url) o retitular (nombre) — biblioteca de Documentación.
    update: (id, body) => http.patch(`/archivos/${id}`, body),
    remove: (id) => http.del(`/archivos/${id}`),
    // Subcarpetas de Marketing (ola 2): mapa { rutaZona: [nombres] } en Configuracion.
    marketingCarpetas: () => http.get('/archivos/marketing-carpetas'),
    guardarMarketingCarpetas: (carpetas) => http.put('/archivos/marketing-carpetas', { carpetas }),
  },
  // Calendario de publicaciones de Marketing (ola 3).
  marketingPosts: {
    list: (mes) => http.get('/marketing-posts', { mes }),
    create: (body) => http.post('/marketing-posts', body),
    update: (id, body) => http.patch(`/marketing-posts/${id}`, body),
    remove: (id) => http.del(`/marketing-posts/${id}`),
    // Archivos vinculados a ALGUNA publicación o campaña (sello «usado»).
    archivosUsados: () => http.get('/marketing-posts/archivos-usados'),
  },
  // Agenda de contactos externos (26/08): manuales + derivados del CRM en vivo.
  contactos: {
    list: () => http.get('/contactos'),
    create: (body) => http.post('/contactos', body),
    update: (id, body) => http.patch(`/contactos/${id}`, body),
    remove: (id) => http.del(`/contactos/${id}`),
  },
  // Campañas publicitarias (26/08): período como línea en el calendario.
  marketingCampanias: {
    list: () => http.get('/marketing-posts/campanias'),
    create: (body) => http.post('/marketing-posts/campanias', body),
    update: (id, body) => http.patch(`/marketing-posts/campanias/${id}`, body),
    remove: (id) => http.del(`/marketing-posts/campanias/${id}`),
  },

  grilla: {
    list: (query) => http.get('/grilla', query),
    upsert: (body) => http.put('/grilla', body),
    bulk: (entries) => http.post('/grilla/bulk', { entries }),
    deleteDay: (colaboradorId, fecha) => http.del(`/grilla?colaboradorId=${colaboradorId}&fecha=${fecha}`),
    // Grilla típica (semana default por colaborador) + vacaciones por rango.
    tipica: () => http.get('/grilla/tipica'),
    guardarTipica: (tipica) => http.put('/grilla/tipica', { tipica }),
    cargarVacaciones: (body) => http.post('/grilla/vacaciones', body),
    wips: () => http.get('/grilla/wips'),
    setWip: (body) => http.put('/grilla/wip', body),
    resumenSemana: (lunes) => http.get('/grilla/resumen-semana', { lunes }),
    setResumenSemana: (body) => http.put('/grilla/resumen-semana', body),
  },

  plantillas: { list: () => http.get('/plantillas') },

  // Mis notas semanales (ola 3): todos leen, cada uno escribe la suya.
  notas: {
    list: (anio, semanaIso) => http.get('/notas', { anio, semanaIso }),
    set: (body) => http.put('/notas', body),
  },

  // Botones, recetas y aprovisionamiento del terminal Multivac (olas 3 y B).
  // Métricas Oficina Virtual (18/08): tickets = ítems de grilla clasificados.
  analisisOv: {
    tickets: (desde, hasta) => http.get(`/analisis/ov/tickets?desde=${desde}&hasta=${hasta}`),
    clasificar: (payload) => http.put('/analisis/ov/clasificar', payload),
    descartar: (payload) => http.put('/analisis/ov/descartar', payload),
    reglas: () => http.get('/analisis/ov/reglas'),
    guardarReglas: (reglas) => http.put('/analisis/ov/reglas', { reglas }),
  },
  multivac: {
    botones: () => http.get('/multivac/botones'),
    guardarBotones: (botones) => http.put('/multivac/botones', { botones }),
    recetas: () => http.get('/multivac/recetas'),
    guardarRecetas: (recetas) => http.put('/multivac/recetas', { recetas }),
    docsCarpetas: () => http.get('/multivac/docs-carpetas'),
    guardarDocsCarpetas: (carpetas) => http.put('/multivac/docs-carpetas', { carpetas }),
    plantillaSensor: () => http.get('/multivac/plantilla-sensor'),
    guardarPlantillaSensor: (plantilla) => http.put('/multivac/plantilla-sensor', { plantilla }),
    leadsConPlanteo: () => http.get('/multivac/aprovisionamiento'),
    planteoDeLead: (leadId) => http.get(`/multivac/aprovisionamiento/${leadId}`),
    firmwares: () => http.get('/multivac/firmwares'),
    guardarFirmwares: (firmwares) => http.put('/multivac/firmwares', { firmwares }),
  },

  costos: {
    list: () => http.get('/costos'),
    get: (mes) => http.get(`/costos/${mes}`),
    set: (mes, body) => http.put(`/costos/${mes}`, body),
  },
  importar: (data) => http.post('/import', data),
  importarReset: () => http.post('/import/reset', { confirmar: 'BLANQUEAR' }),

  asistente: {
    estado: () => http.get('/asistente/estado'),
    chat: (messages) => http.post('/asistente/chat', { messages }),
    setClave: (apiKey) => http.put('/asistente/clave', { apiKey }),
    borrarClave: () => http.del('/asistente/clave'),
  },
  analisis: {
    horasExtra: (mes) => http.get('/analisis/horas-extra', { mes }),
    ociosidad: (anio) => http.get('/analisis/ociosidad', { anio }),
    tagsCombo: (params) => http.get('/analisis/tags-combo', params),
    rangoAnios: () => http.get('/analisis/rango-anios'),
    rotacion: (desde, hasta) => http.get('/analisis/rotacion', { desde, hasta }),
  },
  integraciones: {
    graphEstado: () => http.get('/integraciones/graph'),
    graphGuardar: (body) => http.put('/integraciones/graph', body),
    graphBorrar: () => http.del('/integraciones/graph'),
  },
  reuniones: {
    list: (params) => http.get('/reuniones', params),
    create: (body) => http.post('/reuniones', body),
    update: (id, body) => http.patch(`/reuniones/${id}`, body),
    cancelar: (id) => http.del(`/reuniones/${id}`),
    responder: (id, respuesta) => http.post(`/reuniones/${id}/respuesta`, { respuesta }),
    syncOutlook: (desde, hasta) => http.post('/reuniones/sync-outlook', { desde, hasta }),
    respuestasOutlook: (id) => http.get(`/reuniones/${id}/respuestas-outlook`),
  },
  push: {
    clavePublica: () => http.get('/push/clave-publica'),
    suscribir: (suscripcion) => http.post('/push/suscribir', { suscripcion }),
    preferencias: () => http.get('/push/preferencias'),
    guardarPreferencias: (prefs) => http.put('/push/preferencias', { prefs }),
  },
  permisos: {
    get: () => http.get('/permisos'),
    set: (colaboradorId, extra, ocultas) => http.put('/permisos', { colaboradorId, extra, ocultas }),
  },
  criteria: {
    // SSE de punta a punta: latidos del servidor mantienen viva la conexión
    // durante los 1-3 minutos de generación (el 504 de los proxies, muerto).
    preguntas: (body) => postSSE('/criteria/preguntas', body),
    generar: (body) => postSSE('/criteria/generar', body),
    corregir: (body) => postSSE('/criteria/corregir', body), // 20/08: los ajustes CORRIGEN el planteo
    nota: (body) => postSSE('/criteria/nota', body),
  },
  deseos: {
    list: (todos) => http.get('/deseos', todos ? { todos: 1 } : undefined),
    create: (body) => http.post('/deseos', body),
    update: (id, body) => http.patch(`/deseos/${id}`, body),
    aprobar: (id, body) => http.post(`/deseos/${id}/aprobar`, body),
    del: (id) => http.del(`/deseos/${id}`),
  },

  // Inbox → Tickets (20/08): mini sistema espejo de la Mesa de ayuda.
  tickets: {
    list: (query) => http.get('/tickets', query),
    get: (id) => http.get(`/tickets/${id}`),
    create: (body) => http.post('/tickets', body),
    update: (id, body) => http.patch(`/tickets/${id}`, body),
    mensaje: (id, texto) => http.post(`/tickets/${id}/mensajes`, { texto }),
    del: (id) => http.del(`/tickets/${id}`),
    // Conector Mesa de ayuda (24/08): estado/config/sincronizar (token solo backend).
    syncEstado: () => http.get('/tickets/sync-mesa/estado'),
    syncConfig: (body) => http.put('/tickets/sync-mesa/config', body),
    syncAhora: () => http.post('/tickets/sync-mesa'),
  },
  etiquetas: {
    sugerencias: () => http.get('/etiquetas/sugerencias'),
    uso: (anio) => http.get('/etiquetas/uso', anio ? { anio } : undefined),
    detalle: (tag, anio) => http.get('/etiquetas/detalle', anio ? { tag, anio } : { tag }),
    unificar: (variantes, canonico) => http.post('/etiquetas/unificar', { variantes, canonico }),
  },
};
