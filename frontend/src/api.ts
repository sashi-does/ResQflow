import { getSession, setSession, type Session, type User } from './auth'
import type {
  AfterActionReport,
  ApprovalPolicy,
  DemoReport,
  FieldReport,
  Hazard,
  KpiBundle,
  LogEntry,
  Order,
  Scenario,
  SimView,
  Snapshot,
  Supplies,
  WarehouseView,
} from './types'

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = getSession()?.token
  if (token) headers.Authorization = `Bearer ${token}`
  const r = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (r.status === 401 && token && !path.startsWith('/auth/login')) {
    setSession(null) // expired or server restarted with a new secret: back to the login page
  }
  if (!r.ok) {
    let detail = `HTTP ${r.status}`
    try {
      const j = (await r.json()) as { detail?: unknown }
      if (j.detail) detail = String(j.detail)
    } catch {
      /* keep HTTP status */
    }
    throw new Error(detail)
  }
  return (await r.json()) as T
}

export interface Health {
  ok: boolean
  llm_provider: string
  llm_model: string
  llm_disabled?: string | null
  weather_mode: string
  demo_inject_fault: boolean
  version: string
}

export interface DemoUser {
  username: string
  name: string
  role: User['role']
  title: string
  scope_label: string
  blurb: string
}

export interface CampAlert {
  id: string
  camp_id: string
  sim_time: string
  kind: 'dispatch' | 'delay' | 'arrival'
  order_id: string
  truck_id: string
  en: string
  as: string
}

export interface Trip {
  order_id: string
  warehouse: string
  camp: string
  items: Supplies
  weight_kg: number
  dispatched: string
  delivered: string
  minutes: number
  on_time: boolean
}

export interface CopilotAnswer {
  answer: string
  tools_used?: { name: string; input: Record<string, unknown> }[]
  model?: string
  latency_ms?: number | null
  needs_key?: boolean
}

export const api = {
  injectFault: (enabled: boolean) => req<{ enabled: boolean }>('POST', '/sim/inject-fault', { enabled }),
  login: (username: string, password: string) => req<Session>('POST', '/auth/login', { username, password }),
  demoUsers: () => req<DemoUser[]>('GET', '/auth/demo-users'),
  me: () => req<User>('GET', '/auth/me'),
  alerts: (campId: string) => req<CampAlert[]>('GET', `/camps/${campId}/alerts`),
  history: (truckId: string) => req<Trip[]>('GET', `/trucks/${truckId}/history`),
  markLoaded: (orderId: string) => req<Order>('POST', `/orders/${orderId}/loaded`),
  copilot: (question: string) => req<CopilotAnswer>('POST', '/copilot', { question }),
  latestReport: () => req<AfterActionReport | null>('GET', '/report'),
  health: () => req<Health>('GET', '/health'),
  scenario: () => req<Scenario>('GET', '/scenario'),
  state: () => req<Snapshot>('GET', '/state'),
  start: () => req<{ running: boolean }>('POST', '/sim/start'),
  pause: () => req<{ running: boolean }>('POST', '/sim/pause'),
  reset: (demo_timeline = true) => req<Snapshot>('POST', '/sim/reset', { demo_timeline }),
  speed: (multiplier: number) => req<{ speed: number }>('POST', '/sim/speed', { multiplier }),
  runDemo: () => req<{ running: boolean; sim: SimView }>('POST', '/demo/run'),
  trigger: (preset_id: string) => req<Hazard>('POST', '/hazards/trigger', { preset_id }),
  customFlood: (label: string, ring: [number, number][]) =>
    req<Hazard>('POST', '/hazards/custom', {
      label,
      polygon: { type: 'Polygon', coordinates: [[...ring.map(([lat, lon]) => [lon, lat]), [ring[0][1], ring[0][0]]]] },
    }),
  recedeAll: () => req<{ removed: boolean; hazard_ids: string[] }>('DELETE', '/hazards/all'),
  removeHazard: (id: string) => req<{ removed: boolean }>('DELETE', `/hazards/${id}`),
  replan: () => req<{ started: boolean }>('POST', '/replan'),
  decide: (orderId: string, decision: 'approve' | 'reject', note?: string) =>
    req<Order>('POST', `/approvals/${orderId}`, { decision, note }),
  kpis: () => req<KpiBundle>('GET', '/kpis'),
  setPolicy: (p: ApprovalPolicy) => req<ApprovalPolicy>('POST', '/policy', p),
  sendReport: (campId: string, text: string) => req<FieldReport>('POST', `/camps/${campId}/reports`, { text }),
  decideReport: (id: string, decision: 'confirm' | 'reject') =>
    req<FieldReport>('POST', `/field-reports/${id}/decision`, { decision }),
  demoReports: () => req<DemoReport[]>('GET', '/demo/reports'),
  sendDemoReport: (report_id: string) => req<FieldReport>('POST', '/demo/field-report', { report_id }),
  confirmDelivery: (campId: string, orderId: string, received: Supplies) =>
    req<{ ok: boolean; shortfall: Supplies }>('POST', `/camps/${campId}/deliveries/${orderId}/confirm`, { received }),
  ack: (truckId: string) => req<{ ok: boolean }>('POST', `/trucks/${truckId}/ack`),
  roadReport: (truckId: string, edge_id: string, kind: string, note = '') =>
    req<Hazard>('POST', `/trucks/${truckId}/road-report`, { edge_id, kind, note }),
  confirmHazard: (id: string) => req<Hazard>('POST', `/hazards/${id}/confirm`),
  adjustStock: (warehouseId: string, delta: Partial<Supplies>, note: string) =>
    req<WarehouseView>('POST', `/warehouses/${warehouseId}/adjust`, { delta, note }),
  ordersAll: () => req<Order[]>('GET', '/orders'),
  log: (limit = 500) => req<LogEntry[]>('GET', `/log?limit=${limit}`),
  report: () => req<AfterActionReport>('POST', '/report'),
}
