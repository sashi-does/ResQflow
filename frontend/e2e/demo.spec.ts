import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const SHOTS = '../docs/screenshots'

async function simTime(page: Page): Promise<string> {
  return (await page.getByTestId('sim-time').textContent()) ?? ''
}

test('demo run: trucks move, flood + re-route flash, approval, KPIs, zero console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))

  await page.goto('/command')
  await expect(page.getByTestId('sim-time')).toHaveText('D1 06:00')
  await expect(page.locator('.leaflet-interactive').first()).toBeVisible()
  await expect(page.getByTestId('legend')).toBeVisible()
  // keep approval cards on screen long enough to photograph them (policy countdown 2 h)
  await page.request.post('http://localhost:8010/api/policy', {
    data: { auto_approve_critical: true, max_tonnes: 8, delay_min: 120 },
  })

  // 600x: one sim-hour every 6 s
  await page.getByRole('button', { name: '600x' }).click()
  await page.getByTestId('run-demo').click()
  await expect(page.getByTestId('feed').locator('[data-kind="order.dispatched"]').first()).toBeVisible()
  await expect(page.getByTestId('kpi-collecting').first()).toBeVisible() // no misleading early deltas

  // 1. normal run: trucks on the road
  await expect.poll(() => simTime(page), { timeout: 20_000 }).toMatch(/D1 06:[3-5]\d/)
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${SHOTS}/01-normal-run.png` })

  // smooth motion: over ~1 s of animation frames a moving truck marker takes many distinct positions
  const distinct = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const markers = [...document.querySelectorAll<HTMLElement>('.leaflet-marker-icon')].filter((m) =>
          m.querySelector('.truck-icon'),
        )
        const seen = markers.map(() => new Set<string>())
        const t0 = performance.now()
        const sample = () => {
          markers.forEach((m, i) => seen[i].add(m.style.transform))
          if (performance.now() - t0 < 1000) requestAnimationFrame(sample)
          else resolve(Math.max(...seen.map((x) => x.size)))
        }
        requestAnimationFrame(sample)
      }),
  )
  expect(distinct).toBeGreaterThanOrEqual(8) // without interpolation: 1-2 jumps per second

  // 2. 07:15 Kaziranga flood: polygon, red road, re-route flash
  const reroute = page.getByTestId('feed').locator('[data-kind="truck.rerouted"]').first()
  await expect(reroute).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.hazard-poly').first()).toBeVisible()
  await expect(page.locator('.road-blocked').first()).toBeAttached()
  await page.waitForTimeout(600) // old route still red
  await page.screenshot({ path: `${SHOTS}/02a-flood-old-route-red.png` })
  await expect(page.locator('.flash-new').first()).toBeAttached({ timeout: 4_000 })
  await page.waitForTimeout(1300) // new route drawn in green + label
  await page.screenshot({ path: `${SHOTS}/02-flood-reroute-flash.png` })
  await expect(reroute).toContainText('Re-routed Truck T3')

  // 3. approval card; approving dispatches the truck
  await page.getByRole('button', { name: 'pause' }).click()
  await page.getByTestId('tab-approvals').click()
  const card = page.getByTestId('approval-card').first()
  await expect(card).toBeVisible()
  await expect(card.getByTestId('approval-countdown')).toContainText('Auto-approves in')
  await page.screenshot({ path: `${SHOTS}/03-approval-card.png` })
  await card.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText(/Order approved\. T\d dispatched\./)).toBeVisible()

  // 4. camps tab
  await page.getByTestId('tab-camps').click()
  await expect(page.locator('table tbody tr')).toHaveCount(8)
  await page.screenshot({ path: `${SHOTS}/05-camps-tab.png` })

  // 5. Rest of the day with a District Officer who approves pending orders every 20 sim-min
  //    (same REST call as the Approve button), then the KPI strip at D2 06:00.
  if (!process.env.SKIP_KPI) {
    await page.getByTestId('tab-feed').click()
    const api = 'http://localhost:8010/api'
    for (let i = 0; i < 70; i++) {
      const pending = (await (await page.request.get(`${api}/orders?status=awaiting_approval`)).json()) as { id: string }[]
      for (const o of pending) {
        await page.request.post(`${api}/approvals/${o.id}`, { data: { decision: 'approve' } })
      }
      const sim = (await (await page.request.post(`${api}/sim/advance`, { data: { minutes: 20 } })).json()) as {
        ended: boolean
      }
      if (sim.ended) break
    }
    await expect(page.getByTestId('sim-time')).toHaveText('D2 06:00', { timeout: 10_000 })
    await page.waitForTimeout(7000) // let the 07:15 flash and toasts expire (6.5 s / 4 s)
    await expect(page.locator('.flash-new')).toHaveCount(0)
    await expect(page.getByTestId('kpi-strip')).toBeVisible()
    await expect(page.getByTestId('kpi-collecting')).toHaveCount(0)
    await page.screenshot({ path: `${SHOTS}/04-kpi-strip.png` })
    const k = (await (await page.request.get(`${api}/kpis`)).json()) as {
      agentic: { people_hours_without_water: number }
      baseline: { people_hours_without_water: number }
    }
    console.log('LIVE KPIs (officer approves every 20 min):', JSON.stringify(k))
    expect(k.agentic.people_hours_without_water).toBeLessThanOrEqual(0.7 * k.baseline.people_hours_without_water)
  }

  await page.request.post('http://localhost:8010/api/policy', {
    data: { auto_approve_critical: true, max_tonnes: 8, delay_min: 20 },
  })
  expect(errors, errors.join('\n')).toEqual([])
})
