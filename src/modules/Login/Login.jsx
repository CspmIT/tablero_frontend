import { useState } from 'react';
import { Eye, EyeOff, Mail, Lock, Loader2 } from 'lucide-react';
import iconUrl from '../../assets/cooptech-icon.png';

const EMAIL_RE = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;

// Formulario de login. Presentacional: la lógica vive en LoginFlow.
// - onLogin(email, password): valida contra Cooptech y emite el JWT.
// - onRecover(email): dispara recuperación de contraseña en Cooptech.
export default function Login({ onLogin, onRecover, loading, error, info }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPass, setVerPass] = useState(false);
  const [recuperar, setRecuperar] = useState(false);
  const [tocado, setTocado] = useState(false);

  const emailOk = EMAIL_RE.test(email);
  const passOk = /^(?=.*[A-Z]).{8,}$/.test(password); // ≥8 chars y una mayúscula
  const puedeEnviar = recuperar ? emailOk : emailOk && passOk;

  const submit = (e) => {
    e.preventDefault();
    setTocado(true);
    if (!puedeEnviar || loading) return;
    if (recuperar) onRecover(email);
    else onLogin(email, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-coop-azul to-[#1a2d6b] p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <div className="flex flex-col items-center mb-6">
          <img src={iconUrl} alt="Cooptech" className="h-14 w-14 rounded-xl mb-3" />
          <h1 className="text-xl font-semibold text-slate-800">Tablero de Mando</h1>
          <p className="text-sm text-slate-400">Ingresá con tu cuenta de Cooptech</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {info && (
          <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
            {info}
          </div>
        )}

        <form onSubmit={submit} noValidate className="space-y-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">Email</label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email" value={email} autoComplete="username"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vos@coopmorteros.coop"
                className="w-full rounded-lg border border-slate-300 pl-10 pr-3 py-2.5 text-sm
                           focus:outline-none focus:ring-2 focus:ring-coop-azul/40 focus:border-coop-azul"
              />
            </div>
            {tocado && !emailOk && <p className="text-xs text-red-500 mt-1">Email inválido.</p>}
          </div>

          {!recuperar && (
            <div>
              <label className="block text-sm text-slate-600 mb-1">Contraseña</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={verPass ? 'text' : 'password'} value={password} autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-slate-300 pl-10 pr-10 py-2.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-coop-azul/40 focus:border-coop-azul"
                />
                <button type="button" onClick={() => setVerPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {verPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {tocado && !passOk && (
                <p className="text-xs text-red-500 mt-1">Mínimo 8 caracteres y una mayúscula.</p>
              )}
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-coop-azul text-white
                       py-2.5 text-sm font-medium hover:bg-[#1a2d6b] disabled:opacity-60 transition-colors">
            {loading && <Loader2 size={16} className="animate-spin" />}
            {recuperar ? 'Enviar recuperación' : 'Ingresar'}
          </button>
        </form>

        <button type="button" onClick={() => { setRecuperar((r) => !r); setTocado(false); }}
          className="mt-4 w-full text-center text-sm text-coop-azul hover:underline">
          {recuperar ? 'Volver al ingreso' : '¿Olvidaste tu contraseña?'}
        </button>
      </div>
    </div>
  );
}
