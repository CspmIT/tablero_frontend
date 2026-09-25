import { useState } from 'react';
import { useData } from '../data/DataContext.jsx';
import { OPERACIONES_TABS, puedeVerSolapa } from '../nav.js';
import Campo from './Campo.jsx';
import Laboratorio from './Laboratorio.jsx';
import Organizaciones from './Organizaciones.jsx';

// «Operaciones» (25/09, Leonardo: «el menú se hizo muy grande»): cascarón que
// agrupa Campo (tercerizados), Laboratorio (ingeniería) y Gestión de
// Organizaciones y Usuarios (equipo web) como pestañas de un único ítem del
// menú — mismo patrón que Guardias→Grilla (28/08). Cada módulo queda INTACTO
// por dentro; los permisos se siguen gestionando por los ids de siempre
// (visitas / laboratorio / organizaciones). Como las audiencias son disjuntas,
// con UNA sola pestaña visible la barra ni se muestra: esa persona vive igual
// que antes, solo cambió el ícono del menú.
const COMPONENTES = { visitas: Campo, laboratorio: Laboratorio, organizaciones: Organizaciones };

export default function Operaciones({ tabInicial }) {
  const { me } = useData();
  const [tab, setTab] = useState(tabInicial || null); // null: la primera visible

  const visibles = OPERACIONES_TABS.filter((t) => puedeVerSolapa(t, me));
  // Si la elegida dejó de ser visible (cambio de permisos en vivo), caer a la primera.
  const activa = visibles.find((t) => t.id === tab) || visibles[0];

  if (!activa) {
    // No debería pasar (el ítem del menú solo aparece si hay al menos una),
    // pero un permiso quitado en caliente no puede dejar la pantalla rota.
    return <div className="text-sm text-slate-500 p-4">No tenés secciones de Operaciones habilitadas — pedile el acceso a tu manager.</div>;
  }

  const Componente = COMPONENTES[activa.id];
  return (
    <div>
      {visibles.length > 1 && (
        <div className="mb-3">
          <div className="inline-flex items-center gap-1 bg-slate-100 rounded-xl p-1 flex-wrap">
            {visibles.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`text-sm sm:text-base font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors ${
                  activa.id === t.id ? 'bg-coop-azul text-white' : 'text-slate-500 hover:bg-white'
                }`}>
                {t.tabLabel || t.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <Componente key={activa.id} />
    </div>
  );
}
