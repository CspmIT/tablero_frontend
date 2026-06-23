import { useState, useEffect, useCallback } from 'react';
import { X, Upload, Trash2 } from 'lucide-react';
import { getImage, saveImage } from '../api/minio.js';

const MAX_FOTOS = 10;

// Modal de detalles de un objetivo: comentarios de seguimiento + galería de fotos (MinIO).
// readOnly=true lo deja como presentación limpia (Dashboard); editable en el módulo Objetivos.
export default function ObjetivoDetalleModal({ open, objetivo, pct, api, readOnly = false, onClose, onSaved }) {
  const [comentarios, setComentarios] = useState('');
  const [fotos, setFotos] = useState([]);
  const [urls, setUrls] = useState({}); // id de archivo -> objectURL resuelto desde el gateway
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargarFotos = useCallback(async () => {
    if (!objetivo?.id) return;
    try {
      const r = await api.archivos.list({ objetivoId: objetivo.id });
      setFotos(r.data || r || []);
    } catch { /* el almacenamiento puede no estar disponible todavía */ }
  }, [api, objetivo]);

  useEffect(() => {
    if (!open || !objetivo) return;
    setComentarios(objetivo.comentarios || '');
    setError('');
    cargarFotos();
  }, [open, objetivo, cargarFotos]);

  // Resuelve cada foto (descarga desde el gateway y arma un objectURL local).
  useEffect(() => {
    let cancelado = false;
    const creados = [];
    (async () => {
      const next = {};
      for (const f of fotos) {
        try {
          const u = await getImage(f.key);
          if (cancelado) { URL.revokeObjectURL(u); return; }
          next[f.id] = u;
          creados.push(u);
        } catch { /* ignora la imagen que no se pudo cargar */ }
      }
      if (!cancelado) setUrls(next);
    })();
    return () => { cancelado = true; creados.forEach((u) => URL.revokeObjectURL(u)); };
  }, [fotos]);

  if (!open || !objetivo) return null;

  const guardarComentarios = async () => {
    setGuardando(true); setError('');
    try {
      await api.objetivos.update(objetivo.id, { comentarios });
      onSaved && onSaved();
      onClose && onClose();
    } catch {
      setError('No se pudieron guardar los comentarios.');
    } finally {
      setGuardando(false);
    }
  };

  const subirFotos = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const espacio = MAX_FOTOS - fotos.length;
    if (espacio <= 0) { setError(`Máximo ${MAX_FOTOS} fotos por objetivo.`); return; }
    setSubiendo(true); setError('');
    try {
      for (const file of files.slice(0, espacio)) {
        const fileName = await saveImage(file); // sube al gateway
        await api.archivos.create({            // registra la referencia en la base
          key: fileName,
          nombre: file.name,
          mime: file.type,
          tamano: file.size,
          objetivoId: objetivo.id,
          contexto: 'objetivo_foto',
        });
      }
      await cargarFotos();
    } catch {
      setError('No se pudo subir la foto (¿el almacenamiento está disponible?).');
    } finally {
      setSubiendo(false);
    }
  };

  const borrarFoto = async (id) => {
    if (!window.confirm('¿Eliminar esta foto?')) return;
    try { await api.archivos.remove(id); await cargarFotos(); }
    catch { setError('No se pudo eliminar la foto.'); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <div className="font-mono text-xs text-slate-400">{objetivo.codigo}</div>
            <h3 className="font-semibold text-slate-800 leading-tight">{objetivo.titulo}</h3>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Avance</div>
              <div className="text-2xl font-bold text-coop-azul leading-none">{pct}%</div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-100 text-slate-500"><X size={18} /></button>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Comentarios</label>
            {readOnly ? (
              comentarios
                ? <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{comentarios}</p>
                : <p className="text-sm text-slate-400 italic">Sin comentarios.</p>
            ) : (
              <>
                <textarea value={comentarios} onChange={(e) => setComentarios(e.target.value)} rows={10}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm leading-relaxed"
                  placeholder="Seguimiento, hitos, contexto del período…" />
                <div className="flex justify-end mt-2">
                  <button onClick={guardarComentarios} disabled={guardando}
                    className="bg-coop-azul text-white text-sm px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-60">
                    {guardando ? 'Guardando…' : 'Guardar comentarios'}
                  </button>
                </div>
              </>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Fotos ({fotos.length}/{MAX_FOTOS})</label>
              {!readOnly && fotos.length < MAX_FOTOS && (
                <label className="inline-flex items-center gap-1.5 text-sm text-coop-azul cursor-pointer hover:underline">
                  <Upload size={14} /> Subir
                  <input type="file" accept="image/*" multiple className="hidden"
                    onChange={(e) => { subirFotos(e.target.files); e.target.value = ''; }} />
                </label>
              )}
            </div>
            {subiendo && <p className="text-xs text-slate-400 mb-2">Subiendo…</p>}
            {fotos.length === 0 ? (
              <p className="text-sm text-slate-400 italic">Sin fotos.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {fotos.map((f) => (
                  <div key={f.id} className="relative group border border-slate-200 rounded-lg overflow-hidden bg-slate-50 aspect-[4/3]">
                    <a href={urls[f.id]} target="_blank" rel="noreferrer">
                      {urls[f.id]
                        ? <img src={urls[f.id]} alt={f.nombre} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">Cargando…</div>}
                    </a>
                    {!readOnly && (
                      <button onClick={() => borrarFoto(f.id)}
                        className="absolute top-1 right-1 p-1 rounded bg-white/90 text-red-500 opacity-0 group-hover:opacity-100 transition"
                        title="Eliminar"><Trash2 size={13} /></button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
