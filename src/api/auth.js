// Manejo del token de sesión y de la sesión de Cooptech.
//
// Flujo (estilo Reconecta): el frontend valida email+password contra Cooptech,
// obtiene el tokenApp del usuario, y con eso pide a NUESTRO backend el JWT final
// (POST /auth/loginCooptech). Ese JWT es el que viaja en cada request (client.js).

const TOKEN_KEY = 'cooptech_token';     // JWT final emitido por nuestro backend
const USER_KEY = 'cooptech_user';       // datos del usuario (decodificados del JWT)
const COOPTECH_KEY = 'cooptech_session'; // datos crudos de la sesión de Cooptech

// Decodifica el payload de un JWT (sin verificar firma; sólo para leer claims).
export function decodeJwt(token) {
  try {
    const part = token.split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// Guarda el JWT final y cachea los datos del usuario que vienen en sus claims.
export function setSession(token) {
  setToken(token);
  const c = decodeJwt(token);
  if (c) {
    localStorage.setItem(USER_KEY, JSON.stringify({
      sub: c.sub, nombre: c.name, email: c.email,
      profile: c.profile, imgProfile: c.img_profile, exp: c.exp,
    }));
  }
}

export function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
}

// Guarda/lee los datos crudos de Cooptech (token central, id de usuario, clientes).
export function setCooptechSession(data) {
  localStorage.setItem(COOPTECH_KEY, JSON.stringify(data));
}
export function getCooptechSession() {
  try { return JSON.parse(localStorage.getItem(COOPTECH_KEY)); } catch { return null; }
}

// ¿Hay sesión válida? (token presente y no vencido).
export function isAuthenticated() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return false;
  const c = decodeJwt(token);
  if (!c?.exp) return true; // sin exp: lo damos por válido
  return c.exp * 1000 > Date.now();
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(COOPTECH_KEY);
}
