import { http } from './client.js';

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
  },
  etiquetas: {
    uso: () => http.get('/etiquetas/uso'),
    unificar: (variantes, canonico) => http.post('/etiquetas/unificar', { variantes, canonico }),
  },
};
