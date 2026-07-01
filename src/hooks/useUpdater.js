import { useCallback, useState } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

// Lógica del actualizador de la app de escritorio (Tauri v2).
// Espeja el flujo de Reconecta (useUpdater.js) pero expone estado en vez de
// disparar SweetAlert, para que el modal lo pinte React/Tailwind (UpdateManager).
//
// status:
//   'idle'         nada que mostrar
//   'available'    hay versión nueva, esperando decisión del usuario
//   'downloading'  descargando el bundle (progress 0-100)
//   'installing'   descarga lista, la app va a reiniciarse
//   'error'        falló la descarga/instalación

// El chequeo sólo tiene sentido dentro del binario Tauri; en el navegador
// (dev web o build de Vite servido aparte) no existe el updater.
const enTauri = () => typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;

export function useUpdater() {
	const [status, setStatus] = useState('idle');
	const [update, setUpdate] = useState(null);
	const [progress, setProgress] = useState(0);
	const [error, setError] = useState(null);

	const checkForUpdates = useCallback(async () => {
		if (!enTauri()) return;
		try {
			const found = await check(); // lee latest.json del endpoint de tauri.conf.json
			if (found) {
				setUpdate(found);
				setStatus('available');
			}
		} catch (e) {
			// Chequeo silencioso: si falla (sin red, storageov caído) no molestamos.
			console.error('Updater check error:', e);
		}
	}, []);

	const install = useCallback(async () => {
		if (!update) return;
		setError(null);
		setProgress(0);
		setStatus('downloading');
		try {
			let total = 0;
			let downloaded = 0;
			await update.downloadAndInstall((event) => {
				switch (event.event) {
					case 'Started':
						total = event.data.contentLength || 0;
						downloaded = 0;
						break;
					case 'Progress':
						downloaded += event.data.chunkLength;
						if (total > 0) setProgress(Math.floor((downloaded / total) * 100));
						break;
					case 'Finished':
						setStatus('installing');
						break;
				}
			});
			await relaunch();
		} catch (e) {
			console.error('Updater install error:', e);
			setError('No se pudo completar la actualización. Verificá tu conexión e intentá nuevamente.');
			setStatus('error');
		}
	}, [update]);

	// "Más tarde": el updater vuelve a ofrecer la versión en el próximo arranque.
	const dismiss = useCallback(() => {
		setStatus('idle');
		setUpdate(null);
		setError(null);
		setProgress(0);
	}, []);

	return { status, update, progress, error, checkForUpdates, install, dismiss };
}
