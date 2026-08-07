import { useState, useRef } from 'react';
import { Menu, X, BarChart3, ChevronDown, LogOut, MonitorDown } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';
import { VERSION } from '../version.js';
import FotoImg from './FotoImg.jsx';
import DesktopDownloadModal from './DesktopDownloadModal.jsx';
import { isTauri } from '../utils/isTauri.js';
import iconUrl from '../assets/cooptech-icon.png';

// Ítems de navegación compartidos entre el sidebar de escritorio y el drawer móvil.
// `expandido`: si se muestran las etiquetas. `enMovil`: el grupo "Análisis"
// (ex "Información adicional") se despliega inline (acordeón) en vez de flyout.
function NavItems({ modulos, infoGrupo, configuracion, activo, onSelect, expandido, enMovil }) {
  const [infoAbierto, setInfoAbierto] = useState(false);
  const infoBtnRef = useRef(null);
  const [flyPos, setFlyPos] = useState({ top: 0, left: 0 });
  const infoActivo = infoGrupo.some((m) => m.id === activo);

  const toggleInfo = () => {
    if (!enMovil && !infoAbierto && infoBtnRef.current) {
      const r = infoBtnRef.current.getBoundingClientRect();
      setFlyPos({ top: r.top, left: r.right + 6 });
    }
    setInfoAbierto((o) => !o);
  };

  const elegir = (id) => {
    setInfoAbierto(false);
    onSelect(id);
  };

  return (
    <nav className="flex-1 py-1 overflow-y-auto">
      {modulos.map(m => {
        const Icono = m.icon;
        const esActivo = activo === m.id;
        return (
          <button key={m.id} onClick={() => m.listo && elegir(m.id)} disabled={!m.listo}
            title={!expandido ? m.label : undefined}
            className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm relative
              ${esActivo ? 'text-coop-azul bg-coop-azul/5 font-medium' : 'text-slate-500 hover:bg-slate-50'}
              ${!m.listo ? 'opacity-40 cursor-default' : ''}`}>
            {esActivo && <span className="absolute left-0 top-0 bottom-0 w-1 bg-coop-azul rounded-r" />}
            <Icono size={20} className="shrink-0" />
            {expandido && <span className="truncate">{m.label}</span>}
            {expandido && !m.listo && <span className="ml-auto text-[10px] uppercase text-slate-400">pronto</span>}
          </button>
        );
      })}

      {infoGrupo.length > 0 && (
        <div className="mt-1 border-t border-slate-100 pt-1">
          <button ref={infoBtnRef} onClick={toggleInfo}
            title={!expandido ? 'Análisis' : undefined}
            className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm relative
              ${infoActivo ? 'text-coop-azul bg-coop-azul/5 font-medium' : 'text-slate-500 hover:bg-slate-50'}`}>
            {infoActivo && <span className="absolute left-0 top-0 bottom-0 w-1 bg-coop-azul rounded-r" />}
            <BarChart3 size={20} className="shrink-0" />
            {expandido && <span className="truncate">Análisis</span>}
            {expandido && <ChevronDown size={14} className={`ml-auto transition-transform ${infoAbierto ? 'rotate-180' : ''}`} />}
          </button>

          {/* En móvil el grupo se abre inline; en escritorio, como flyout al costado */}
          {infoAbierto && enMovil && (
            <div className="bg-slate-50/60">
              {infoGrupo.map((m) => {
                const I = m.icon;
                return (
                  <button key={m.id} onClick={() => elegir(m.id)}
                    className={`w-full flex items-center gap-3 pl-10 pr-4 py-2 text-sm text-left
                      ${activo === m.id ? 'text-coop-azul font-medium bg-coop-azul/5' : 'text-slate-600 hover:bg-slate-100'}`}>
                    <I size={18} className="shrink-0" />
                    <span className="truncate">{m.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {infoAbierto && !enMovil && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setInfoAbierto(false)} />
              <div className="fixed z-50 w-52 bg-white rounded-xl shadow-lg border border-slate-200 py-1"
                style={{ top: flyPos.top, left: flyPos.left }}>
                {infoGrupo.map((m) => {
                  const I = m.icon;
                  return (
                    <button key={m.id} onClick={() => elegir(m.id)}
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

      {configuracion && (() => {
        const Icono = configuracion.icon;
        return (
          <button onClick={() => elegir(configuracion.id)}
            title={!expandido ? configuracion.label : undefined}
            className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm text-left border-t border-slate-100 mt-1
              ${activo === configuracion.id ? 'text-coop-azul font-medium bg-coop-azul/5' : 'text-slate-600 hover:bg-slate-100'}`}>
            <Icono size={20} className="shrink-0" />
            {expandido && <span className="truncate">{configuracion.label}</span>}
          </button>
        );
      })()}
    </nav>
  );
}

export default function Layout({ modulos, infoGrupo = [], configuracion = null, activo, onSelect, onLogout, children }) {
  const [abierto, setAbierto] = useState(false); // sidebar escritorio expandido
  const [drawerAbierto, setDrawerAbierto] = useState(false); // drawer móvil
  const [userAbierto, setUserAbierto] = useState(false);
  const [descargaAbierto, setDescargaAbierto] = useState(false);
  const { me, colaboradores } = useData();
  const yo = colaboradores?.find((c) => String(c.id) === String(me?.colaboradorId));
  const inicial = (me?.nombre || 'U').trim().charAt(0).toUpperCase();

  // Visibilidad efectiva: rol default + solapas otorgadas − ocultadas desde el
  // panel de permisos (me.solapas viene del /me).
  const puedeVer = (item) => {
    const ov = me?.solapas || { extra: [], ocultas: [] };
    if (ov.ocultas?.includes(item.id)) return false;
    if (!item.roles || item.roles.includes(me?.tipo)) return true;
    return !!ov.extra?.includes(item.id);
  };
  const modulosVisibles = modulos.filter(puedeVer);
  const infoVisibles = infoGrupo.filter(puedeVer);
  const configVisible = configuracion && puedeVer(configuracion) ? configuracion : null;

  const seleccionar = (id) => {
    setDrawerAbierto(false);
    onSelect(id);
  };

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-slate-50 text-slate-800">
      {/* Topbar con gradiente de marca */}
      <header className="h-14 flex items-center justify-between px-3 sm:px-4 text-white shrink-0
                         bg-gradient-to-r from-coop-azul to-[#1a2d6b] shadow">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Hamburguesa: sólo en móvil abre el drawer */}
          <button onClick={() => setDrawerAbierto(true)}
            className="md:hidden p-1.5 -ml-1 rounded-lg hover:bg-white/15 shrink-0" aria-label="Abrir menú">
            <Menu size={22} />
          </button>
          <img src={iconUrl} alt="CoopTech" className="h-9 w-9 rounded-lg shrink-0" />
          <span className="font-semibold tracking-wide truncate">COOPTECH</span>
          <span className="hidden sm:inline text-sm text-blue-200 truncate">· Tablero de Mando</span>
        </div>
        <div className="relative flex items-center gap-2 sm:gap-3 shrink-0">
          {!isTauri() && (
            <button onClick={() => setDescargaAbierto(true)}
              title="Descargar versión escritorio"
              className="flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 px-2.5 sm:px-3 py-1.5 text-sm font-medium">
              <MonitorDown size={16} />
              <span className="hidden lg:inline">Descargar versión escritorio</span>
            </button>
          )}
          {me && <span className="hidden sm:inline text-sm text-blue-100 max-w-[12rem] truncate">{me.nombre}</span>}
          <button onClick={() => setUserAbierto((o) => !o)}
            className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-semibold overflow-hidden hover:ring-2 hover:ring-white/40">
            <FotoImg foto={yo?.foto} alt={me?.nombre || ''} fallback={inicial} />
          </button>
          {userAbierto && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserAbierto(false)} />
              <div className="absolute right-0 top-11 z-50 w-48 bg-white rounded-xl shadow-lg border border-slate-200 py-1 text-slate-700">
                <div className="px-4 py-2 border-b border-slate-100">
                  <p className="text-sm font-medium truncate">{me?.nombre || 'Usuario'}</p>
                  {me?.email && <p className="text-xs text-slate-400 truncate">{me.email}</p>}
                </div>
                <button onClick={() => { setUserAbierto(false); onLogout?.(); }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-slate-50">
                  <LogOut size={16} /> Cerrar sesión
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar de escritorio, colapsable (oculto en móvil) */}
        <aside className={`hidden md:flex bg-white border-r border-slate-200 flex-col transition-all duration-200
                           ${abierto ? 'w-56' : 'w-16'}`}>
          <button onClick={() => setAbierto(a => !a)}
            className="h-12 flex items-center px-5 text-slate-500 hover:text-coop-azul shrink-0">
            <Menu size={20} />
          </button>
          <NavItems modulos={modulosVisibles} infoGrupo={infoVisibles} configuracion={configVisible} activo={activo}
            onSelect={seleccionar} expandido={abierto} enMovil={false} />
          {abierto && <p className="px-5 py-2 text-[10px] text-slate-300 shrink-0">Tablero Cooptech v{VERSION}</p>}
        </aside>

        {/* Drawer móvil */}
        {drawerAbierto && (
          <div className="md:hidden fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerAbierto(false)} />
            <aside className="absolute left-0 top-0 bottom-0 w-64 max-w-[80vw] bg-white shadow-xl flex flex-col">
              <div className="h-14 flex items-center justify-between px-4 border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-2">
                  <img src={iconUrl} alt="CoopTech" className="h-8 w-8 rounded-lg" />
                  <span className="font-semibold text-coop-azul">COOPTECH</span>
                </div>
                <button onClick={() => setDrawerAbierto(false)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Cerrar menú">
                  <X size={20} />
                </button>
              </div>
              <NavItems modulos={modulosVisibles} infoGrupo={infoVisibles} configuracion={configVisible} activo={activo}
                onSelect={seleccionar} expandido={true} enMovil={true} />
            </aside>
          </div>
        )}

        <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-auto">{children}</main>
      </div>

      <DesktopDownloadModal open={descargaAbierto} onClose={() => setDescargaAbierto(false)} />
    </div>
  );
}
