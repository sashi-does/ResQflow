import { expect, test } from '@playwright/test'

const SHOTS = '../docs/screenshots'
const API = 'http://localhost:8010/api'

test('roles: driver alert + ack, Assamese field report + Command confirm, road report, warehouse', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/command')
  await expect(page.getByTestId('sim-time')).toHaveText('D1 06:00')
  await page.request.post(`${API}/sim/reset`, { data: { demo_timeline: true } })
  await page.request.post(`${API}/sim/advance`, { data: { minutes: 76 } }) // past the 07:15 Kaziranga flood
  await expect(page.getByTestId('feed').locator('[data-kind="truck.rerouted"]').first()).toBeVisible()

  // --- Driver T3 gets the full-screen re-route alert
  await page.getByTestId('role-switcher').selectOption('/driver/T3')
  const alert = page.getByTestId('reroute-alert')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText('NH-715 flooded near')
  await expect(page.getByTestId('route-steps')).toContainText('NH-29')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${SHOTS}/08-driver-reroute-alert.png` })
  await page.getByTestId('ack').click()
  await expect(alert).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/09-driver-view.png` })

  // driver reports a landslide on the road ahead (unverified)
  await page.locator('[data-testid="phone"] button.btn-chip').filter({ hasText: 'NH-29' }).first().click()
  await page.getByTestId('report-landslide').click()

  // --- Command sees the ack within 2 s, and the unverified report needing a check
  await page.getByTestId('role-switcher').selectOption('/command')
  await expect(page.getByTestId('feed').locator('[data-kind="driver.ack"]').first()).toBeVisible({ timeout: 2000 })
  await page.getByTestId('tab-approvals').click()
  await expect(page.getByTestId('attention-hazard').first()).toContainText('Landslide')

  // --- Camp Coordinator (Majuli) sends the Assamese report
  await page.getByTestId('role-switcher').selectOption('/camp/C7')
  await page.getByRole('button', { name: 'Example: অসমীয়া' }).click()
  await page.getByTestId('send-report').click()
  await expect(page.getByTestId('field-report-status').first()).toHaveText('Waiting for Command to confirm')
  await expect(page.getByTestId('field-report').first()).toContainText('population 4,800 → 7,000')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${SHOTS}/10-camp-coordinator.png` })

  // --- Command confirms the AI's reading (within 2 s it is in the feed)
  await page.getByTestId('role-switcher').selectOption('/command')
  await page.getByTestId('tab-approvals').click()
  const card = page.getByTestId('attention-report').first()
  await expect(card).toContainText('কমলাবাৰীৰ')
  await page.screenshot({ path: `${SHOTS}/11-command-confirm-field-report.png` })
  await card.getByRole('button', { name: 'Confirm' }).click()
  await page.getByTestId('tab-feed').click()
  await expect(page.getByTestId('feed').locator('[data-kind="field_report.confirmed"]').first()).toBeVisible({ timeout: 2000 })

  // the camp sees it confirmed
  await page.getByTestId('role-switcher').selectOption('/camp/C7')
  await expect(page.getByTestId('field-report-status').first()).toHaveText('Confirmed by Command')

  // --- Warehouse
  await page.getByTestId('role-switcher').selectOption('/warehouse/W2')
  await expect(page.getByText('Nagaon warehouse')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/12-warehouse.png` })
  await page.getByTestId('adjust-stock').click()
  await expect(page.getByText('Stock updated. The coordinator will re-plan.')).toBeVisible()

  expect(errors, errors.join('\n')).toEqual([])
})
