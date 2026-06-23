// Manejo del token de sesión. En modo desarrollo puede estar vacío
// (el backend en AUTH_MODE=dev no lo exige). Cuando conectemos el login real,
// acá se guardará el token que devuelva el servicio de identidad.
const KEY = 'cooptech_token';

export function getToken() {
  return localStorage.getItem(KEY) || import.meta.env.VITE_DEV_TOKEN || '';
}
export function setToken(token) {
  if (token) localStorage.setItem(KEY, token);
  else localStorage.removeItem(KEY);
}
