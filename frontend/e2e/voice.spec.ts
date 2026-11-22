import { expect, test } from '@playwright/test'
import { openAs, PHONE } from './helpers'

// A fake microphone that behaves like Chrome on Android: the same phrase arrives again and again as it grows,
// as several "final" results, over several events. The report text must contain it once.
const FAKE_MIC = `
  class FakeRec {
    constructor() { this.lang = ''; this.interimResults = false; this.continuous = false; this.onresult = null; this.onend = null; this.onerror = null }
    start() {
      const r = (t, fin) => Object.assign([{ transcript: t }], { isFinal: fin })
      const steps = [
        [r('water is', false)],
        [r('water is finished', true)],
        [r('water is finished', true), r('water is finished need', false)],
        [r('water is finished', true), r('water is finished need medicines', true)],
      ]
      steps.forEach((results, i) => setTimeout(() => this.onresult && this.onresult({ resultIndex: 0, results }), 50 * (i + 1)))
      setTimeout(() => this.onend && this.onend(), 300)
    }
    stop() { this.onend && this.onend() }
  }
  window.SpeechRecognition = FakeRec
  window.webkitSpeechRecognition = FakeRec
`

test('voice report: repeated phrases from the microphone are written once', async ({ browser }) => {
  const errors: string[] = []
  const { ctx, page } = await openAs(browser, 'camp.majuli', errors, PHONE)
  await ctx.addInitScript(FAKE_MIC)
  await page.goto('/camp/report')
  const box = page.getByTestId('report-text')
  await box.fill('300 more people arrived.')
  await page.getByTestId('mic-en').click()
  await expect(page.getByTestId('mic-stop')).toBeVisible() // one recording at a time, with a way to stop
  await expect(page.getByTestId('mic-en')).toBeVisible({ timeout: 3000 })
  await expect(box).toHaveValue('300 more people arrived. water is finished need medicines')
  // a second recording continues after what is already there, still without repeats
  await page.getByTestId('mic-en').click()
  await expect(page.getByTestId('mic-en')).toBeVisible({ timeout: 3000 })
  await expect(box).toHaveValue('300 more people arrived. water is finished need medicines water is finished need medicines')
  expect(errors).toEqual([])
  await ctx.close()
})
