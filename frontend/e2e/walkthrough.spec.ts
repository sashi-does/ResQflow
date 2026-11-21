import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { as, go, noHorizontalScroll, openAs, PHONE, SHOTS } from './helpers'

const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` })

// The presenter's story from docs/WALKTHROUGH.md: four windows, one per role, on one live world.
test('walkthrough: 4 roles in 4 windows, every page, cross-role updates within 2 s, zero console errors', async ({ browser }) => {
  test.setTimeout(420_000)
  const errors: string[] = []

  // 01 login page
  const anon = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: 'http://localhost:5174' })
  const lp = await anon.newPage()
  await lp.goto('/')
  await expect(lp.getByTestId('intro')).toBeVisible()
  await lp.waitForFunction(() => document.images[0]?.complete && document.images[0].naturalWidth > 0)
  await shot(lp, '00-landing')
  await lp.getByTestId('intro').evaluate((el) => el.scrollTo({ top: 760 }))
  await lp.waitForTimeout(1200) // lazy images below the fold load once scrolled into view
  await shot(lp, '00b-landing-story')
  await lp.goto('/login')
  await expect(lp.getByTestId('demo-officer')).toBeVisible()
  await shot(lp, '01-login')
  await lp.setViewportSize(PHONE)
  await noHorizontalScroll(lp)
  await anon.close()

  // four windows, one per role (sessionStorage keeps each window's login separate)
  const officer = await openAs(browser, 'officer', errors)
  const o = officer.page
  const api = await as(o.request, 'officer')
  await api.post('/sim/reset', { demo_timeline: true })
  await api.post('/policy', { auto_approve_critical: true, max_tonnes: 8, delay_min: 20 }) // the default policy
  const driver = (await openAs(browser, 'driver.t3', errors, PHONE)).page
  const camp = (await openAs(browser, 'camp.majuli', errors, PHONE)).page
  const wh = (await openAs(browser, 'wh.nagaon', errors)).page
  await expect(o.getByTestId('sim-time')).toHaveText('D1 06:00')

  // 03 Simulation: run the demo (30x while the officer approves the first orders, then 600x)
  await go(o, '/officer/simulation')
  await expect(o.getByTestId('cases').getByRole('radio')).toHaveCount(3)
  await o.getByTestId('case-highway').click()
  await o.getByTestId('run-demo').click()
  await api.post('/sim/speed', { multiplier: 30 })
  await expect(o.getByTestId('stat-clock')).toContainText('Running')
  await shot(o, '03-officer-simulation')

  // 10 Approvals at 06:00: the first plan has orders over 6 t; approving them fast is what makes the day go well
  await api.post('/sim/pause')
  await api.post('/sim/advance', { minutes: 1 }) // the first planning cycle runs on the first step
  await go(o, '/officer/approvals')
  const card = o.getByTestId('approval-card').first()
  await expect(card).toBeVisible()
  await expect(card.getByTestId('approval-countdown')).toContainText('Auto-approves in')
  await shot(o, '10-officer-approvals')
  await card.getByTestId('approve').click()
  await expect(o.getByText(/Approved\. Truck T\d/).first()).toBeVisible()
  for (const p of await api.get<{ id: string }[]>('/orders?status=awaiting_approval')) {
    await api.post(`/approvals/${p.id}`, { decision: 'approve' })
  }
  await api.post('/sim/speed', { multiplier: 600 })
  await api.post('/sim/start')

  // 04 Live Operations: the Kaziranga flood at 07:15 and the re-route flash
  await go(o, '/officer/operations')
  await expect(o.locator('.flash-new').first()).toBeAttached({ timeout: 40_000 })
  await o.waitForTimeout(1300)
  await api.post('/sim/pause')
  await shot(o, '04-officer-live-operations')
  const frameBefore = (await o.getByTestId('ops-frame').boundingBox())!.height
  const mapBefore = (await o.getByTestId('ops-map').boundingBox())!.height
  await o.locator('path.camp-critical').first().click({ force: true })
  await expect(o.getByTestId('ops-details')).toBeVisible()
  await o.waitForTimeout(300)
  // a long details panel scrolls inside its card; the map and the frame keep their size
  expect((await o.getByTestId('ops-frame').boundingBox())!.height).toBeCloseTo(frameBefore, 0)
  expect((await o.getByTestId('ops-map').boundingBox())!.height).toBeCloseTo(mapBefore, 0)
  const scroller = o.getByTestId('ops-details-scroll')
  expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  await shot(o, '04b-officer-live-operations-details')

  // 02 Overview (now with a situation to show)
  await go(o, '/officer/overview')
  await expect(o.getByTestId('stat-critical')).toBeVisible()
  await expect(o.getByTestId('latest-decisions')).toBeVisible()
  await shot(o, '02-officer-overview')

  // 05/06 Driver: full-screen alert, acknowledge → officer's AI Agents log within 2 s
  await go(o, '/officer/agents')
  const alert = driver.getByTestId('reroute-alert')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText('NH-715')
  await shot(driver, '05-driver-reroute-alert')
  const t0 = Date.now()
  await driver.getByTestId('ack').click()
  await expect(o.getByTestId('feed').locator('[data-kind="driver.ack"]').first()).toBeVisible({ timeout: 2000 })
  expect(Date.now() - t0).toBeLessThan(2000)
  await expect(o.getByTestId('feed').locator('[data-kind="driver.ack"]').first()).toContainText('Bikash Kalita')
  await expect(alert).toHaveCount(0)
  await expect(driver.getByTestId('route-steps')).toContainText('NH-29')
  await noHorizontalScroll(driver)
  await shot(driver, '06-driver-my-trip')

  // 07 Camp: my camp
  await expect(camp.getByTestId('camp-banner')).toBeVisible()
  await noHorizontalScroll(camp)
  await shot(camp, '07-camp-my-camp')
  // 11 AI Agents, 12 Ask ResQflow (mock mode: clear needs-key state)
  await go(o, '/officer/agents')
  await expect(o.getByTestId('agents-view')).toBeVisible()
  await expect(o.getByTestId('feed').locator('[data-kind="order.approved"]').first()).toContainText('Ritu Baruah')
  await shot(o, '11-officer-ai-agents')
  await expect(o.getByTestId('coordination-cycle').first()).toBeVisible()
  // pick a cycle: the agents that took part light up, numbered in order; Replay steps through the hand-offs
  await o.getByTestId('replay').click()
  await expect(o.getByTestId('replay-caption')).toBeVisible()
  await expect(o.locator('[data-testid^="agent-node-"][data-active="true"]').first()).toBeVisible()
  await o.waitForTimeout(2000)
  await shot(o, '11-officer-ai-agents-replay')
  await o.getByTestId('coordination-timeline').scrollIntoViewIfNeeded()
  await shot(o, '11b-officer-ai-agents-timeline')
  // a timeline row opens the cycle in a side panel: every step in order
  await o.getByTestId('coordination-cycle').first().click()
  await expect(o.getByTestId('detail-sheet')).toBeVisible()
  await expect(o.getByTestId('cycle-steps').locator('li').nth(1)).toBeVisible()
  await o.waitForTimeout(700) // slide-in animation
  await shot(o, '11c-officer-cycle-detail')
  await o.keyboard.press('Escape')
  await expect(o.getByTestId('detail-sheet')).toBeHidden()
  // a decision-log row opens the entry: reasoning, references, its cycle
  await o.getByTestId('log-row').first().click()
  await expect(o.getByTestId('detail-sheet')).toBeVisible()
  await expect(o.getByTestId('open-cycle')).toBeVisible()
  await o.waitForTimeout(700)
  await shot(o, '11d-officer-log-entry')
  await o.keyboard.press('Escape')
  await go(o, '/officer/ask')
  await o.getByTestId('copilot-example').first().click()
  await expect(o.getByTestId('copilot-answer').first()).toContainText(/API key|needs/i)
  await shot(o, '12-officer-ask-resqflow')

  // 13-15 Warehouse
  await expect(wh.getByTestId('stock-chart')).toBeVisible()
  await shot(wh, '13-warehouse-stock')
  await go(wh, '/warehouse/queue')
  await expect(wh.getByTestId('loading-queue')).toBeVisible()
  const mark = wh.getByTestId('mark-loaded').first()
  if (await mark.count()) {
    await mark.click()
    await expect(wh.getByText(/marked loaded/)).toBeVisible()
  }
  await shot(wh, '14-warehouse-loading-queue')
  await go(wh, '/warehouse/receive')
  await wh.getByTestId('adjust-stock').click()
  await expect(wh.getByText('Stock received. The coordinator will re-plan.')).toBeVisible()
  await shot(wh, '15-warehouse-receive-stock')

  // 16 Driver road report → officer sees an unverified report
  await go(driver, '/driver/report-road')
  await driver.getByTestId('report-landslide').click()
  await expect(driver.getByText('Reported. The District Officer will verify it.')).toBeVisible()
  await noHorizontalScroll(driver)
  await shot(driver, '16-driver-report-road')
  await go(o, '/officer/field-reports')
  await o.getByTestId('tab-road-reports').click()
  await expect(o.getByTestId('road-report-row').first()).toContainText('Landslide', { timeout: 2000 })

  // Afternoon: the Majuli ferry flooded at 11:00, Morigaon is cut off at 15:30. The officer approves as orders come in.
  const approveAll = async () => {
    for (const p of await api.get<{ id: string }[]>('/orders?status=awaiting_approval')) {
      await api.post(`/approvals/${p.id}`, { decision: 'approve' })
    }
  }
  for (let i = 0; i < 40; i++) {
    await approveAll()
    const sim = await api.post<{ sim_time: string }>('/sim/advance', { minutes: 20 })
    if (sim.sim_time >= 'D1 16:00') break
  }
  await expect(o.getByTestId('sim-time')).toHaveText(/D1 16:/)

  // 08/09 Camp: the Assamese report → officer confirms within 2 s → the camp sees it confirmed
  await go(camp, '/camp/report')
  await go(o, '/officer/overview')
  await go(o, '/officer/field-reports')
  await o.getByTestId('tab-camp-reports').click()
  await camp.getByTestId('example-chip').first().click()
  await camp.getByTestId('send-report').click()
  const t1 = Date.now()
  await expect(camp.getByTestId('field-report-status').first()).toHaveText('Sent to District Officer for confirmation')
  await expect(camp.getByTestId('ai-understood').first()).toContainText('population 4,800 → 7,000')
  await noHorizontalScroll(camp)
  await shot(camp, '08-camp-send-report')

  // officer confirms the report (arrives within 2 s); the camp sees it confirmed
  const row = o.getByTestId('field-report-row').first()
  await expect(row).toContainText('Majuli', { timeout: 2000 })
  expect(Date.now() - t1).toBeLessThan(2500)
  await shot(o, '09-officer-field-reports')
  await row.getByTestId('confirm-report').click()
  await expect(camp.getByTestId('field-report-status').first()).toHaveText('Confirmed by the District Officer', { timeout: 2000 })


  // Rest of the day: an officer who approves pending orders every 20 sim-min, until D2 06:00
  await go(o, '/officer/reports')
  for (let i = 0; i < 80; i++) {
    for (const p of await api.get<{ id: string }[]>('/orders?status=awaiting_approval')) {
      await api.post(`/approvals/${p.id}`, { decision: 'approve' })
    }
    const sim = await api.post<{ ended: boolean }>('/sim/advance', { minutes: 20 })
    if (sim.ended) break
  }
  await expect(o.getByTestId('sim-time')).toHaveText('D2 06:00', { timeout: 10_000 })

  // 19 Reports: the after-action report numbers equal the live KPI table
  await expect(o.getByTestId('report')).toBeVisible({ timeout: 10_000 })
  for (const key of ['people_hours_without_water', 'deliveries_on_time_pct', 'truck_hours_stuck', 'avg_delivery_min', 'supplies_delivered_kg']) {
    expect(await o.getByTestId(`report-${key}`).textContent(), key).toBe(await o.getByTestId(`kpi-cell-${key}`).textContent())
  }
  const k = await api.get<{ agentic: { people_hours_without_water: number }; baseline: { people_hours_without_water: number } }>('/kpis')
  console.log('LIVE KPIs (officer approves every 20 min):', JSON.stringify(k))
  expect(k.agentic.people_hours_without_water).toBeLessThanOrEqual(0.7 * k.baseline.people_hours_without_water)
  await shot(o, '19-officer-reports')

  // 17/18 Camp: confirm a delivery received, bilingual alerts
  await go(camp, '/camp/deliveries')
  await expect(camp.getByTestId('delivery-check').first()).toBeVisible()
  await camp.getByTestId('confirm-received').first().click()
  await expect(camp.getByText('Delivery confirmed. Thank you.')).toBeVisible()
  await noHorizontalScroll(camp)
  await shot(camp, '17-camp-deliveries')
  await go(camp, '/camp/alerts')
  await expect(camp.getByTestId('camp-alert').first()).toBeVisible()
  await expect(camp.getByTestId('camp-alert').first()).toContainText('ট্ৰাক')
  await noHorizontalScroll(camp)
  await shot(camp, '18-camp-alerts')

  // 20 Driver history
  await go(driver, '/driver/history')
  await expect(driver.getByRole('row').nth(1)).toBeVisible()
  await noHorizontalScroll(driver)
  await shot(driver, '20-driver-history')

  // 21 a wrong-role URL
  await driver.goto('/officer/approvals')
  await expect(driver.getByTestId('forbidden')).toBeVisible()
  await shot(driver, '21-forbidden')

  await api.post('/policy', { auto_approve_critical: true, max_tonnes: 8, delay_min: 20 })
  expect(errors, errors.join('\n')).toEqual([])
})
