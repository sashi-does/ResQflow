import type { Scenario } from './types'

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(`/api${path}`)
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
  return (await r.json()) as T
}

export interface Health {
  ok: boolean
  llm_provider: string
  llm_model: string
  weather_mode: string
  demo_inject_fault: boolean
  version: string
}

export const api = {
  health: () => getJson<Health>('/health'),
  scenario: () => getJson<Scenario>('/scenario'),
}
