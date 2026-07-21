import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API_TARGET = process.env.CONTAINLY_DEV_API ?? 'http://127.0.0.1:8420';

// Dev-Proxy: /api + /healthz (inkl. WebSockets) gehen ans Backend, damit der Browser
// alles als same-origin sieht — so funktionieren HttpOnly/SameSite=Strict-Cookies.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true, ws: true },
      '/healthz': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
