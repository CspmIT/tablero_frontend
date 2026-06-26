import { Building2, ChevronRight, Loader2 } from 'lucide-react';
import iconUrl from '../../assets/cooptech-icon.png';

// Selector de organización cuando el usuario pertenece a varias (estilo ListClients
// de Reconecta). Al elegir, se deriva el contexto y se emite el JWT final.
export default function SelectClient({ clientes, onSelect, loading, error }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-coop-azul to-[#1a2d6b] p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <div className="flex flex-col items-center mb-6">
          <img src={iconUrl} alt="Cooptech" className="h-14 w-14 rounded-xl mb-3" />
          <h1 className="text-xl font-semibold text-slate-800">Elegí tu organización</h1>
          <p className="text-sm text-slate-400">Tenés acceso a más de una</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <ul className="space-y-2">
          {clientes.map((c, i) => (
            <li key={c.id ?? i}>
              <button onClick={() => !loading && onSelect(c)} disabled={loading}
                className="w-full flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3
                           text-left hover:border-coop-azul hover:bg-coop-azul/5 disabled:opacity-60 transition-colors">
                <span className="h-9 w-9 rounded-lg bg-coop-azul/10 flex items-center justify-center text-coop-azul">
                  <Building2 size={18} />
                </span>
                <span className="flex-1 text-sm font-medium text-slate-700 truncate">{c.nombre}</span>
                {loading ? <Loader2 size={16} className="animate-spin text-slate-400" />
                         : <ChevronRight size={18} className="text-slate-400" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
