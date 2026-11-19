import { expect, test } from '@playwright/test'

const SHOTS = '../docs/screenshots'
const API = 'http://localhost:8010/api'

test('keyboard shortcuts, drawn flood, sitrep: zero console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))

  await page.request.post(`${API}/sim/reset`, { data: { demo_timeline: true } })
  await page.goto('/command')
  await expect(page.getByTestId('sim-time')).toHaveText('D1 06:00')

  // Space = play, Space = pause
  await page.locator('body').press('Space')
  await expect(page.getByRole('button', { name: 'pause' })).toBeEnabled()
  await page.locator('body').press('Space')
  await expect(page.getByRole('button', { name: 'play' })).toBeEnabled()

  // 4 = Gohpur flood preset
  await page.locator('body').press('4')
  await expect(page.locator('.hazard-label', { hasText: 'Subansiri surge' })).toBeVisible()

  // draw a flood around Morigaon
  await page.getByRole('button', { name: 'Draw flood' }).click()
  const label = await page.locator('.node-label', { hasText: /^Morigaon$/ }).boundingBox()
  expect(label).not.toBeNull()
  const cx = label!.x - 8 // the node dot sits just left of its label
  const cy = label!.y + label!.height / 2
  for (const [dx, dy] of [
    [-30, -30],
    [30, -30],
    [30, 30],
    [-30, 30],
  ]) {
    await page.mouse.click(cx + dx, cy + dy)
  }
  await page.getByRole('button', { name: /Finish \(4\)/ }).click()
  await expect(page.getByText(/Flood added: \d road segments? closed/)).toBeVisible()
  await expect(page.getByTestId('feed').getByText('Reported flooding (drawn on map)').first()).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/06-drawn-flood-and-shortcuts.png` })

  // sitrep appears at D1 09:00
  await page.request.post(`${API}/sim/advance`, { data: { minutes: 185 } })
  await expect(page.getByTestId('feed').getByText(/Situation report, D1 09:00/)).toBeVisible()

  expect(errors, errors.join('\n')).toEqual([])
})
