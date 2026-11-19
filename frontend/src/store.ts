import { create } from 'zustand'
import type { Health } from './api'
import type {
  AgentName,
  ApprovalPolicy,
  CampView,
  CoordinatorView,
  Hazard,
  KpiBundle,
  LatLon,
  LogEntry,
  LogRefs,
  Order,
  ReroutePayload,
  Scenario,
  SimView,
  Snapshot,
  TickPayload,
  TruckView,
  WarehouseView,
  WsMessage,
} from './types'

const LOG_CAP = 500
export const FLASH_MS = 6500

export interface Flash {
  key: number
  truckId: string
  oldPath: LatLon[]
  newPath: LatLon[]
  deltaMin: number
  reason: string
  startedAt: number
}

export interface Toast {
  id: number
  text: string
  tone: 'ok' | 'warn' | 'error' | 'info'
}

export type Tab = 'feed' | 'approvals' | 'camps'

interface State {
  scenario: Scenario | null
  health: Health | null
  connected: boolean
  everConnected: boolean
  sim: SimView | null
  trucks: Record<string, TruckView>
  tickAt: number
  camps: Record<string, CampView>
  warehouses: Record<string, WarehouseView>
  hazards: Hazard[]
  blocked: string[]
  orders: Record<string, Order>
  kpis: KpiBundle | null
  coordinator: CoordinatorView | null
  policy: ApprovalPolicy | null
  thinking: boolean
  log: LogEntry[]
  flashes: Flash[]
  selected: (Partial<LogRefs> & { entryId?: number }) | null
  tab: Tab
  agentFilter: AgentName[]
  toasts: Toast[]
  error: string | null
  drawing: boolean
  drawPoints: LatLon[]

  setScenario: (s: Scenario) => void
  setHealth: (h: Health | null) => void
  setConnected: (c: boolean) => void
  setError: (e: string | null) => void
  setTab: (t: Tab) => void
  toggleAgent: (a: AgentName) => void
  select: (refs: (Partial<LogRefs> & { entryId?: number }) | null) => void
  toast: (text: string, tone?: Toast['tone']) => void
  dismissToast: (id: number) => void
  setDrawing: (on: boolean) => void
  addDrawPoint: (p: LatLon) => void
  applySnapshot: (s: Snapshot) => void
  applyMessage: (m: WsMessage) => void
}

let seq = 1

function byId<T extends { id: string }>(xs: T[]): Record<string, T> {
  return Object.fromEntries(xs.map((x) => [x.id, x]))
}

export const useStore = create<State>((set, get) => ({
  scenario: null,
  health: null,
  connected: false,
  everConnected: false,
  sim: null,
  trucks: {},
  tickAt: 0,
  camps: {},
  warehouses: {},
  hazards: [],
  blocked: [],
  orders: {},
  kpis: null,
  coordinator: null,
  policy: null,
  thinking: false,
  log: [],
  flashes: [],
  selected: null,
  tab: 'feed',
  agentFilter: [],
  toasts: [],
  error: null,
  drawing: false,
  drawPoints: [],

  setScenario: (scenario) => set({ scenario }),
  setHealth: (health) => set({ health }),
  setConnected: (connected) => set((s) => ({ connected, everConnected: s.everConnected || connected })),
  setError: (error) => set({ error }),
  setTab: (tab) => set({ tab }),
  toggleAgent: (a) =>
    set((s) => ({
      agentFilter: s.agentFilter.includes(a) ? s.agentFilter.filter((x) => x !== a) : [...s.agentFilter, a],
    })),
  select: (selected) => set({ selected }),
  toast: (text, tone = 'info') => {
    const id = seq++
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, tone }] }))
    setTimeout(() => get().dismissToast(id), 4000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setDrawing: (drawing) => set({ drawing, drawPoints: [] }),
  addDrawPoint: (p) => set((s) => ({ drawPoints: [...s.drawPoints, p] })),

  applySnapshot: (snap) =>
    set({
      sim: snap.sim,
      trucks: byId(snap.trucks),
      tickAt: performance.now(),
      camps: byId(snap.camps),
      warehouses: byId(snap.warehouses),
      hazards: snap.hazards,
      blocked: snap.blocked_edge_ids,
      orders: byId(snap.orders),
      kpis: snap.kpis,
      coordinator: snap.coordinator,
      policy: snap.policy ?? null,
      thinking: false,
      log: [...(snap.log ?? [])].reverse().slice(0, LOG_CAP),
      flashes: [],
      selected: null,
    }),

  applyMessage: (m) => {
    const s = get()
    switch (m.type) {
      case 'snapshot':
        s.applySnapshot(m.payload as Snapshot)
        return
      case 'tick': {
        const p = m.payload as TickPayload
        const trucks = { ...s.trucks }
        for (const t of p.trucks) trucks[t.id] = { ...trucks[t.id], ...t }
        set({
          sim: {
            ...(s.sim ?? p),
            sim_time: p.sim_time,
            sim_seconds: p.sim_seconds,
            running: p.running,
            speed: p.speed,
            ended: p.ended,
          },
          trucks,
          tickAt: performance.now(),
          camps: byId(p.camps),
          warehouses: byId(p.warehouses),
        })
        return
      }
      case 'log': {
        const e = m.payload as LogEntry
        set({ log: [e, ...s.log].slice(0, LOG_CAP) })
        return
      }
      case 'hazard.added': {
        const p = m.payload as { hazard: Hazard; blocked_edge_ids: string[] }
        set({ hazards: [...s.hazards.filter((h) => h.id !== p.hazard.id), p.hazard], blocked: p.blocked_edge_ids })
        return
      }
      case 'hazard.removed': {
        const p = m.payload as { hazard: Hazard; blocked_edge_ids: string[] }
        set({ hazards: s.hazards.filter((h) => h.id !== p.hazard.id), blocked: p.blocked_edge_ids })
        return
      }
      case 'truck.rerouted': {
        const p = m.payload as ReroutePayload
        const t = s.trucks[p.truck_id]
        const deltaMin = ((p.new_eta_sim_seconds ?? p.old_eta_sim_seconds) - p.old_eta_sim_seconds) / 60
        const flash: Flash = {
          key: seq++,
          truckId: p.truck_id,
          oldPath: p.old_path_coords,
          newPath: p.new_path_coords,
          deltaMin,
          reason: p.reason,
          startedAt: performance.now(),
        }
        set({
          trucks: t ? { ...s.trucks, [t.id]: { ...t, path_coords: p.new_path_coords } } : s.trucks,
          flashes: [...s.flashes, flash],
        })
        setTimeout(() => set((st) => ({ flashes: st.flashes.filter((f) => f.key !== flash.key) })), FLASH_MS)
        return
      }
      case 'truck.updated': {
        const p = m.payload as {
          truck_id: string
          status: TruckView['status']
          path_coords: LatLon[]
          order_id: string | null
          heading_to: string | null
          at_warehouse: string | null
          eta_sim_seconds: number | null
        }
        const t = s.trucks[p.truck_id]
        if (!t) return
        set({
          trucks: {
            ...s.trucks,
            [p.truck_id]: {
              ...t,
              status: p.status,
              path_coords: p.path_coords,
              order_id: p.order_id,
              heading_to: p.heading_to,
              at_warehouse: p.at_warehouse,
              eta_sim_seconds: p.eta_sim_seconds,
            },
          },
        })
        return
      }
      case 'truck.holding': {
        const p = m.payload as { truck_id: string }
        const t = s.trucks[p.truck_id]
        if (t) set({ trucks: { ...s.trucks, [t.id]: { ...t, status: 'holding', path_coords: [] } } })
        return
      }
      case 'plan.started':
        set({ thinking: true })
        return
      case 'plan.completed': {
        const p = m.payload as { source: string; attempts: number; latency_ms: number }
        set({
          thinking: false,
          coordinator: {
            ...(s.coordinator ?? { busy: false, last_plan_source: null, last_latency_ms: null, attempts: 0 }),
            last_plan_source: p.source,
            attempts: p.attempts,
            last_latency_ms: p.latency_ms,
          },
        })
        return
      }
      case 'approval.requested':
      case 'order.updated': {
        const o = m.payload as Order
        set({ orders: { ...s.orders, [o.id]: o } })
        return
      }
      case 'kpis':
        set({ kpis: m.payload as KpiBundle })
        return
      case 'policy.updated':
        set({ policy: m.payload as ApprovalPolicy })
        return
      default:
        return
    }
  },
}))

export const awaitingApproval = (orders: Record<string, Order>): Order[] =>
  Object.values(orders)
    .filter((o) => o.status === 'awaiting_approval')
    .sort((a, b) => a.created_at_sim - b.created_at_sim || a.id.localeCompare(b.id, undefined, { numeric: true }))
