import { useSyncExternalStore } from 'react'

export type ThemePref = 'light' | 'dark' | 'system'
const KEY = 'rahatnet.theme'
const listeners = new Set<() => void>()

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

let pref: ThemePref = read()
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

export const resolved = (p: ThemePref = pref): 'light' | 'dark' => (p === 'system' ? (media?.matches ? 'dark' : 'light') : p)

/** Put `.dark` on <html> (call once before the first render, and on every change). */
export function applyTheme(): void {
  document.documentElement.classList.toggle('dark', resolved() === 'dark')
  document.documentElement.dataset.theme = resolved()
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved() === 'dark' ? '#070d1a' : '#0f766e') // phone status bar
  listeners.forEach((l) => l())
}

export function setTheme(p: ThemePref): void {
  pref = p
  try {
    if (p === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, p)
  } catch {
    /* per-viewer convenience only */
  }
  applyTheme()
}

media?.addEventListener('change', () => pref === 'system' && applyTheme())

/** Current resolved theme ('light' | 'dark'), re-rendering on change. */
export function useTheme(): 'light' | 'dark' {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => resolved(),
  )
}
