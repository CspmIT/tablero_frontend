import { useEffect } from 'react';
import { useUpdater } from '../hooks/useUpdater.js';

// Chequea actualizaciones una vez al montar (arranque de la app ya autenticada)
// y muestra un modal opcional. Si no hay update o no estamos en Tauri, no pinta nada.
export default function UpdateManager() {
  const { status, update, progress, error, checkForUpdates, install, dismiss } = useUpdater();

  useEffect(() => {
    checkForUpdates();
  }, [checkForUpdates]);

  if (status === 'idle') return null;

  const descargando = status === 'downloading' || status === 'installing';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        {status === 'available' && (
          <>
            <h2 className="text-lg font-semibold text-slate-800">Nueva versión disponible</h2>
            <p className="mt-1 text-sm text-slate-500">
              {update?.version ? `Versión ${update.version}. ` : ''}¿Deseás actualizar ahora?
            </p>
            {update?.body && (
              <p className="mt-3 max-h-32 overflow-y-auto whitespace-pre-line rounded bg-slate-50 p-2 text-xs text-slate-500">
                {update.body}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={dismiss}
                className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                Más tarde
              </button>
              <button
                onClick={install}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Actualizar
              </button>
            </div>
          </>
        )}

        {descargando && (
          <>
            <h2 className="text-lg font-semibold text-slate-800">
              {status === 'installing' ? 'Instalando actualización' : 'Actualizando aplicación'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {status === 'installing'
                ? 'La aplicación se reiniciará automáticamente…'
                : 'Descargando actualización…'}
            </p>
            <div className="mt-4 h-3 overflow-hidden rounded bg-slate-200">
              <div
                className="h-full bg-emerald-600 transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-center text-sm font-semibold text-slate-600">{progress}%</p>
          </>
        )}

        {status === 'error' && (
          <>
            <h2 className="text-lg font-semibold text-red-600">Error al actualizar</h2>
            <p className="mt-1 text-sm text-slate-500">{error}</p>
            <div className="mt-5 flex justify-end">
              <button
                onClick={dismiss}
                className="rounded-md bg-slate-100 px-4 py-2 text-sm text-slate-700 hover:bg-slate-200"
              >
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
