import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // No limpiar la consola para no tapar los logs de `tauri dev`.
  clearScreen: false,
  server: {
    // El puerto debe coincidir con build.devUrl de src-tauri/tauri.conf.json.
    port: 5173,
    strictPort: true,
  },
});
