import L from 'leaflet'
import { Marker, Tooltip } from 'react-leaflet'
import type { Node, WarehouseDef } from '../../types'

const icon = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;background:#6366f1;border:2px solid #e0e7ff;border-radius:2px;box-shadow:0 0 6px #6366f1"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

export function WarehousesLayer({ warehouses, nodes }: { warehouses: WarehouseDef[]; nodes: Map<string, Node> }) {
  return (
    <>
      {warehouses.map((w) => {
        const n = nodes.get(w.node_id)
        if (!n) return null
        return (
          <Marker key={w.id} position={[n.lat, n.lon]} icon={icon}>
            <Tooltip direction="top" offset={[0, -8]}>
              <b>{w.id} · {w.name}</b>
              <br />
              Water {w.stock.water_l.toLocaleString()} L · Food {w.stock.food_rations.toLocaleString()} · Med{' '}
              {w.stock.medical_kits}
            </Tooltip>
          </Marker>
        )
      })}
    </>
  )
}
