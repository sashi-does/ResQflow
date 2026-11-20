import { defineConfig } from '@playwright/test'

// Dedicated ports so the smoke test never collides with `make dev` (8000/5173).
const BACKEND_PORT = 8010
const FRONTEND_PORT = 5174

export default defineConfig({
  testDir: './e2e',
  timeout: 240_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    viewport: { width: 1440, height: 900 },
    channel: 'chrome', // system Chrome: no browser download needed
    headless: true,
  },
  webServer: [
    {
      command: `cd ../backend && LLM_PROVIDER=mock DATABASE_URL= SIM_SPEED=600 uv run uvicorn app.main:app --port ${BACKEND_PORT}`,
      url: `http://localhost:${BACKEND_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `BACKEND_PORT=${BACKEND_PORT} npx vite --port ${FRONTEND_PORT} --strictPort`,
      url: `http://localhost:${FRONTEND_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
