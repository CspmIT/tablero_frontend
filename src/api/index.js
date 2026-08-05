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
    remove: (id) => http.del(`/archivos/${id}`),
  },

  grilla: {
    list: (query) => http.get('/grilla', query),
    upsert: (body) => http.put('/grilla', body),
    bulk: (entries) => http.post('/grilla/bulk', { entries }),
    deleteDay: (colaboradorId, fecha) => http.del(`/grilla?colaboradorId=${colaboradorId}&fecha=${fecha}`),
    wips: () => http.get('/grilla/wips'),
    setWip: (body) => http.put('/grilla/wip', body),
    resumenSemana: (lunes) => http.get('/grilla/resumen-semana', { lunes }),
    setResumenSemana: (body) => http.put('/grilla/resumen-semana', body),
  },

  plantillas: { list: () => http.get('/plantillas') },

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
    nota: (body) => postSSE('/criteria/nota', body),
  },
  deseos: {
    list: (todos) => http.get('/deseos', todos ? { todos: 1 } : undefined),
    create: (body) => http.post('/deseos', body),
    update: (id, body) => http.patch(`/deseos/${id}`, body),
    aprobar: (id, body) => http.post(`/deseos/${id}/aprobar`, body),
    del: (id) => http.del(`/deseos/${id}`),
  },
  etiquetas: {
    sugerencias: () => http.get('/etiquetas/sugerencias'),
    uso: (anio) => http.get('/etiquetas/uso', anio ? { anio } : undefined),
    detalle: (tag, anio) => http.get('/etiquetas/detalle', anio ? { tag, anio } : { tag }),
    unificar: (variantes, canonico) => http.post('/etiquetas/unificar', { variantes, canonico }),
  },
};
