import { useEffect, useRef } from 'react';
import { useData } from '../data/DataContext.jsx';

// Aloja el presupuestador / relevamiento +Agua (asset autónomo) en un iframe.
// Puente "__coop": modos relevamiento|presupuesto; las fotos viajan como data-URI
// dentro del snapshot (el offload a MinIO queda como optimización futura).
export default function AguaModal({ open, lead, modo, estadoInicial, onAutoSave, onFinalizarRelevamiento, onPdfDescargado, onClose }) {
  const iframeRef = useRef(null);
  const { api, me } = useData();

  useEffect(() => {
    if (!open) return;
    function handler(ev) {
      const msg = ev.data;
      if (!msg || msg.__coop !== true) return;
      const win = iframeRef.current?.contentWindow;
      switch (msg.type) {
        case 'iframe_listo':
          if (lead) win?.postMessage({ __coop: true, type: 'precargar_datos', meta: { leadId: lead.id, razon: lead.organizacion || '', localidad: lead.ciudad || '', contacto: lead.contactoNombre || '', userId: me?.id || null, userNombre: me?.nombre || null } }, '*');
          win?.postMessage({ __coop: true, type: 'cargar_estado', estado: estadoInicial || null, modo: modo || 'relevamiento' }, '*');
          break;
        case 'finalizar_relevamiento':
          onFinalizarRelevamiento && onFinalizarRelevamiento(msg.snapshot || null);
          break;
        case 'pdf_descargado':
          onPdfDescargado && onPdfDescargado(msg.snapshot || null, msg.totales || null);
          break;
        case 'snapshot':
          onAutoSave && onAutoSave(msg.snapshot || null);
          break;
        // CriterIA: el iframe pide preguntas o generación; el tablero llama al
        // backend (único frente a Claude) y devuelve el resultado por el puente.
        case 'criteria_preguntas':
          api.criteria.preguntas(msg.payload || {})
            .then((r) => win?.postMessage({ __coop: true, type: 'criteria_preguntas_resultado', resultado: r }, '*'))
            .catch((e) => win?.postMessage({ __coop: true, type: 'criteria_preguntas_resultado', error: e.message || 'Error al pedir preguntas' }, '*'));
          break;
        case 'criteria_generar':
          api.criteria.generar(msg.payload || {})
            .then((r) => win?.postMessage({ __coop: true, type: 'criteria_resultado', resultado: r }, '*'))
            .catch((e) => win?.postMessage({ __coop: true, type: 'criteria_resultado', error: e.message || 'Error al generar el planteo' }, '*'));
          break;
      }
    }
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [open, lead, modo, estadoInicial, onAutoSave, onFinalizarRelevamiento, onPdfDescargado, api, me]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-3" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl overflow-hidden flex flex-col" style={{ width: '95vw', height: '92vh', maxWidth: 1400 }}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200">
          <div className="text-sm font-medium text-coop-negro">+Agua · {modo === 'presupuesto' ? 'Presupuesto' : 'Relevamiento'} {lead?.organizacion && <span className="text-slate-400">· {lead.organizacion}</span>}</div>
          <button onClick={onClose} className="text-slate-500 hover:bg-slate-100 rounded px-2 py-1">✕</button>
        </div>
        <iframe ref={iframeRef} src="/presupuestadores/agua.html" title="+Agua" style={{ width: '100%', flex: 1, border: 'none' }} />
      </div>
    </div>
  );
}
