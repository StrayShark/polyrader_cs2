import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// In Tauri dev mode, the sidecar runs on port 13001.
// In standalone web dev mode, the server runs on port 3001/3002.
const SIDECAR_PORT = 13001;
const isTauri = process.env.TAURI_ENV !== undefined || process.env.TAURI_DEV === 'true';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: isTauri
      ? {
          '/api': {
            target: `http://localhost:${SIDECAR_PORT}`,
            changeOrigin: true,
          },
          '/ws': {
            target: `ws://localhost:${SIDECAR_PORT}`,
            ws: true,
          },
        }
      : {
          '/api': {
            target: 'http://localhost:3001',
            changeOrigin: true,
          },
          '/ws': {
            target: 'ws://localhost:3001',
            ws: true,
          },
        },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
