// Visitas técnicas — la superficie de trabajo del equipo técnico/tercerizado.
// Muestra los leads en etapa "Visita Técnica" con SOLO los datos necesarios
// para el relevamiento (organización, localidad, contacto), sin el tratamiento
// comercial del lead. Desde acá se abre el relevamiento +Agua (y CriterIA)
// directamente: el plan propuesta puede nacer in situ, durante la visita.
import { useEffect, useState, useCallback } from 'react';
import { HardHat, MapPin, Phone, RefreshCw } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';
import AguaModal from './AguaModal.jsx';

export default function VisitasTecnicas() {
  const { api } = useData();
  const [leads, setLeads] = useState(null);
  const [aguaCtx, setAguaCtx] = useState(null); // { lead, estado }
  const [abriendo, setAbriendo] = useState(null); // id del lead en descarga

  const cargar = useCallback(async () => {
    try { const r = await api.leads.visitasTecnicas(); setLeads(r.leads || []); }
    catch { setLeads([]); }
  }, [api]);
  useEffect(() => { cargar(); }, [cargar]);

  const estadoRelevamiento = (l) => {
    const r = l.relevamiento || {};
    if (!r.iniciado) return { label: 'Sin iniciar', cls: 'bg-slate-100 text-slate-500' };
    if (r.criteria?.estado === 'validado') return { label: `Planteo validado v${r.criteria.version}`, cls: 'bg-emerald-100 text-emerald-700' };
    if (r.criteria) return { label: `Planteo borrador v${r.criteria.version || 1}`, cls: 'bg-amber-100 text-amber-700' };
    return { label: 'Relevamiento en curso', cls: 'bg-blue-100 text-blue-700' };
  };

  const abrirRelevamiento = async (l) => {
    setAbriendo(l.id);
    try {
      const r = await api.leads.relevamientoAgua(l.id);
      setAguaCtx({ lead: l, estado: r.estado || null });
    } catch { setAguaCtx({ lead: l, estado: null }); }
    finally { setAbriendo(null); }
  };

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-semibold text-coop-negro flex items-center gap-2">
          <HardHat size={20} className="text-coop-naranja" /> Visitas técnicas
        </h2>
        <button onClick={cargar} title="Actualizar" className="p-2 rounded-lg text-slate-400 hover:text-coop-azul hover:bg-slate-100">
          <RefreshCw size={16} />
        </button>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Cooperativas en etapa de visita técnica. Abrí el relevamiento, cargá lo que ves
        en la planta y generá el planteo con CriterIA ahí mismo, en campo.
      </p>

      {leads !== null && leads.length === 0 && (
        <div className="text-center text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl p-8">
          No hay visitas técnicas pendientes por ahora.
        </div>
      )}

      <div className="space-y-2">
        {(leads || []).map((l) => {
          const est = estadoRelevamiento(l);
          return (
            <div key={l.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-800 break-words">{l.organizacion}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${est.cls}`}>{est.label}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap text-sm text-slate-500 mt-1">
                    {l.ciudad && <span className="flex items-center gap-1"><MapPin size={13} /> {l.ciudad}</span>}
                    {l.contactoNombre && <span>{l.contactoNombre}</span>}
                    {l.telefono && <a href={`tel:${l.telefono}`} className="flex items-center gap-1 text-coop-azul hover:underline"><Phone size={13} /> {l.telefono}</a>}
                  </div>
                  {l.productos?.length > 0 && (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {l.productos.map((p, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{p.producto}</span>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => abrirRelevamiento(l)} disabled={abriendo === l.id}
                  className="bg-coop-azul text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:opacity-90 shrink-0 disabled:opacity-50">
                  {abriendo === l.id ? 'Abriendo…' : (l.relevamiento?.iniciado ? 'Continuar relevamiento' : 'Iniciar relevamiento')}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {aguaCtx && (
        <AguaModal
          open modo="relevamiento"
          lead={aguaCtx.lead}
          estadoInicial={aguaCtx.estado || null}
          onAutoSave={(snap) => api.leads.guardarRelevamientoAgua(aguaCtx.lead.id, snap).catch(() => {})}
          onFinalizarRelevamiento={(snap) => {
            api.leads.guardarRelevamientoAgua(aguaCtx.lead.id, snap)
              .then(() => { setAguaCtx(null); cargar(); })
              .catch(() => setAguaCtx(null));
          }}
          onClose={() => { setAguaCtx(null); cargar(); }}
        />
      )}
    </div>
  );
}
