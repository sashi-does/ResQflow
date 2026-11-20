import { expect, test } from '@playwright/test'
import { API, watchErrors } from './helpers'

test('login form, demo cards, wrong role → 403, protected routes, logout', async ({ page, request }) => {
  const errors: string[] = []
  watchErrors(page, errors, [/401/]) // the wrong-password attempt below is an expected 401

  // protected route without a session → /login
  await page.goto('/officer/overview')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText('Demo accounts')).toBeVisible()
  await expect(page.getByText('Hackathon demo. All users are fictional')).toBeVisible()
  for (const u of ['officer', 'camp.majuli', 'camp.morigaon', 'driver.t3', 'wh.nagaon']) {
    await expect(page.getByTestId(`demo-${u}`)).toBeVisible()
  }

  // wrong password
  await page.getByLabel('Username').fill('officer')
  await page.getByLabel('Password').fill('wrong')
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('login-error')).toHaveText('Wrong username or password.')

  // form login
  await page.getByLabel('Password').fill('demo1234')
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/officer\/overview$/)
  await expect(page.getByTestId('page-title')).toHaveText('Overview')
  await expect(page.getByTestId('page-purpose')).not.toBeEmpty()
  await expect(page.getByTestId('role-badge')).toContainText('District Officer')

  // why-this-page popover
  await page.getByTestId('why-button').click()
  await expect(page.getByTestId('why-popover')).toContainText('Problem')
  await expect(page.getByTestId('why-popover')).toContainText('Who uses it')
  await page.keyboard.press('Escape')

  // wrong-role URL → 403 page
  await page.goto('/driver/trip')
  await expect(page.getByTestId('forbidden')).toBeVisible()
  await expect(page.getByTestId('forbidden')).toContainText('Ritu Baruah')

  // logout
  await page.getByRole('button', { name: 'Sign in as someone else' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/officer/approvals')
  await expect(page).toHaveURL(/\/login$/)

  // a driver token is refused by an officer-only API (403)
  const t = ((await (await request.post(`${API}/auth/login`, { data: { username: 'driver.t3', password: 'demo1234' } })).json()) as { token: string }).token
  expect((await request.post(`${API}/sim/start`, { headers: { Authorization: `Bearer ${t}` } })).status()).toBe(403)

  expect(errors, errors.join('\n')).toEqual([])
})

test('sim controls exist only on the officer Simulation page', async ({ page }) => {
  await page.goto('/login')
  await page.getByTestId('demo-officer').click()
  await expect(page.getByTestId('page-title')).toBeVisible()
  for (const slug of ['overview', 'operations', 'approvals', 'field-reports', 'agents', 'ask', 'reports']) {
    await page.goto(`/officer/${slug}`)
    await expect(page.getByTestId('page-title')).toBeVisible()
    await expect(page.getByTestId('run-demo')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^(Play|Pause)$/ })).toHaveCount(0)
  }
  await page.goto('/officer/simulation')
  await expect(page.getByTestId('run-demo')).toBeVisible()

  // collapsible sidebar: icons only, remembered across reloads
  const aside = page.getByRole('complementary', { name: 'Sidebar' })
  await expect(aside).toHaveAttribute('data-collapsed', 'false')
  await page.getByTestId('sidebar-toggle').click()
  await expect(aside).toHaveAttribute('data-collapsed', 'true')
  await expect(page.getByTestId('nav-approvals')).toHaveAttribute('aria-label', 'Approvals')
  await page.reload()
  await expect(page.getByRole('complementary', { name: 'Sidebar' })).toHaveAttribute('data-collapsed', 'true')
  await page.getByTestId('sidebar-toggle').click()
  await expect(page.getByRole('complementary', { name: 'Sidebar' })).toHaveAttribute('data-collapsed', 'false')
})
