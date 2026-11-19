import { expect } from '@playwright/test'
import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test'

export const API = 'http://localhost:8010/api'
export const SHOTS = '../docs/screenshots/walkthrough'
export const PHONE = { width: 390, height: 844 }

export async function token(request: APIRequestContext, username = 'officer'): Promise<string> {
  const r = await request.post(`${API}/auth/login`, { data: { username, password: 'demo1234' } })
  expect(r.ok()).toBeTruthy()
  return ((await r.json()) as { token: string }).token
}

/** REST helper acting as a given demo user. */
export async function as(request: APIRequestContext, username = 'officer') {
  const headers = { Authorization: `Bearer ${await token(request, username)}` }
  return {
    get: async <T>(path: string) => (await (await request.get(`${API}${path}`, { headers })).json()) as T,
    post: async <T>(path: string, data?: unknown) => (await (await request.post(`${API}${path}`, { headers, data })).json()) as T,
  }
}

/** Collects console errors and page errors (must stay empty). */
export function watchErrors(page: Page, errors: string[], ignore: RegExp[] = []): void {
  page.on('console', (m) => {
    if (m.type() === 'error' && !ignore.some((r) => r.test(m.text()))) errors.push(`[${page.url()}] ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`[${page.url()}] pageerror: ${e.message}`))
}

/** A new browser window logged in through the demo-account card on /login. */
export async function openAs(
  browser: Browser,
  username: string,
  errors: string[],
  viewport = { width: 1440, height: 900 },
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport, baseURL: 'http://localhost:5174' })
  const page = await ctx.newPage()
  watchErrors(page, errors)
  await page.goto('/login')
  await page.getByTestId(`demo-${username}`).click()
  await expect(page.getByTestId('page-title')).toBeVisible()
  await expect(page.getByTestId('sim-time')).toHaveText(/D\d \d\d:\d\d/)
  return { ctx, page }
}

export async function go(page: Page, path: string): Promise<void> {
  await page.getByTestId(`nav-${path.split('/')[2]}`).first().evaluate((a: HTMLElement) => a.click())
  await expect(page).toHaveURL(new RegExp(`${path}$`))
}

export async function noHorizontalScroll(page: Page): Promise<void> {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(over, `horizontal overflow on ${page.url()}`).toBeLessThanOrEqual(1)
}
