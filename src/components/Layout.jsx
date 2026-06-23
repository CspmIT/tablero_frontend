import { useState, useRef } from 'react';
import { Menu, ClipboardList, ChevronDown } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';
import FotoImg from './FotoImg.jsx';
import iconUrl from '../assets/cooptech-icon.png';

export default function Layout({ modulos, infoGrupo = [], activo, onSelect, children }) {
  const [abierto, setAbierto] = useState(false); // menú cerrado por defecto
  const [infoAbierto, setInfoAbierto] = useState(false);
  const infoBtnRef = useRef(null);
  const [flyPos, setFlyPos] = useState({ top: 0, left: 0 });
  const toggleInfo = () => {
    if (!infoAbierto && infoBtnRef.current) {
      const r = infoBtnRef.current.getBoundingClientRect();
      setFlyPos({ top: r.top, left: r.right + 6 });
    }
    setInfoAbierto((o) => !o);
  };
  const { me, colaboradores } = useData();
  const yo = colaboradores?.find((c) => String(c.id) === String(me?.colaboradorId));
  const inicial = (me?.nombre || 'U').trim().charAt(0).toUpperCase();
  const infoActivo = infoGrupo.some((m) => m.id === activo);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      {/* Topbar con gradiente de marca */}
      <header className="h-14 flex items-center justify-between px-4 text-white shrink-0
                         bg-gradient-to-r from-coop-azul to-[#1a2d6b] shadow">
        <div className="flex items-center gap-3">
          <img src={iconUrl} alt="CoopTech" className="h-9 w-9 rounded-lg" />
          <span className="font-semibold tracking-wide">COOPTECH</span>
          <span className="hidden sm:inline text-sm text-blue-200">· Tablero de Mando</span>
        </div>
        <div className="flex items-center gap-3">
          {me && <span className="hidden sm:inline text-sm text-blue-100">{me.nombre}</span>}
          <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-semibold overflow-hidden">
            <FotoImg foto={yo?.foto} alt={me?.nombre || ''} fallback={inicial} />
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar colapsable */}
        <aside className={`bg-white border-r border-slate-200 flex flex-col transition-all duration-200
                           ${abierto ? 'w-56' : 'w-16'}`}>
          <button onClick={() => setAbierto(a => !a)}
            className="h-12 flex items-center px-5 text-slate-500 hover:text-coop-azul shrink-0">
            <Menu size={20} />
          </button>
          <nav className="flex-1 py-1 overflow-y-auto">
            {modulos.map(m => {
              const Icono = m.icon;
              const esActivo = activo === m.id;
              return (
                <button key={m.id} onClick={() => m.listo && onSelect(m.id)} disabled={!m.listo}
                  title={!abierto ? m.label : undefined}
                  className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm relative
                    ${esActivo ? 'text-coop-azul bg-coop-azul/5 font-medium' : 'text-slate-500 hover:bg-slate-50'}
                    ${!m.listo ? 'opacity-40 cursor-default' : ''}`}>
                  {esActivo && <span className="absolute left-0 top-0 bottom-0 w-1 bg-coop-azul rounded-r" />}
                  <Icono size={20} className="shrink-0" />
                  {abierto && <span className="truncate">{m.label}</span>}
                  {abierto && !m.listo && <span className="ml-auto text-[10px] uppercase text-slate-400">pronto</span>}
                </button>
              );
            })}

            {infoGrupo.length > 0 && (
              <div className="mt-1 border-t border-slate-100 pt-1">
                <button ref={infoBtnRef} onClick={toggleInfo}
                  title={!abierto ? 'Información adicional' : undefined}
                  className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm relative
                    ${infoActivo ? 'text-coop-azul bg-coop-azul/5 font-medium' : 'text-slate-500 hover:bg-slate-50'}`}>
                  {infoActivo && <span className="absolute left-0 top-0 bottom-0 w-1 bg-coop-azul rounded-r" />}
                  <ClipboardList size={20} className="shrink-0" />
                  {abierto && <span className="truncate">Información adicional</span>}
                  {abierto && <ChevronDown size={14} className={`ml-auto transition-transform ${infoAbierto ? 'rotate-180' : ''}`} />}
                </button>
                {infoAbierto && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setInfoAbierto(false)} />
                    <div className="fixed z-50 w-52 bg-white rounded-xl shadow-lg border border-slate-200 py-1"
                      style={{ top: flyPos.top, left: flyPos.left }}>
                      {infoGrupo.map((m) => {
                        const I = m.icon;
                        return (
                          <button key={m.id} onClick={() => { onSelect(m.id); setInfoAbierto(false); }}
                            className={`w-full flex items-center gap-3 px-4 py-2 text-sm text-left
                              ${activo === m.id ? 'text-coop-azul font-medium bg-coop-azul/5' : 'text-slate-600 hover:bg-slate-50'}`}>
                            <I size={18} className="shrink-0" />
                            <span className="truncate">{m.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </nav>
        </aside>

        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
