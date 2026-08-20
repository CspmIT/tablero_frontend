// Inbox (20/08) — ampliación de "Mis Deseos": dos solapas, Tickets (nuevo,
// espejo de la Mesa de ayuda de la cooperativa) y Mis deseos (lo de siempre,
// intacto). El id de nav sigue siendo 'deseos' (permisos por id intactos).
// Diseño congelado: claude/Inbox_Tickets_ReporteOV_diseno_20_08.md
import { useState } from 'react';
import { Inbox as InboxIcon } from 'lucide-react';
import Deseos from './Deseos.jsx';
import TicketsInbox from './TicketsInbox.jsx';

const SOLAPAS = [
  { id: 'tickets', label: 'Tickets' },
  { id: 'deseos', label: 'Mis deseos' },
];

export default function Inbox() {
  const [solapa, setSolapa] = useState('tickets');
  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <h2 className="text-xl font-semibold text-coop-negro flex items-center gap-2">
          <InboxIcon size={20} className="text-coop-naranja" /> Inbox
        </h2>
        <div className="flex gap-1.5 flex-wrap">
          {SOLAPAS.map((s) => (
            <button key={s.id} onClick={() => setSolapa(s.id)}
              className={`px-3.5 py-1.5 rounded-full text-sm ${solapa === s.id ? 'bg-coop-azul text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-coop-azul hover:text-coop-azul'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {solapa === 'tickets' ? <TicketsInbox /> : <Deseos embebido />}
    </div>
  );
}
