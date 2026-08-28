// Switch para alternar entre la Grilla (vista del manager), Guardias (rotación
// anual — 28/08: dejó el menú lateral y vive acá, es parte del día a día),
// Mi semana (personal), Mi día y Mi mes (calendario mensual de solo lectura).
// Todas comparten el mismo item de menú; este control va al lado del título.
// La pestaña Guardias respeta el permiso por id 'guardias' de siempre
// (panel de Configuración: extra/ocultas siguen funcionando igual).
import { useData } from '../data/DataContext.jsx';
import { GUARDIAS_TAB, puedeVerSolapa } from '../nav.js';

export default function SwitchVista({ vista, setVista }) {
  const { me } = useData();
  const verGuardias = puedeVerSolapa(GUARDIAS_TAB, me);
  const tab = (id, label) => (
    <button
      onClick={() => setVista && setVista(id)}
      className={`text-sm sm:text-base font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors ${
        vista === id ? 'bg-coop-azul text-white' : 'text-slate-500 hover:bg-white'
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="inline-flex items-center gap-1 bg-slate-100 rounded-xl p-1">
      {tab('grilla', 'Grilla')}
      {verGuardias && tab('guardias', 'Guardias')}
      {tab('misemana', 'Mi semana')}
      {tab('midia', 'Mi día')}
      {tab('mimes', 'Mi mes')}
    </div>
  );
}
