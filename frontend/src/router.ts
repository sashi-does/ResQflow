import { useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  window.addEventListener('popstate', cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('popstate', cb)
  }
}

export function navigate(path: string, replace = false): void {
  if (path === location.pathname) return
  if (replace) history.replaceState(null, '', path)
  else history.pushState(null, '', path)
  listeners.forEach((l) => l())
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => location.pathname)
}
