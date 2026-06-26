// Cliente de la API centralizada de Cooptech (login + datos de usuario/clientes).
// Estilo Reconecta: el frontend habla DIRECTO con Cooptech para validar la
// contraseña y obtener el tokenApp; después nuestro backend emite el JWT final.
//
// La URL de Cooptech depende del entorno (igual que app.routes.js de Reconecta).

const ENTORNO = import.meta.env.VITE_ENTORNO || 'local';
const COOPTECH_BASE = ENTORNO === 'local'
  ? 'https://dev.cooptech.com.ar'
  : 'https://cooptech.com.ar';
const COOPTECH_API = `${COOPTECH_BASE}/api`;

export { COOPTECH_BASE };

async function cooptechFetch(path, { method = 'GET', body, token, query } = {}) {
  let url = COOPTECH_API + path;
  if (query) {
    const qs = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    if (qs) url += '?' + qs;
  }
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body: payload });
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) {
    const msg = data?.message || data?.error?.message || data?.error || res.statusText;
    const e = new Error(msg || 'Error de Cooptech');
    e.status = res.status;
    throw e;
  }
  return data;
}

// Endpoints de Cooptech (ver LOGIN.md §3.2). Los nombres de campos de respuesta
// pueden variar: la extracción tolerante está en parseLogin/extractTokenApp abajo.
export const cooptech = {
  login: (email, password) =>
    cooptechFetch('/login', { method: 'POST', body: { email, password } }),
  passwordRecover: (email) =>
    cooptechFetch('/password_recover', { method: 'POST', body: { email } }),
  getUser: (id, token) =>
    cooptechFetch('/getUser', { query: { id }, token }),
  listClientsxUserxApp: ({ userId, appId, token }) =>
    cooptechFetch('/listClientsxUserxApp', { query: { userId, appId }, token }),
  listProductxUserxClient: ({ userId, clientId, appId, token }) =>
    cooptechFetch('/listProductxUserxClient', { query: { userId, clientId, appId }, token }),
  getSchemaProduct: ({ clientId, productId, token }) =>
    cooptechFetch('/getSchemaProduct', { query: { clientId, productId }, token }),
};

// --- Extracción tolerante de la respuesta de /login -------------------------
// Cooptech puede envolver la respuesta de distintas formas; normalizamos acá.
// Si el contrato real difiere, este es el único lugar a ajustar.

export function parseLogin(resp) {
  const r = resp?.data ?? resp ?? {};
  return {
    token: r.token ?? r.accessToken ?? r.jwt ?? null,           // token central de Cooptech
    userId: r.id ?? r.userId ?? r.user?.id ?? null,             // id del usuario en Cooptech
    tokenApp: extractTokenApp(r),                               // credencial para nuestro backend
    clientes: normalizeClientes(r.cliente ?? r.clientes ?? r.clients ?? []),
    raw: r,
  };
}

// El tokenApp es único por usuario (LOGIN.md §1). En el dev de Cooptech viene
// como `token_apps` (UUID). Dejamos las otras variantes como fallback.
export function extractTokenApp(r) {
  return r?.token_apps ?? r?.tokenApp ?? r?.token_app
    ?? r?.user?.token_apps ?? r?.user?.tokenApp ?? r?.user?.token_app
    ?? null;
}

// Normaliza la lista de clientes a { id, nombre, schemaName?, productId? }.
export function normalizeClientes(list) {
  if (!Array.isArray(list)) return [];
  return list.map((c) => ({
    id: c.id ?? c.clientId ?? c.client_id ?? null,
    nombre: c.nombre ?? c.name ?? c.razonSocial ?? c.cliente ?? `Cliente ${c.id ?? ''}`,
    schemaName: c.schemaName ?? c.schema_name ?? c.schema ?? null,
    productId: c.productId ?? c.product_id ?? null,
    influxName: c.influx_name ?? c.influxName ?? null,
    raw: c,
  }));
}
