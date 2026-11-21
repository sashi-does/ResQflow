import { expect, test } from '@playwright/test'

// Installable app: manifest + icons are served, the service worker takes control, and after one online visit the
// app opens with no network at all. Uses the built frontend that the test backend serves (run `make build` first).
const BASE = 'http://localhost:8010'

test('installable: manifest, icons, service worker, opens offline', async ({ browser, request }) => {
  const m = await request.get(`${BASE}/manifest.webmanifest`)
  test.skip(!m.ok() || (await m.text()).trimStart().startsWith('<'), 'frontend not built (run make build)')
  expect(m.headers()['content-type']).toContain('manifest+json')
  const manifest = await m.json()
  expect(manifest.display).toBe('standalone')
  for (const icon of manifest.icons) expect((await request.get(`${BASE}${icon.src}`)).headers()['content-type']).toContain('image/png')
  const sw = await request.get(`${BASE}/sw.js`)
  expect(sw.headers()['content-type']).toContain('javascript')
  expect(sw.headers()['cache-control']).toContain('no-cache')

  const ctx = await browser.newContext({ baseURL: BASE })
  const page = await ctx.newPage()
  await page.goto('/login')
  await expect(page.getByTestId('demo-officer')).toBeVisible()
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload() // now controlled by the service worker; assets get cached as they load
  await expect(page.getByTestId('demo-officer')).toBeVisible()
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

  await ctx.setOffline(true)
  await page.reload()
  // the shell opens with no signal (the demo cards need the API, the form itself does not)
  await expect(page.getByTestId('login-submit')).toBeVisible()
  await ctx.setOffline(false)
  await ctx.close()
})
