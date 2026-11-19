import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

// Dev: proxy /api and /ws to the FastAPI backend on :8000.
// Build: output straight into the backend so FastAPI serves it from `/`.
const backendPort = process.env.BACKEND_PORT ?? '8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: {
    port: 5173,
    proxy: {
      '/api': `http://localhost:${backendPort}`,
      '/ws': { target: `ws://localhost:${backendPort}`, ws: true },
    },
  },
  build: {
    outDir: '../backend/app/static',
    emptyOutDir: true,
  },
})
