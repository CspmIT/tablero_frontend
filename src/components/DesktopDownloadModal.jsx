import { useEffect, useState } from 'react';
import { X, Monitor, Laptop, Download, Loader2 } from 'lucide-react';
import { getDesktopDownloads } from '../api/releases.js';

// Modal con los enlaces de descarga de la app de escritorio (Tauri) por S.O.
// Lee el downloads.json que publica el workflow de release en storageov.
export default function DesktopDownloadModal({ open, onClose }) {
  const [downloads, setDownloads] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getDesktopDownloads()
      .then(setDownloads)
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Card */}
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-xl border border-slate-200 p-6 text-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Descargar Tablero {downloads?.version || ''}
          </h2>
          <button onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="my-4 border-t border-slate-100" />

        {loading && (
          <div className="py-10 flex justify-center">
            <Loader2 size={28} className="animate-spin text-coop-azul" />
          </div>
        )}

        {!loading && !downloads && (
          <p className="py-8 text-center text-sm text-slate-500">
            No hay versiones disponibles para descargar por el momento.
          </p>
        )}

        {!loading && downloads && (
          <div className="space-y-5">
            {/* Windows */}
            <div>
              <div className="flex items-center gap-2 text-slate-700">
                <Monitor size={18} />
                <span className="font-medium">Windows</span>
              </div>
              <a
                href={downloads.windows?.browser_download_url || undefined}
                aria-disabled={!downloads.windows}
                className={`mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white
                  ${downloads.windows
                    ? 'bg-coop-azul hover:bg-[#1a2d6b]'
                    : 'bg-slate-300 cursor-not-allowed pointer-events-none'}`}
              >
                <Download size={16} /> Descargar
              </a>
            </div>

            <div className="border-t border-slate-100" />

            {/* Linux */}
            <div>
              <div className="flex items-center gap-2 text-slate-700">
                <Laptop size={18} />
                <span className="font-medium">Linux</span>
                <span className="ml-1 text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  AppImage recomendado
                </span>
              </div>

              <a
                href={downloads.appImage?.browser_download_url || undefined}
                aria-disabled={!downloads.appImage}
                className={`mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white
                  ${downloads.appImage
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-slate-300 cursor-not-allowed pointer-events-none'}`}
              >
                <Download size={16} /> Descargar AppImage
              </a>

              <a
                href={downloads.deb?.browser_download_url || undefined}
                aria-disabled={!downloads.deb}
                className={`mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border
                  ${downloads.deb
                    ? 'border-slate-300 text-slate-700 hover:bg-slate-50'
                    : 'border-slate-200 text-slate-400 cursor-not-allowed pointer-events-none'}`}
              >
                <Download size={16} /> Descargar .deb
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
