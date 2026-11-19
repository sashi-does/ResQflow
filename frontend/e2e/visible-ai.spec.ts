import { expect, test } from '@playwright/test'

const SHOTS = '../docs/screenshots'
const API = 'http://localhost:8010/api'

test('agents view animates on agent actions; copilot shows a clear needs-key state in mock mode', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))

  await page.request.post(`${API}/sim/reset`, { data: { demo_timeline: true } })
  await page.goto('/command')
  await expect(page.getByTestId('sim-time')).toHaveText('D1 06:00')
  await page.request.post(`${API}/sim/advance`, { data: { minutes: 60 } })
  await page.getByTestId('tab-agents').click()
  await expect(page.getByTestId('agents-view')).toBeVisible()

  // a flood: Monitor and Routing light up, with the Monitor -> Routing message
  await page.request.post(`${API}/hazards/trigger`, { data: { preset_id: 'F1' } })
  await expect(page.getByTestId('agent-node-monitor')).toHaveAttribute('data-active', 'true', { timeout: 2000 })
  await expect(page.getByTestId('agent-node-routing')).toHaveAttribute('data-active', 'true')
  await expect(page.locator('line[data-active="true"]').first()).toBeAttached()
  await page.screenshot({ path: `${SHOTS}/13-agents-view.png` })
  // ... and calms down again
  await expect(page.getByTestId('agent-node-monitor')).toHaveAttribute('data-active', 'false', { timeout: 4000 })

  // planning cycle: Coordinator, Validator, Dispatcher light up
  await page.request.post(`${API}/replan`)
  await expect(page.getByTestId('agent-node-coordinator')).toHaveAttribute('data-active', 'true', { timeout: 2000 })
  await expect(page.getByTestId('agents-view')).toContainText('offline (heuristic)')

  // copilot
  await page.getByTestId('copilot-button').click()
  await page.getByRole('button', { name: "Why isn't Morigaon getting supplies?" }).click()
  await expect(page.getByTestId('copilot-answer').first()).toContainText('needs an API key')
  await page.screenshot({ path: `${SHOTS}/14-copilot-mock.png` })
  expect(errors, errors.join('\n')).toEqual([])
})
