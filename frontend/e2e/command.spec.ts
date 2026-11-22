import { expect, test, type Page } from '@playwright/test'
import { as, openAs, SHOTS } from './helpers'

const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` })

// Command Center + app-wide supporting features: theme, notifications, search, alerts to camps.
test('command center, dark theme, notifications, search and send alert', async ({ browser, request }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  const api = await as(request, 'officer')
  const { ctx, page: o } = await openAs(browser, 'officer', errors)
  const { ctx: cctx, page: camp } = await openAs(browser, 'camp.majuli', errors, { width: 390, height: 844 })
  await api.post('/sim/reset', { demo_timeline: true, case: 'highway' })
  await api.post('/sim/advance', { minutes: 100 }) // past the 07:15 Kaziranga flood
  await o.goto('/officer/operations')
  await expect(o.getByTestId('page-title')).toHaveText('Command Center')
  await expect(o.getByTestId('incident').first()).toBeVisible()
  await expect(o.getByTestId('incidents')).toContainText('NH-715')
  await expect(o.getByTestId('intel')).toContainText('mm')
  await expect(o.getByTestId('fleet-truck')).toHaveCount(6)
  await expect(o.getByTestId('suggestion').first()).toBeVisible()

  // an incident focuses the map and opens its details
  await o.getByTestId('incidents').getByText(/camp critical/).first().click()
  await expect(o.getByTestId('ops-details')).toBeVisible()
  await o.getByLabel('Close details').click()

  // dark theme: applies at once and survives a reload
  await o.getByTestId('theme-toggle').click()
  await o.getByTestId('theme-dark').click()
  await expect(o.locator('html')).toHaveClass(/dark/)
  await o.waitForTimeout(800) // map tiles
  await shot(o, '04c-command-center-dark')
  await o.reload()
  await expect(o.locator('html')).toHaveClass(/dark/)
  await expect(o.getByTestId('incident').first()).toBeVisible()

  // notifications: unread count, panel, click → the page that needs you
  await expect(o.getByTestId('notif-count')).toBeVisible()
  await o.getByTestId('notif-bell').click()
  await expect(o.getByTestId('notif-item').first()).toBeVisible()
  await o.waitForTimeout(400) // popover animation
  await shot(o, '22-notifications-dark')
  await o.getByTestId('notif-item').first().click()
  await expect(o).toHaveURL(/\/officer\//)

  // back to light for the rest
  await o.getByTestId('theme-toggle').click()
  await o.getByTestId('theme-light').click()
  await expect(o.locator('html')).not.toHaveClass(/dark/)

  // search (⌘K / Ctrl+K): a camp opens the Command Center on that camp
  await o.keyboard.press('Control+k')
  await o.getByTestId('search-input').fill('majuli')
  await expect(o.getByTestId('search-result').first()).toContainText('Majuli')
  await o.waitForTimeout(400)
  await shot(o, '23-search')
  await o.keyboard.press('Enter')
  await expect(o).toHaveURL(/\/officer\/operations$/)
  await expect(o.getByTestId('ops-details')).toContainText('Majuli')
  await o.getByLabel('Close details').click()

  // send an alert to Majuli → the camp coordinator sees it under Alerts and in notifications
  await o.getByTestId('open-send-alert').click()
  const dlg = o.getByTestId('send-alert')
  await dlg.getByRole('button', { name: 'Majuli', exact: true }).click()
  await dlg.getByTestId('alert-message').fill('Boats are on standby at Nimati Ghat. Keep the elderly ready to move.')
  await o.waitForTimeout(400)
  await shot(o, '24-send-alert')
  await dlg.getByTestId('alert-send').click()
  await expect(dlg).toBeHidden()
  await camp.goto('/camp/alerts')
  await expect(camp.getByTestId('camp-alert').first()).toContainText('Boats are on standby at Nimati Ghat', { timeout: 3000 })
  await expect(camp.getByTestId('notif-count')).toBeVisible()
  await shot(camp, '25-camp-alert-from-officer')

  expect(errors).toEqual([])
  await api.post('/sim/reset', { demo_timeline: true, case: 'highway' })
  await ctx.close()
  await cctx.close()
})

// Supply disruption + Supply agent + continuous weather (Case 2): what the officer and the warehouse manager see.
test('warehouse offline shows as an incident and on the warehouse page; weather and supply agents act', async ({ browser, request }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  const api = await as(request, 'officer')
  const { ctx, page: o } = await openAs(browser, 'officer', errors)
  const { ctx: wctx, page: wh } = await openAs(browser, 'wh.nagaon', errors)
  await api.post('/sim/reset', { demo_timeline: true, case: 'northbank' })
  await api.post('/sim/advance', { minutes: 6 * 60 + 15 }) // 06:00 → 12:15: Nagaon goes offline at 12:10
  await o.goto('/officer/operations')
  await expect(o.getByTestId('incidents')).toContainText('Nagaon warehouse offline')
  await o.getByTestId('incidents').getByText('Nagaon warehouse offline').click()
  await expect(o.getByTestId('ops-details')).toContainText('Offline')
  await o.waitForTimeout(600)
  await shot(o, '26-command-center-warehouse-offline')
  await wh.goto('/warehouse/stock')
  await expect(wh.getByTestId('warehouse-offline')).toContainText('Kolong river')
  await shot(wh, '27-warehouse-offline')
  // the officer's log: hourly weather (advisory raised at 06:00), the outage and the recall
  const log = await api.get<{ kind: string; summary: string }[]>('/log?limit=500')
  expect(log.some((e) => e.kind === 'weather.advisory' && e.summary.includes('Dhemaji'))).toBe(true)
  expect(log.some((e) => e.kind === 'order.recalled' && e.summary.includes('warehouse is offline'))).toBe(true)
  // later the Supply agent re-orders for North Lakhimpur
  await api.post('/sim/advance', { minutes: 150 })
  await o.goto('/officer/agents')
  await expect(o.getByTestId('agent-node-supply')).toBeVisible()
  await expect(o.getByTestId('feed')).toContainText('Re-ordered for North Lakhimpur warehouse')
  expect(errors).toEqual([])
  await api.post('/sim/reset', { demo_timeline: true, case: 'highway' })
  await ctx.close()
  await wctx.close()
})
