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
