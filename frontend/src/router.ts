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

export function navigate(path: string): void {
  if (path === location.pathname) return
  history.pushState(null, '', path)
  listeners.forEach((l) => l())
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => location.pathname)
}

export type Route =
  | { page: 'intro' }
  | { page: 'command' }
  | { page: 'camp'; id: string }
  | { page: 'driver'; id: string }
  | { page: 'warehouse'; id: string }

export function parseRoute(path: string): Route {
  const [, a, b] = path.split('/')
  if (a === 'command') return { page: 'command' }
  if (a === 'camp' && b) return { page: 'camp', id: b }
  if (a === 'driver' && b) return { page: 'driver', id: b }
  if (a === 'warehouse' && b) return { page: 'warehouse', id: b }
  return { page: 'intro' }
}
