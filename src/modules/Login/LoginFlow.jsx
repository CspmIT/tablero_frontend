import { useState } from 'react';
import { cooptech, parseLogin, extractTokenApp } from '../../api/cooptech.js';
import { api } from '../../api/index.js';
import { setSession, setCooptechSession } from '../../api/auth.js';
import Login from './Login.jsx';
import SelectClient from './SelectClient.jsx';

// Orquesta el flujo completo de login (estilo Reconecta, frontend directo):
//
//  1. POST /login (Cooptech)            -> { token, id, cliente[], tokenApp }
//  2. Guarda la sesión de Cooptech.
//  3. ¿Varios clientes? -> pantalla de selección. Si no, sigue directo.
//  4. POST /auth/loginCooptech (nuestro backend) con { email, tokenApp } -> JWT
//  5. Guarda el JWT y avisa (onLogged) para entrar al tablero.
export default function LoginFlow({ onLogged }) {
  const [paso, setPaso] = useState('form');     // 'form' | 'select'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [ctx, setCtx] = useState(null);          // { email, tokenApp, clientes }

  // Paso final: pide el JWT a nuestro backend con email + tokenApp.
  async function emitirJwt(email, tokenApp) {
    if (!tokenApp) {
      throw new Error('Cooptech no devolvió un tokenApp para tu usuario.');
    }
    const { token } = await api.loginCooptech({ email, tokenApp });
    setSession(token);
    onLogged();
  }

  async function handleLogin(email, password) {
    setLoading(true); setError(null); setInfo(null);
    try {
      const resp = await cooptech.login(email, password);
      const { token, userId, clientes, tokenApp: tokenAppLogin } = parseLogin(resp);
      let tokenApp = tokenAppLogin;
      setCooptechSession({ token, userId, email, clientes });

      // Si el /login no trae el tokenApp, lo buscamos en el detalle del usuario.
      if (!tokenApp && userId) {
        try {
          const u = await cooptech.getUser(userId, token);
          tokenApp = extractTokenApp(u?.data ?? u);
        } catch { /* dejamos tokenApp en null; el paso final avisa */ }
      }

      // Por ahora salteamos la pantalla de selección de cooperativas y entramos
      // directo al tablero. El backend es single-tenant (el tokenApp es el mismo
      // para todos los clientes), así que el cliente sólo sería contexto.
      void clientes;
      await emitirJwt(email, tokenApp);
    } catch (e) {
      setError(traducirError(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectClient(/* cliente */) {
    // En este backend single-tenant todos los clientes comparten la misma base,
    // así que la credencial (tokenApp) es la misma; el cliente sólo es contexto.
    setLoading(true); setError(null);
    try {
      await emitirJwt(ctx.email, ctx.tokenApp);
    } catch (e) {
      setError(traducirError(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleRecover(email) {
    setLoading(true); setError(null); setInfo(null);
    try {
      await cooptech.passwordRecover(email);
      setInfo('Si el email existe, te enviamos las instrucciones para recuperar la contraseña.');
    } catch (e) {
      setError(traducirError(e));
    } finally {
      setLoading(false);
    }
  }

  if (paso === 'select') {
    return (
      <SelectClient clientes={ctx.clientes} onSelect={handleSelectClient}
        loading={loading} error={error} />
    );
  }
  return (
    <Login onLogin={handleLogin} onRecover={handleRecover}
      loading={loading} error={error} info={info} />
  );
}

// Mensajes de error legibles según el origen (Cooptech o nuestro backend).
function traducirError(e) {
  if (e?.code === 'unauthorized' || e?.status === 401) return 'Email o contraseña incorrectos.';
  if (e?.code === 'not_provisioned' || e?.status === 403) return 'Tu usuario no está habilitado en el tablero.';
  if (e?.status === 0 || /failed to fetch|networkerror/i.test(e?.message || '')) {
    return 'No se pudo conectar con el servidor. Verificá tu conexión.';
  }
  return e?.message || 'Ocurrió un error inesperado.';
}
