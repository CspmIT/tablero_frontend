// "Campo" (05/08): un solo botón para el trabajo técnico en territorio —
// pestaña Visitas (leads en visita técnica + relevamiento/CriterIA in situ)
// y pestaña Multivac (aprovisionamiento del firmware universal por USB/BLE).
// Coinciden a propósito: son los dos bloques del proyecto de la Copa IA.
import { useState } from 'react';
import VisitasTecnicas from './VisitasTecnicas.jsx';
import Multivac from './Multivac.jsx';

export default function Campo() {
  const [tab, setTab] = useState('visitas');
  return (
    <div>
      <div className="px-4 pt-3">
        <div className="inline-flex rounded-xl border border-slate-200 bg-white overflow-hidden text-sm">
          {[['visitas', 'Visitas técnicas'], ['multivac', 'Multivac']].map(([id, lbl]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-4 py-2 ${tab === id ? 'bg-coop-azul text-white font-medium' : 'text-slate-600 hover:bg-slate-50'}`}>
              {lbl}
            </button>
          ))}
        </div>
      </div>
      {tab === 'visitas' ? <VisitasTecnicas /> : <Multivac />}
    </div>
  );
}
