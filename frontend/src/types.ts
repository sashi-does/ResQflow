// Mirrors backend/app/models.py and docs/05_API_CONTRACT.md.

export type LatLon = [number, number]

export interface Supplies {
  food_rations: number
  water_l: number
  medical_kits: number
}

export interface Node {
  id: string
  name: string
  lat: number
  lon: number
  kind: 'town' | 'junction' | 'ghat'
}

export interface Edge {
  id: string
  a: string
  b: string
  road: string
  kind: 'nh' | 'sh' | 'local' | 'ferry'
  geometry: LatLon[]
  length_km: number
  speed_kmh: number
  crossing_min: number | null
}

export interface WarehouseDef {
  id: string
  node_id: string
  name: string
  stock: Supplies
}

export interface CampDef {
  id: string
  node_id: string
  name: string
  district: string
  population: number
  stock: Supplies
}

export interface Preset {
  id: string
  label: string
  kind: 'flood' | 'edge_closure'
  severity: string
  edge_ids: string[]
  polygon: GeoJSON.Polygon | GeoJSON.MultiPolygon | null
}

export interface Scenario {
  id: string
  name: string
  start_clock: string
  nodes: Node[]
  edges: Edge[]
  warehouses: WarehouseDef[]
  camps: CampDef[]
  trucks: { id: string; home_warehouse: string }[]
  presets: Preset[]
}

// ---------------------------------------------------------------- live state (docs/05_API_CONTRACT.md)

export type TruckStatus = 'idle' | 'loading' | 'en_route' | 'unloading' | 'returning' | 'holding'
export type CampLevel = 'critical' | 'low' | 'ok'
export type AgentName =
  | 'field_intake'
  | 'monitor'
  | 'inventory'
  | 'routing'
  | 'coordinator'
  | 'validator'
  | 'dispatcher'
  | 'human'
  | 'system'

export interface SimView {
  sim_time: string
  sim_seconds: number
  running: boolean
  speed: number
  demo_timeline?: boolean
  ended?: boolean
}

export interface TruckView {
  id: string
  status: TruckStatus
  lat: number
  lon: number
  at_warehouse?: string | null
  path_coords?: LatLon[]
  order_id?: string | null
  cargo?: Supplies
  eta_sim_seconds?: number | null
  heading_to?: string | null
  leg?: string | null
  route_roads?: RouteRoad[]
  pending_reroute?: { message: string; at: string; new_eta_sim_seconds: number | null } | null
  job?: Job | null
}

export interface RouteRoad {
  edge_id: string
  road: string
  from: string
  to: string
  km: number
  blocked: boolean
}

export interface Job {
  order_id: string
  status: string
  from: string
  to: string
  camp_id: string
  items: Supplies
  weight_kg: number
}

export interface CampView {
  id: string
  stock: Supplies
  incoming: Supplies
  days_of_cover: number
  water_days: number
  status: CampLevel
  cut_off: boolean
  unserved_reason: string | null
  priority_boost?: number
  population?: number
  urgent_needs?: string[]
  health_flags?: string[]
}

export interface ParsedReport {
  population_delta: number | null
  new_population: number | null
  shortages: ('water_l' | 'food_rations' | 'medical_kits')[]
  urgent_needs: string[]
  health_flags: string[]
  confidence: number
  needs_human_check: boolean
}

export interface FieldReport {
  id: string
  camp_id: string
  text: string
  sim_time: string
  sim_seconds: number
  parsed: ParsedReport | null
  status: 'processing' | 'applied' | 'pending_confirmation' | 'unparsed' | 'rejected' | 'confirmed'
  reasons: string[]
  changes: string[]
  source: 'llm' | 'recorded' | 'none'
  model: string | null
  latency_ms: number | null
  origin: 'camp' | 'demo'
}

export interface DemoReport {
  id: string
  camp_id: string
  lang: string
  label: string
  text: string
  translation?: string
}

export interface WarehouseView {
  id: string
  stock: Supplies
  available: Supplies
  reserve: Supplies
}

export interface Hazard {
  id: string
  label: string
  kind: 'flood' | 'edge_closure' | 'rain_advisory' | 'driver_report'
  polygon: GeoJSON.Polygon | GeoJSON.MultiPolygon | null
  edge_ids: string[]
  severity: string
  preset_id: string | null
  district?: string | null
  rain_24h_mm?: number | null
  verified?: boolean
  source?: string
  reported_by?: string[]
}

export type OrderStatus = 'proposed' | 'awaiting_approval' | 'dispatched' | 'delivered' | 'rejected' | 'failed'

export interface Order {
  id: string
  warehouse_id: string
  camp_id: string
  truck_id: string
  items: Supplies
  weight_kg: number
  priority: 'critical' | 'high' | 'normal'
  reason: string
  uses_reserve: boolean
  approval_reasons: string[]
  status: OrderStatus
  source: 'llm' | 'heuristic'
  created_at_sim: number
  delivered_at_sim: number | null
  approval_requested_at_sim: number | null
  auto_approve_at_sim: number | null
  eta_min: number | null
  loaded_confirmed?: boolean
}

export interface ApprovalPolicy {
  auto_approve_critical: boolean
  max_tonnes: number
  delay_min: number
}

export interface LogRefs {
  truck_ids: string[]
  camp_ids: string[]
  order_ids: string[]
  hazard_ids: string[]
  edge_ids: string[]
}

export interface LogEntry {
  id: number
  sim_time: string
  sim_seconds: number
  real_time: string
  agent: AgentName
  kind: string
  summary: string
  reasoning: string
  refs: LogRefs
  actor?: string | null
}

export interface KPIs {
  people_hours_without_water: number
  people_hours_without_food: number
  deliveries_on_time_pct: number
  deliveries_total: number
  truck_hours_stuck: number
  avg_delivery_min: number
  supplies_delivered_kg: number
}

export interface KpiBundle {
  agentic: KPIs
  baseline: KPIs
  delta_pct: Partial<Record<keyof KPIs, number | null>>
}

export interface CoordinatorView {
  busy: boolean
  last_plan_source: string | null
  last_latency_ms: number | null
  attempts: number
  provider?: string
}

export interface AgentStat {
  count: number
  last_summary: string | null
  last_at: string | null
  avg_latency_ms: number | null
  model?: string
  retries?: number
  busy?: boolean
}

export interface Snapshot {
  agents?: Record<string, AgentStat>
  sim: SimView
  trucks: TruckView[]
  warehouses: WarehouseView[]
  camps: CampView[]
  hazards: Hazard[]
  blocked_edge_ids: string[]
  orders: Order[]
  kpis?: KpiBundle
  coordinator?: CoordinatorView
  alerts?: import('./api').CampAlert[]
  policy?: ApprovalPolicy
  field_reports?: FieldReport[]
  receipts?: Record<string, { received: Supplies; shortfall: Supplies }>
  log?: LogEntry[]
}

export interface TickPayload extends SimView {
  agents?: Record<string, AgentStat>
  trucks: { id: string; lat: number; lon: number; status: TruckStatus }[]
  camps: CampView[]
  warehouses: WarehouseView[]
}

export interface ReroutePayload {
  truck_id: string
  old_path_coords: LatLon[]
  new_path_coords: LatLon[]
  reason: string
  old_eta_sim_seconds: number
  new_eta_sim_seconds: number | null
}

export interface AfterActionReport {
  title: string
  generated_at_sim: string
  narrative: { summary: string; recommendations: string[] }
  narrative_source: 'llm' | 'template'
  narrative_model: string | null
  narrative_note: string
  kpis: KpiBundle
  kpi_rows: { key: keyof KPIs; label: string; agentic: number; static: number; delta_pct: number | null; better: boolean | null }[]
  timeline: { sim_time: string; agent: AgentName; kind: string; summary: string }[]
  cut_off: { camp: string; population: number; reason: string; since: string | null }[]
  escalations: { what: string; status: string; why: string }[]
  counts: Record<string, number>
}

export interface WsMessage {
  type: string
  payload: unknown
}
