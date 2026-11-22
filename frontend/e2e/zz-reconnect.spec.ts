import { execSync, spawn } from 'node:child_process'
import { expect, test } from '@playwright/test'

const BACKEND_PORT = 8010

function killBackend(): void {
  const pids = execSync(`lsof -ti tcp:${BACKEND_PORT} -sTCP:LISTEN || true`).toString().trim()
  if (pids) execSync(`kill ${pids.split('\n').join(' ')}`)
}

// Runs last (zz-): it kills the shared test backend and only restores it for its own duration.
test('UI shows a banner when the backend dies and recovers when it comes back', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/login')
  await page.getByTestId('demo-officer').click()
  await expect(page.getByTestId('page-title')).toBeVisible()
  await page.goto('/officer/simulation')
  await expect(page.getByTestId('sim-time')).toHaveText(/D\d \d\d:\d\d/)
  await expect(page.getByTestId('connection-banner')).toHaveCount(0)

  killBackend()
  await expect(page.getByTestId('connection-banner')).toBeVisible({ timeout: 15_000 })

  const server = spawn('uv', ['run', 'uvicorn', 'app.main:app', '--port', String(BACKEND_PORT)], {
    cwd: '../backend',
    stdio: 'ignore',
    env: { ...process.env, LLM_PROVIDER: 'mock', DATABASE_URL: '', COPILOT_PROVIDER: '' },
    detached: true,
  })
  try {
    await expect(page.getByTestId('connection-banner')).toHaveCount(0, { timeout: 30_000 })
    await expect(page.getByTestId('sim-time')).toHaveText('D1 06:00') // fresh server -> fresh snapshot, same login
    await expect(page).toHaveURL(/\/officer\/simulation$/)
    await page.getByTestId('run-demo').click()
    await expect(page.getByTestId('stat-clock')).toContainText('Running')
  } finally {
    if (server.pid) process.kill(-server.pid)
  }
  expect(errors).toEqual([])
})
