import { execSync, spawn } from 'node:child_process'
import { expect, test } from '@playwright/test'

const BACKEND_PORT = 8010

function killBackend(): void {
  const pids = execSync(`lsof -ti tcp:${BACKEND_PORT} -sTCP:LISTEN || true`).toString().trim()
  if (pids) execSync(`kill ${pids.split('\n').join(' ')}`)
}

test('UI shows a banner when the backend dies and recovers when it comes back', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/command')
  await expect(page.getByTestId('sim-time')).toHaveText(/D\d \d\d:\d\d/)
  await expect(page.getByText('Connection to the simulation lost')).toHaveCount(0)

  killBackend()
  await expect(page.getByText('Connection to the simulation lost. Reconnecting…')).toBeVisible({ timeout: 15_000 })

  const server = spawn('uv', ['run', 'uvicorn', 'app.main:app', '--port', String(BACKEND_PORT)], {
    cwd: '../backend',
    stdio: 'ignore',
    detached: true,
  })
  try {
    await expect(page.getByText('Connection to the simulation lost')).toHaveCount(0, { timeout: 30_000 })
    await expect(page.getByTestId('sim-time')).toHaveText('D1 06:00') // fresh server -> fresh snapshot
    await page.getByTestId('run-demo').click()
    await expect(page.getByTestId('feed').locator('[data-kind="order.dispatched"]').first()).toBeVisible()
  } finally {
    if (server.pid) process.kill(-server.pid)
  }
  expect(errors).toEqual([])
})
