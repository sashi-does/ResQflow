import type { AgentName, CampLevel, Supplies, TruckStatus } from '../types'

export const AGENT_COLORS: Record<AgentName, string> = {
  field_intake: '#ec4899',
  monitor: '#0ea5e9',
  inventory: '#a855f7',
  routing: '#f59e0b',
  coordinator: '#10b981',
  validator: '#ef4444',
  dispatcher: '#6366f1',
  human: '#e5e7eb',
  system: '#94a3b8',
}

export const AGENT_LABEL: Record<AgentName, string> = {
  field_intake: 'Field Intake',
  monitor: 'Monitor',
  inventory: 'Inventory',
  routing: 'Routing',
  coordinator: 'Coordinator',
  validator: 'Validator',
  dispatcher: 'Dispatcher',
  human: 'Human',
  system: 'System',
}

export const CAMP_COLORS: Record<CampLevel | 'cut_off', string> = {
  ok: '#16a34a',
  low: '#f59e0b',
  critical: '#dc2626',
  cut_off: '#475569',
}

export const TRUCK_COLORS: Record<TruckStatus, string> = {
  idle: '#94a3b8',
  loading: '#f59e0b',
  unloading: '#f59e0b',
  en_route: '#0d9488',
  returning: '#64748b',
  holding: '#dc2626',
}

export const TRUCK_STATUS_LABEL: Record<TruckStatus, string> = {
  idle: 'Idle',
  loading: 'Loading',
  unloading: 'Unloading',
  en_route: 'En route',
  returning: 'Returning',
  holding: 'Holding',
}

export function fmtDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const mm = m % 60
  if (h && mm) return `${h}h${String(mm).padStart(2, '0')}m`
  return h ? `${h}h` : `${mm}m`
}

export function fmtKg(kg: number): string {
  return kg >= 1000 ? `${(kg / 1000).toFixed(1)} t` : `${Math.round(kg)} kg`
}

export function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

export function fmtItems(s: Supplies): string {
  const parts: string[] = []
  if (s.water_l) parts.push(`${fmtNum(s.water_l)} L water`)
  if (s.food_rations) parts.push(`${fmtNum(s.food_rations)} rations`)
  if (s.medical_kits) parts.push(`${fmtNum(s.medical_kits)} med kits`)
  return parts.join(' · ') || 'nothing'
}

export function shortName(name: string): string {
  return name.replace(' Relief Camp', '').replace(' State Hub', '').replace(/ \(.*\)$/, '')
}
