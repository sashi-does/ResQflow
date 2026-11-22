/** Speech-to-text helpers for the camp's voice report (Web Speech API). */

export interface SpeechAlt {
  transcript: string
}
export interface SpeechResultLike extends ArrayLike<SpeechAlt> {
  isFinal?: boolean
}
export interface SpeechRec {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { resultIndex?: number; results: ArrayLike<SpeechResultLike> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error?: string }) => void) | null
  start: () => void
  stop: () => void
}

export function speechCtor(): (new () => SpeechRec) | null {
  const w = window as unknown as Record<string, unknown>
  return ((w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => SpeechRec) | undefined) ?? null
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Everything heard in one recording, without repeats. Browsers (Chrome on Android especially) often report the same
 * phrase again as it grows ("water", "water is", "water is finished"): a phrase that extends the text so far replaces
 * it, a phrase already contained in it is skipped, and anything new is appended.
 */
export function mergeTranscripts(parts: string[]): string {
  let acc = ''
  for (const raw of parts) {
    const p = raw.trim()
    if (!p) continue
    const a = norm(acc)
    const n = norm(p)
    if (!a || n.startsWith(a)) acc = p
    else if (a.endsWith(n) || a.includes(n)) continue
    else acc = `${acc} ${p}`
  }
  return acc.trim()
}

/** The text of every result so far in this recording, finals first, then the latest partial if there is one. */
export function transcriptOf(results: ArrayLike<SpeechResultLike>): string {
  const parts: string[] = []
  for (let i = 0; i < results.length; i++) {
    const t = results[i]?.[0]?.transcript ?? ''
    if (results[i].isFinal !== false || i === results.length - 1) parts.push(t)
  }
  return mergeTranscripts(parts)
}
