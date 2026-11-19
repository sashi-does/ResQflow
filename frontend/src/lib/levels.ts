import type { CampLevel } from '../types'

/** Shared camp-level colours and the days-of-cover thresholds (critical < 0.5 d, low < 1 d). */
export const LEVEL_TEXT: Record<CampLevel, string> = { critical: 'text-red-600', low: 'text-amber-600', ok: 'text-emerald-600' }
export const LEVEL_BAR: Record<CampLevel, string> = { critical: 'bg-red-500', low: 'bg-amber-500', ok: 'bg-emerald-500' }

export function levelOfDays(days: number): CampLevel {
  return days < 0.5 ? 'critical' : days < 1 ? 'low' : 'ok'
}
