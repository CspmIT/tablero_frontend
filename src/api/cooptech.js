// Cliente de la API centralizada de Cooptech (login + datos de usuario/clientes).
// Estilo Reconecta: el frontend habla DIRECTO con Cooptech para validar la
// contraseña y obtener el tokenApp; después nuestro backend emite el JWT final.
//
// La URL de Cooptech depende del entorno (igual que app.routes.js de Reconecta).

import { getCooptechSession } from './auth.js';

const ENTORNO = import.meta.env.VITE_ENTORNO || 'local';
// VITE_COOPTECH_URL permite apuntar a un backend levantado a mano
// (p. ej. http://localhost:8000 con `php artisan serve` en BackCooptech).
// Sin ella se usa el de siempre según el entorno.
const COOPTECH_BASE = import.meta.env.VITE_COOPTECH_URL
  || (ENTORNO === 'local' ? 'https://dev.cooptech.com.ar' : 'https://cooptech.com.ar');
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
  // Ojo con los nombres: la API espera id_user / id_client / name_product. Con
  // userId o appId los filtros llegan vacios y la respuesta no sirve.
  listClientsxUserxApp: ({ userId, nombreProducto, token }) =>
    cooptechFetch('/listClientsxUserxApp', { query: { id_user: userId, name_product: nombreProducto }, token }),
  listProductxUserxClient: ({ userId, clientId, token }) =>
    cooptechFetch('/listProductxUserxClient', { query: { id_user: userId, id_client: clientId }, token }),
  getSchemaProduct: ({ clientId, productId, token }) =>
    cooptechFetch('/getSchemaProduct', { query: { clientId, productId }, token }),
};

// --- Administracion de organizaciones ---------------------------------------
// Estas rutas piden el token de Cooptech (el central, no el JWT del tablero):
// quedo guardado en la sesion al loguearse, asi que se toma de ahi.

const token = () => getCooptechSession()?.token || '';

export const cooptechAdmin = {
  productos: () => cooptechFetch('/getAllProducts', { token: token() }),
  clientes: () => cooptechFetch('/listAllClient', { token: token() }),
  cliente: (id) => cooptechFetch('/searchClient', { query: { id }, token: token() }),
  crearCliente: (body) => cooptechFetch('/newClient', { method: 'POST', body, token: token() }),
  actualizarCliente: (body) => cooptechFetch('/updateClient', { method: 'PATCH', body, token: token() }),
  cambiarEstado: (id, status) =>
    cooptechFetch('/updateStatusClient', { method: 'PATCH', body: { id, status }, token: token() }),

  // Usuarios de una organización. La API nunca pidió ser el administrador de esa
  // organización para tocarlos: el id_client va en cada llamada, así que desde
  // acá se administran los usuarios de cualquier cooperativa.
  usuarios: (idClient) => cooptechFetch('/listUsers', { query: { id_client: idClient }, token: token() }),
  usuario: (id) => cooptechFetch('/getUser', { query: { id }, token: token() }),
  productosDeCliente: (idClient) =>
    cooptechFetch('/getProductsxClient', { query: { id_client: idClient }, token: token() }),
  productosDeUsuario: (idUser, idClient) =>
    cooptechFetch('/listProductxUserxClient', { query: { id_user: idUser, id_client: idClient }, token: token() }),
  // Devuelve 500 con un mensaje si el usuario no existe, si su perfil no permite
  // vincularlo o si ya pertenece a esa organización.
  buscarUsuarioPorEmail: (email, idClient) =>
    cooptechFetch('/getUserxEmail', { query: { email, id_client: idClient }, token: token() }),
  crearUsuario: (body) => cooptechFetch('/register', { method: 'POST', body, token: token() }),
  vincularUsuario: (body) => cooptechFetch('/addUserExistToClient', { method: 'POST', body, token: token() }),
  actualizarUsuario: (body) => cooptechFetch('/updateUser', { method: 'PATCH', body, token: token() }),
  // Da por activada la cuenta sin que la persona tenga que abrir el correo:
  // deja account_validate en 1 y limpia el token de un solo uso.
  validarCuenta: (id) => cooptechFetch('/validateAccount', { method: 'PATCH', body: { id }, token: token() }),
};

// --- Sincronización con Oficina Virtual -------------------------------------
// Un usuario con Oficina Virtual habilitada tiene que existir también del lado
// de la OV: Cooptech guarda la identidad y el token, pero la OV mantiene su
// propia tabla de usuarios por esquema de cliente.
//
// Sin VITE_OFIVIR_URL esto no se puede hacer, y la pantalla lo avisa en vez de
// dar el alta por buena.

export const OFIVIR_URL = import.meta.env.VITE_OFIVIR_URL || '';

export async function sincronizarConOficinaVirtual(datos) {
  if (!OFIVIR_URL) throw new Error('Falta configurar VITE_OFIVIR_URL para poder sincronizar con Oficina Virtual.');
  const res = await fetch(`${OFIVIR_URL}/relationUserCooptech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  });
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) throw new Error(data?.message || data?.error || 'Oficina Virtual rechazó la sincronización.');
  return data;
}

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
