// True cuando la app corre dentro del binario de escritorio (Tauri v2).
// En el navegador (dev web o build servido aparte) no existe __TAURI_INTERNALS__.
export const isTauri = () =>
  typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
