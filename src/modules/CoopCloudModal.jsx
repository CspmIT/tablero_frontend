import { useEffect, useRef } from 'react';

// Aloja el presupuestador CoopCloud (asset autónomo) en un iframe. Puente "coopBridge".
export default function CoopCloudModal({ open, lead, estadoInicial, onAutoSave, onPdfDescargado, onClose }) {
  const iframeRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handler(ev) {
      const msg = ev.data;
      if (!msg || msg.coopBridge !== true) return;
      const win = iframeRef.current?.contentWindow;
      switch (msg.type) {
        case 'iframe_listo':
          if (lead) win?.postMessage({ coopBridge: true, type: 'precargar_datos', leadId: lead.id, razon: lead.organizacion || '' }, '*');
          if (estadoInicial) win?.postMessage({ coopBridge: true, type: 'cargar_estado', estado: estadoInicial }, '*');
          break;
        case 'estado_actualizado':
          onAutoSave && onAutoSave(msg.estado);
          break;
        case 'pdf_descargado':
          onPdfDescargado && onPdfDescargado(msg.estado, msg.totales);
          break;
      }
    }
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [open, lead, estadoInicial, onAutoSave, onPdfDescargado]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-3" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl overflow-hidden flex flex-col" style={{ width: '95vw', height: '92vh', maxWidth: 1400 }}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200">
          <div className="text-sm font-medium text-coop-negro">Presupuestador CoopCloud {lead?.organizacion && <span className="text-slate-400">· {lead.organizacion}</span>}</div>
          <button onClick={onClose} className="text-slate-500 hover:bg-slate-100 rounded px-2 py-1">✕</button>
        </div>
        <iframe ref={iframeRef} src="/presupuestadores/coopcloud.html" title="Presupuestador CoopCloud" style={{ width: '100%', flex: 1, border: 'none' }} />
      </div>
    </div>
  );
}
