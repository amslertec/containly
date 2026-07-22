import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const API_TARGET = process.env.CONTAINLY_DEV_API ?? 'http://127.0.0.1:8420';

// Dev-Proxy: /api + /healthz (inkl. WebSockets) gehen ans Backend, damit der Browser
// alles als same-origin sieht — so funktionieren HttpOnly/SameSite=Strict-Cookies.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA: installierbar (Manifest + Icons) + Service-Worker (App-Shell offline,
    // Auto-Update). API-Aufrufe werden NICHT gecacht (dürfen nie veralten).
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Containly',
        short_name: 'Containly',
        description: 'Manage containers across all your Docker hosts.',
        theme_color: '#0B7D72',
        background_color: '#0B7D72',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // API/Health nie aus dem Cache bedienen (Navigation bleibt SPA-Fallback).
        navigateFallbackDenylist: [/^\/api/, /^\/healthz/],
      },
    }),
  ],
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
