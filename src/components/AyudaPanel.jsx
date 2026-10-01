import { useEffect, useState } from 'react';
import { X, List, ChevronRight } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';
import { MODULOS, INFO, CONFIGURACION, puedeVerSolapa } from '../nav.js';
import { PAGINAS, AYUDA_POR_ID, paginaDeActivo } from '../ayuda/index.js';

// ---------------------------------------------------------------------------
// Ayuda del tablero (28/09, pedido de Leonardo: «cómo se usa cada sección»).
// Se abre con el «?» de la barra superior y muestra la ayuda del MÓDULO ACTIVO
// (contextual), con un índice general filtrado por permisos: cada uno ve solo
// la ayuda de las secciones que usa (reusa puedeVerSolapa — Booster ve
// Marketing, Mirko ve Grilla y Reportes, y nada más).
//
// El CONTENIDO vive versionado en src/ayuda/* (una página por ítem del menú).
// REGLA DEL MÉTODO (28/09): toda ola que cambia un módulo actualiza su página
// de ayuda EN EL MISMO zip — así la ayuda nunca se desfasa de la app.
// ---------------------------------------------------------------------------

const ROL_LABEL = { conduccion: 'solo conducción', manager: 'solo manager', gestor: 'manager/gerencial' };

function Receta({ r }) {
  return (
    <details className="group border border-slate-200 rounded-lg bg-white">
      <summary className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 cursor-pointer list-none">
        <ChevronRight size={14} className="text-slate-400 transition-transform group-open:rotate-90 shrink-0" />
        <span className="flex-1">{r.q}</span>
        {r.rol && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 shrink-0">{ROL_LABEL[r.rol] || r.rol}</span>}
      </summary>
      <ol className="list-decimal ml-9 mr-3 mb-2.5 mt-0.5 text-sm text-slate-600 space-y-1">
        {r.pasos.map((p, i) => <li key={i}>{p}</li>)}
      </ol>
    </details>
  );
}

function Pagina({ p }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 leading-relaxed">{p.intro}</p>
      {p.secciones.map((s, i) => (
        <div key={i}>
          <h4 className="text-xs font-semibold text-coop-negro uppercase tracking-wide mb-1.5">{s.titulo}</h4>
          {s.parrafos?.map((t, j) => <p key={j} className="text-sm text-slate-600 leading-relaxed mb-1.5">{t}</p>)}
          {s.items && (
            <ul className="list-disc ml-5 text-sm text-slate-600 space-y-1">
              {s.items.map((t, j) => <li key={j}>{t}</li>)}
            </ul>
          )}
          {s.recetas && <div className="grid gap-1.5">{s.recetas.map((r, j) => <Receta key={j} r={r} />)}</div>}
        </div>
      ))}
    </div>
  );
}

export default function AyudaPanel({ abierto, activo, onCerrar }) {
  const { me } = useData();
  const [vista, setVista] = useState('indice'); // id de página | 'indice'

  // Al abrir, arranca en la ayuda del módulo activo (contextual).
  useEffect(() => {
    if (abierto) setVista(paginaDeActivo(activo) || 'indice');
  }, [abierto, activo]);

  if (!abierto) return null;

  const navDe = (id) => [...MODULOS, ...INFO, CONFIGURACION].find((m) => m.id === id);
  const visibles = PAGINAS.filter((p) => {
    const n = navDe(p.id);
    return n ? puedeVerSolapa(n, me) : false;
  });
  const pagina = vista !== 'indice' ? AYUDA_POR_ID[vista] : null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="absolute right-0 top-0 h-full w-full sm:w-[460px] bg-slate-50 shadow-2xl flex flex-col">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-slate-200 shrink-0">
          <span className="text-sm font-semibold text-coop-negro truncate">
            {pagina ? `Ayuda · ${pagina.titulo}` : 'Ayuda del tablero'}
          </span>
          <span className="flex-1" />
          {pagina && (
            <button onClick={() => setVista('indice')} className="flex items-center gap-1 text-xs text-slate-500 hover:text-coop-azul border border-slate-200 rounded-lg px-2 py-1">
              <List size={13} /> Índice
            </button>
          )}
          <button onClick={onCerrar} className="text-slate-500 hover:bg-slate-100 rounded px-1.5 py-1"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {pagina ? <Pagina p={pagina} /> : (
            <div className="grid gap-1.5">
              <p className="text-xs text-slate-400 mb-1">Las secciones que ves acá son las que tenés habilitadas.</p>
              {visibles.map((p) => (
                <button key={p.id} onClick={() => setVista(p.id)}
                  className="text-left bg-white border border-slate-200 rounded-xl px-3 py-2.5 hover:border-coop-azul transition-colors">
                  <p className="text-sm font-medium text-coop-negro">{p.titulo}</p>
                  <p className="text-xs text-slate-400 truncate">{p.intro}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
