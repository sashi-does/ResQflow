import { expect, test } from '@playwright/test'

const SHOTS = '../docs/screenshots'

test('intro: cited facts, how it works, roles, one click to the live demo, tour', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))

  await page.request.post('http://localhost:8010/api/sim/reset', { data: { demo_timeline: true } })
  await page.goto('/')
  await expect(page.getByTestId('intro')).toBeVisible()
  const facts = page.locator('figure')
  await expect(facts).toHaveCount(3)
  for (let i = 0; i < 3; i++) {
    await expect(facts.nth(i).locator('figcaption a')).toHaveAttribute('href', /^https:\/\//)
  }
  await expect(page.getByText('How it works')).toBeVisible()
  for (const r of ['command', 'camp', 'driver', 'warehouse']) await expect(page.getByTestId(`role-card-${r}`)).toBeVisible()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${SHOTS}/00-intro.png`, fullPage: true })

  await page.getByTestId('watch-demo').click()
  await expect(page).toHaveURL(/\/command$/)
  await expect(page.getByTestId('sim-time')).not.toHaveText('D1 06:00', { timeout: 15_000 }) // running
  await page.getByRole('button', { name: 'pause' }).click()

  await page.getByTestId('tour-button').click()
  await expect(page.getByTestId('tour')).toContainText('Step 1 of 5')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByTestId('tour')).toContainText('Agent feed')
  await page.screenshot({ path: `${SHOTS}/07-guided-tour.png` })
  await page.getByRole('button', { name: 'Skip' }).click()

  await page.getByTestId('role-switcher').selectOption('/driver/T3')
  await expect(page).toHaveURL(/\/driver\/T3$/)
  expect(errors, errors.join('\n')).toEqual([])
})
