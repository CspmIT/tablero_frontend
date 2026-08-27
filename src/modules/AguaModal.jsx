import { useEffect, useRef } from 'react';
import { useData } from '../data/DataContext.jsx';
import { getImage, saveImage } from '../api/minio.js';

// Aloja el presupuestador / relevamiento +Agua (asset autónomo) en un iframe.
// Puente "__coop": modos relevamiento|presupuesto.
//
// IMÁGENES DEL DOCUMENTO AL GATEWAY (21/08, decisión de Leonardo sobre el punto 5
// del doc de Juan — causa de fondo del crash MySQL 1038): el mapa de la localidad
// y el logo del cliente se guardaban en base64 DENTRO del JSON del lead (390 KB la
// fila de Balnearia) y cada autosave reescribía todo. Ahora el TABLERO (que tiene
// las credenciales del gateway; el iframe es un asset estático y no las ve):
//   · DESHIDRATA cada snapshot antes de guardarlo: sube mapa/logoCliente a MinIO
//     (modelo Archivo, contexto 'agua_doc') y deja en el JSON solo `gw:<key>`.
//     Cache por contenido: el mismo dataURL no se re-sube en cada autosave.
//   · HIDRATA el estado antes de mandarlo al iframe: baja `gw:<key>` con getImage
//     y lo convierte a dataURL — adentro del iframe todo sigue siendo base64, así
//     que agua.html (y su PDF) NO SE TOCAN.
//   · Compatibilidad: un lead viejo con base64 adentro sigue andando y se
//     auto-migra al gateway en el primer guardado. Si el gateway falla, el
//     snapshot se guarda como venía (gordo pero nunca se pierde).
// agua.html ya comprime las FOTOS del relevamiento desde el origen; esto cubre
// las dos imágenes del documento, que eran las que inflaban la fila del lead.
export default function AguaModal({ open, lead, modo, estadoInicial, onAutoSave, onFinalizarRelevamiento, onPdfDescargado, onClose }) {
  const iframeRef = useRef(null);
  const { api, me } = useData();
  // Cache dataURL→key (y key→dataURL al hidratar) para no re-subir en cada autosave.
  const cacheRef = useRef(new Map());

  useEffect(() => {
    if (!open) return;
    const cache = cacheRef.current;

    const dataUrlDe = async (key) => {
      const objUrl = await getImage(key);
      const blob = await (await fetch(objUrl)).blob();
      URL.revokeObjectURL(objUrl);
      return await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
      });
    };

    // gw:<key> → dataURL (para el iframe). Ante error, null (el doc queda sin esa imagen).
    const hidratar = async (estado) => {
      const doc = estado?.documento;
      if (!doc) return estado;
      const salida = { ...estado, documento: { ...doc } };
      for (const campo of ['mapa', 'logoCliente']) {
        const v = salida.documento[campo];
        if (typeof v === 'string' && v.startsWith('gw:')) {
          const key = v.slice(3);
          try {
            const data = await dataUrlDe(key);
            salida.documento[campo] = data;
            cache.set(data, key); // mismo contenido → misma key al guardar (cero re-subida)
          } catch { salida.documento[campo] = null; }
        }
      }
      return salida;
    };

    // dataURL → gw:<key> (para el lead). Ante error, deja el base64 como venía.
    const deshidratar = async (snap) => {
      const doc = snap?.documento;
      if (!doc) return snap;
      const salida = { ...snap, documento: { ...doc } };
      for (const campo of ['mapa', 'logoCliente']) {
        const v = salida.documento[campo];
        if (typeof v === 'string' && v.startsWith('data:')) {
          try {
            let key = cache.get(v);
            if (!key) {
              const blob = await (await fetch(v)).blob();
              const ext = /image\/png/.test(v.slice(0, 30)) ? 'png' : 'jpg';
              const archivo = new File([blob], `${campo}_lead${lead?.id || 's'}.${ext}`, { type: blob.type || 'image/jpeg' });
              key = await saveImage(archivo);
              cache.set(v, key);
              // Referencia para auditoría/limpieza futura (no bloquea si falla).
              api.archivos.create({ key, nombre: archivo.name, mime: archivo.type, tamano: blob.size, contexto: 'agua_doc', url: lead?.id ? `lead:${lead.id}` : null }).catch(() => {});
            }
            salida.documento[campo] = `gw:${key}`;
          } catch { /* gateway caído: viaja el base64 como siempre */ }
        }
      }
      return salida;
    };

    function handler(ev) {
      const msg = ev.data;
      if (!msg || msg.__coop !== true) return;
      const win = iframeRef.current?.contentWindow;
      switch (msg.type) {
        case 'iframe_listo':
          if (lead) win?.postMessage({ __coop: true, type: 'precargar_datos', meta: { leadId: lead.id, razon: lead.organizacion || '', localidad: lead.ciudad || '', contacto: lead.contactoNombre || '', userId: me?.colaboradorId ?? me?.id ?? null, userNombre: me?.nombre || null } }, '*');
          // El estado puede traer imágenes gw:<key> → se hidratan antes de entrar al iframe.
          hidratar(estadoInicial || null)
            .catch(() => estadoInicial || null)
            .then((estado) => win?.postMessage({ __coop: true, type: 'cargar_estado', estado, modo: modo || 'relevamiento' }, '*'));
          break;
        case 'finalizar_relevamiento':
          deshidratar(msg.snapshot || null).then((s) => onFinalizarRelevamiento && onFinalizarRelevamiento(s));
          break;
        case 'pdf_descargado':
          deshidratar(msg.snapshot || null).then((s) => onPdfDescargado && onPdfDescargado(s, msg.totales || null));
          break;
        case 'snapshot':
          deshidratar(msg.snapshot || null).then((s) => onAutoSave && onAutoSave(s));
          break;
        // CriterIA: el iframe pide preguntas o generación; el tablero llama al
        // backend (único frente a Claude) y devuelve el resultado por el puente.
        case 'criteria_preguntas':
          api.criteria.preguntas(msg.payload || {})
            .then((r) => win?.postMessage({ __coop: true, type: 'criteria_preguntas_resultado', resultado: r }, '*'))
            .catch((e) => win?.postMessage({ __coop: true, type: 'criteria_preguntas_resultado', error: [e?.message, e?.status && `HTTP ${e.status}`].filter(Boolean).join(' · ') || 'Error al pedir preguntas' }, '*'));
          break;
        case 'criteria_nota':
          api.criteria.nota(msg.payload || {})
            .then((r) => win?.postMessage({ __coop: true, type: 'criteria_nota_resultado', resultado: r, pedidoId: msg.pedidoId }, '*'))
            .catch((e) => win?.postMessage({ __coop: true, type: 'criteria_nota_resultado', error: e?.message || 'Error al redactar la nota', pedidoId: msg.pedidoId }, '*'));
          break;
        case 'criteria_generar':
          api.criteria.generar(msg.payload || {})
            .then((r) => win?.postMessage({ __coop: true, type: 'criteria_resultado', resultado: r }, '*'))
            .catch((e) => win?.postMessage({ __coop: true, type: 'criteria_resultado', error: [e?.message, e?.status && `HTTP ${e.status}`].filter(Boolean).join(' · ') || 'Error al generar el planteo' }, '*'));
          break;
        // 20/08: corrección dirigida — los ajustes del validador corrigen el planteo.
        case 'criteria_corregir':
          api.criteria.corregir(msg.payload || {})
            .then((r) => win?.postMessage({ __coop: true, type: 'criteria_corregir_resultado', resultado: r }, '*'))
            .catch((e) => win?.postMessage({ __coop: true, type: 'criteria_corregir_resultado', error: [e?.message, e?.status && `HTTP ${e.status}`].filter(Boolean).join(' · ') || 'Error al corregir el planteo' }, '*'));
          break;
      }
    }
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [open, lead, modo, estadoInicial, onAutoSave, onFinalizarRelevamiento, onPdfDescargado, api, me]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-3" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
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
