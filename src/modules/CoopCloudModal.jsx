import { useEffect, useRef } from 'react';

// Aloja el presupuestador CoopCloud (asset autónomo) en un iframe. Puente "coopBridge".
// Dos modos: CON lead (estado en lead.coopcloudEstado) y SIN lead (17/09: el
// simulador GLOBAL de precios/monómicos, compartido en el servidor — antes
// vivía en el localStorage de cada navegador). `aviso` (opcional) se muestra
// en la barra del título (p. ej. solo-lectura para no-gestores).
export default function CoopCloudModal({ open, lead, estadoInicial, aviso, onAutoSave, onPdfDescargado, onClose }) {
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
          // 17/09 (bug: «los datos quedan en el navegador de cada uno»): el
          // cargar_estado viaja SIEMPRE, aunque el lead no tenga estado (null).
          // El iframe retiene sus autosaves hasta recibirlo (handshake) — antes,
          // su primer recalc() del boot mandaba el estado VIEJO del localStorage
          // y podía pisar el del lead antes de que llegara la verdad.
          win?.postMessage({ coopBridge: true, type: 'cargar_estado', estado: estadoInicial || null }, '*');
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-3" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl overflow-hidden flex flex-col" style={{ width: '95vw', height: '92vh', maxWidth: 1400 }}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 gap-3">
          <div className="text-sm font-medium text-coop-negro shrink-0">Presupuestador CoopCloud {lead?.organizacion && <span className="text-slate-400">· {lead.organizacion}</span>}{!lead && <span className="text-slate-400">· definición global</span>}</div>
          {aviso && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 truncate">{aviso}</div>}
          <button onClick={onClose} className="text-slate-500 hover:bg-slate-100 rounded px-2 py-1 shrink-0">✕</button>
        </div>
        <iframe ref={iframeRef} src="/presupuestadores/coopcloud.html" title="Presupuestador CoopCloud" style={{ width: '100%', flex: 1, border: 'none' }} />
      </div>
    </div>
  );
}
