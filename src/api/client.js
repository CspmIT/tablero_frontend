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
