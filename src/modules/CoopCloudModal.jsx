import { useEffect, useRef, useState } from 'react';

// Aloja el presupuestador CoopCloud (asset autónomo) en un iframe. Puente "coopBridge".
// Dos modos: CON lead (estado en lead.coopcloudEstado) y SIN lead (17/09: el
// simulador GLOBAL de precios/monómicos, compartido en el servidor — antes
// vivía en el localStorage de cada navegador). `aviso` (opcional) se muestra
// en la barra del título (p. ej. solo-lectura para no-gestores).
// `onPublicar` (opcional, 25/09): async(monomicos) — publica los 6 precios
// unitarios en la web pública. Solo se muestra sin lead; con doble click de
// confirmación (publicar pisa los precios que ve cualquier visitante).
export default function CoopCloudModal({ open, lead, estadoInicial, aviso, onAutoSave, onPublicar, onPdfDescargado, onClose }) {
  const iframeRef = useRef(null);
  // Última foto de monómicos que mandó el iframe (viaja con cada autosave).
  const monRef = useRef(null);
  // normal | armado (primer click) | publicando | ok | error:<msg>
  const [pubEstado, setPubEstado] = useState('normal');
  const pubTimer = useRef(null);

  useEffect(() => {
    if (!open) return;
    monRef.current = null;
    setPubEstado('normal');
    return () => clearTimeout(pubTimer.current);
  }, [open]);

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
          if (msg.monomicos) monRef.current = msg.monomicos;
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

  const publicarClick = async () => {
    clearTimeout(pubTimer.current);
    if (pubEstado === 'publicando') return;
    if (pubEstado !== 'armado') {
      // Primer click: armar (mismo patrón que el «↺ Restablecer» del iframe).
      setPubEstado('armado');
      pubTimer.current = setTimeout(() => setPubEstado('normal'), 5000);
      return;
    }
    if (!monRef.current) { setPubEstado('error:Todavía no hay precios calculados — tocá cualquier campo y reintentá'); pubTimer.current = setTimeout(() => setPubEstado('normal'), 6000); return; }
    setPubEstado('publicando');
    try {
      await onPublicar(monRef.current);
      setPubEstado('ok');
      pubTimer.current = setTimeout(() => setPubEstado('normal'), 4000);
    } catch (e) {
      setPubEstado(`error:${e?.message || 'No se pudo publicar'}`);
      pubTimer.current = setTimeout(() => setPubEstado('normal'), 6000);
    }
  };
  const pubLabel = pubEstado === 'armado' ? '¿Publicar en la web? tocá de nuevo'
    : pubEstado === 'publicando' ? 'Publicando…'
    : pubEstado === 'ok' ? 'Publicado en la web ✓'
    : pubEstado.startsWith('error:') ? pubEstado.slice(6)
    : 'Publicar precios en la web';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-3" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl overflow-hidden flex flex-col" style={{ width: '95vw', height: '92vh', maxWidth: 1400 }}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 gap-3">
          <div className="text-sm font-medium text-coop-negro shrink-0">Presupuestador CoopCloud {lead?.organizacion && <span className="text-slate-400">· {lead.organizacion}</span>}{!lead && <span className="text-slate-400">· definición global</span>}</div>
          {aviso && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 truncate">{aviso}</div>}
          <div className="flex items-center gap-2 shrink-0">
            {!lead && onPublicar && (
              <button onClick={publicarClick} disabled={pubEstado === 'publicando'}
                title="Publica los 6 precios unitarios (vCPU, RAM, SSD, HDD, IP, Mbps) en la landing de Cooptech. La web NO lee el simulador en vivo: muestra la última foto publicada."
                className={`text-xs rounded-lg px-2.5 py-1 border transition-colors ${
                  pubEstado === 'armado' ? 'bg-amber-500 text-white border-amber-500'
                  : pubEstado === 'ok' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : pubEstado.startsWith('error:') ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-white text-coop-negro border-slate-300 hover:bg-slate-50'
                }`}>
                {pubLabel}
              </button>
            )}
            <button onClick={onClose} className="text-slate-500 hover:bg-slate-100 rounded px-2 py-1">✕</button>
          </div>
        </div>
        <iframe ref={iframeRef} src="/presupuestadores/coopcloud.html" title="Presupuestador CoopCloud" style={{ width: '100%', flex: 1, border: 'none' }} />
      </div>
    </div>
  );
}
