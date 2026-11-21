import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// doc 11: accessibility on the login page and the officer Overview (axe-core, the engine behind Lighthouse's a11y score)
for (const [name, path, login] of [
  ['landing', '/', false],
  ['login', '/login', false],
  ['officer overview', '/officer/overview', true],
  ['camp send report (phone)', '/camp/report', true],
] as const) {
  test(`a11y: ${name} has no serious or critical axe violations`, async ({ page }) => {
    if (path.startsWith('/camp')) await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(path === '/' ? '/' : '/login')
    if (login) {
      await page.getByTestId(path.startsWith('/camp') ? 'demo-camp.majuli' : 'demo-officer').click()
      await expect(page.getByTestId('page-title')).toBeVisible()
      await page.goto(path)
      await expect(page.getByTestId('page-title')).toBeVisible()
    } else if (path === '/') {
      await expect(page.getByTestId('intro')).toBeVisible()
    } else {
      await expect(page.getByTestId('demo-officer')).toBeVisible()
    }
    const res = await new AxeBuilder({ page }).exclude('.leaflet-container').analyze()
    const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    console.log(`${name}: ${res.violations.length} violations (${bad.length} serious/critical), ${res.passes.length} rules pass`)
    for (const v of res.violations) console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.target}`)
    expect(bad).toEqual([])
  })
}

// The Command Center in both themes (dark mode flips the colour scale, so check contrast there too).
for (const theme of ['light', 'dark'] as const) {
  test(`a11y: command center (${theme}) has no serious or critical axe violations`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('resqflow.theme', t), theme)
    await page.goto('/login')
    await page.getByTestId('demo-officer').click()
    await expect(page.getByTestId('page-title')).toBeVisible()
    await page.goto('/officer/operations')
    await expect(page.getByTestId('intel')).toBeVisible()
    await page.waitForTimeout(500)
    const res = await new AxeBuilder({ page }).exclude('.leaflet-container').analyze()
    const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    for (const v of res.violations) console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes.slice(0, 4).map((n) => n.target).join(' | ')}`)
    expect(bad).toEqual([])
  })
}
