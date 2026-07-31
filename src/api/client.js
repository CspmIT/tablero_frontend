import { getToken } from './auth.js';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Descarga autenticada de archivos binarios (p.ej. el Excel anualizado).
export async function descargarArchivo(path, nombreArchivo) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, { headers });
  if (!res.ok) {
    let msj = 'No se pudo descargar';
    try { const d = await res.json(); msj = d?.error?.message || d?.message || msj; } catch { /* */ }
    throw new ApiError(res.status, 'download', msj);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombreArchivo;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

async function request(method, path, { body, query, isForm } = {}) {
  let url = BASE + path;
  if (query) {
    const qs = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    if (qs) url += '?' + qs;
  }
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let payload;
  if (isForm) {
    payload = body; // FormData (para subir archivos)
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(url, { method, headers, body: payload });

  // Token vencido/ inválido: limpiamos la sesión y volvemos al login.
  // (Sólo si había un token; en modo dev sin token el backend no responde 401.)
  if (res.status === 401 && token) {
    localStorage.removeItem('cooptech_token');
    localStorage.removeItem('cooptech_user');
    if (typeof window !== 'undefined') window.location.reload();
  }

  if (res.status === 204) return null;

  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }

  if (!res.ok) {
    const err = data?.error || {};
    const e = new ApiError(res.status, err.code || 'error', err.message || res.statusText);
    if (err.dependencias) e.dependencias = err.dependencias;
    throw e;
  }
  return data;
}

export const http = {
  get: (path, query) => request('GET', path, { query }),
  post: (path, body) => request('POST', path, { body }),
  patch: (path, body) => request('PATCH', path, { body }),
  put: (path, body) => request('PUT', path, { body }),
  del: (path) => request('DELETE', path),
  postForm: (path, formData) => request('POST', path, { body: formData, isForm: true }),
};


// POST que consume una respuesta Server-Sent Events (30/07, CriterIA):
// mantiene viva la conexión con los latidos del servidor durante las
// generaciones largas (1-3 min) y resuelve con el evento "resultado".
export async function postSSE(path, body) {
  const headers = { 'Content-Type': 'application/json', Accept: 'text/event-stream' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method: 'POST', headers, body: JSON.stringify(body || {}) });
  const esSSE = (res.headers.get('content-type') || '').includes('text/event-stream');
  if (!res.ok && !esSSE) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j?.error?.message || j?.message || msg; } catch {}
    const err = new Error(msg); err.status = res.status; throw err;
  }
  if (!esSSE) return res.json(); // compat: backend viejo sin SSE

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buffer = '';
  let evento = null, datos = '';
  let resultado = null, errorSSE = null;
  const procesar = (bloque) => {
    evento = null; datos = '';
    for (const linea of bloque.split('\n')) {
      if (linea.startsWith('event:')) evento = linea.slice(6).trim();
      else if (linea.startsWith('data:')) datos += linea.slice(5).trim();
    }
    if (evento === 'resultado' && datos) { try { resultado = JSON.parse(datos); } catch {} }
    if (evento === 'error' && datos) { try { errorSSE = JSON.parse(datos); } catch { errorSSE = { mensaje: datos }; } }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    let corte;
    while ((corte = buffer.indexOf('\n\n')) >= 0) {
      procesar(buffer.slice(0, corte));
      buffer = buffer.slice(corte + 2);
    }
  }
  if (errorSSE) { const err = new Error(errorSSE.mensaje || 'Falló la generación'); err.code = errorSSE.error; throw err; }
  if (!resultado) { const err = new Error('La conexión se cortó antes del resultado (reintentá)'); throw err; }
  return resultado;
}
