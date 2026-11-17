import { create } from 'zustand'
import type { Health } from './api'
import type { Scenario } from './types'

interface AppState {
  scenario: Scenario | null
  health: Health | null
  error: string | null
  setScenario: (s: Scenario) => void
  setHealth: (h: Health | null) => void
  setError: (e: string | null) => void
}

export const useStore = create<AppState>((set) => ({
  scenario: null,
  health: null,
  error: null,
  setScenario: (scenario) => set({ scenario }),
  setHealth: (health) => set({ health }),
  setError: (error) => set({ error }),
}))
