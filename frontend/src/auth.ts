import { useSyncExternalStore } from 'react'

/** Logged-in session, kept in sessionStorage (not localStorage) so every browser tab can be a different role. */
export type Role = 'officer' | 'camp' | 'driver' | 'warehouse'

export interface User {
  username: string
  name: string
  role: Role
  scope_id: string
  title: string
}

export interface Session {
  token: string
  user: User
}

const KEY = 'rahatnet.session'
const listeners = new Set<() => void>()
let cached: Session | null | undefined
let cachedRaw: string | null = null

function read(): Session | null {
  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(KEY)
  } catch {
    raw = null
  }
  if (cached !== undefined && raw === cachedRaw) return cached
  cachedRaw = raw
  try {
    cached = raw ? (JSON.parse(raw) as Session) : null
  } catch {
    cached = null
  }
  return cached
}

export function getSession(): Session | null {
  return read()
}

export function setSession(s: Session | null): void {
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s))
    else sessionStorage.removeItem(KEY)
  } catch {
    /* private mode: session lives only in memory */
  }
  cached = s
  cachedRaw = s ? JSON.stringify(s) : null
  listeners.forEach((l) => l())
}

export function useSession(): Session | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    read,
  )
}

export const ROLE_LABEL: Record<Role, string> = {
  officer: 'District Officer',
  camp: 'Camp Coordinator',
  driver: 'Truck Driver',
  warehouse: 'Warehouse Manager',
}
