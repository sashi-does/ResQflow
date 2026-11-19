import type { KPIs } from '../types'
import { fmtDuration, fmtKg, fmtNum } from './format'

/** One formatter for every KPI display (KPI strip and after-action report must show identical text). */
export function fmtKpi(key: keyof KPIs | string, v: number): string {
  switch (key) {
    case 'deliveries_on_time_pct':
      return `${v.toFixed(0)}%`
    case 'truck_hours_stuck':
      return v.toFixed(1)
    case 'avg_delivery_min':
      return v ? fmtDuration(v) : '—'
    case 'supplies_delivered_kg':
      return fmtKg(v)
    default:
      return fmtNum(v)
  }
}
