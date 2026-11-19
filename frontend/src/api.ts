import type {
  AfterActionReport,
  ApprovalPolicy,
  DemoReport,
  FieldReport,
  Hazard,
  KpiBundle,
  Order,
  Scenario,
  SimView,
  Snapshot,
  Supplies,
  WarehouseView,
} from './types'

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
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
  weather_mode: string
  demo_inject_fault: boolean
  version: string
}

export const api = {
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
  roadReport: (truckId: string, edge_id: string, kind: string) =>
    req<Hazard>('POST', `/trucks/${truckId}/road-report`, { edge_id, kind }),
  confirmHazard: (id: string) => req<Hazard>('POST', `/hazards/${id}/confirm`),
  adjustStock: (warehouseId: string, delta: Partial<Supplies>, note: string) =>
    req<WarehouseView>('POST', `/warehouses/${warehouseId}/adjust`, { delta, note }),
  ordersAll: () => req<Order[]>('GET', '/orders'),
  report: () => req<AfterActionReport>('POST', '/report'),
}
