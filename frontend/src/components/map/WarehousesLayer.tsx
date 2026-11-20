import L from 'leaflet'
import { Marker, Tooltip } from 'react-leaflet'
import { fmtNum } from '../../lib/format'
import { useStore } from '../../store'
import type { Node, WarehouseDef } from '../../types'

const icon = L.divIcon({
  className: '',
  html: '<div class="wh-icon"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

function Bar({ label, value, initial, color }: { label: string; value: number; initial: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (100 * value) / Math.max(1, initial)))
  return (
    <div className="mt-1 flex items-center gap-2">
      <span className="w-12 text-[10px] text-slate-500">{label}</span>
      <span className="h-1.5 w-24 rounded bg-slate-200">
        <span className="block h-1.5 rounded" style={{ width: `${pct}%`, background: color }} />
      </span>
      <span className="text-[10px] tabular-nums text-slate-600">{fmtNum(value)}</span>
    </div>
  )
}

export function WarehousesLayer({ warehouses, nodes }: { warehouses: WarehouseDef[]; nodes: Map<string, Node> }) {
  const live = useStore((s) => s.warehouses)
  return (
    <>
      {warehouses.map((w) => {
        const n = nodes.get(w.node_id)
        if (!n) return null
        const v = live[w.id]
        const stock = v?.stock ?? w.stock
        return (
          <Marker key={w.id} position={[n.lat, n.lon]} icon={icon} zIndexOffset={500} eventHandlers={{ click: () => useStore.getState().setPick({ kind: 'warehouse', id: w.id }) }}>
            <Tooltip direction="top" offset={[0, -8]}>
              <div className="text-xs">
                <b>
                  {w.id} · {w.name} warehouse
                </b>
                <Bar label="Water L" value={stock.water_l} initial={w.stock.water_l} color="#38bdf8" />
                <Bar label="Food" value={stock.food_rations} initial={w.stock.food_rations} color="#fbbf24" />
                <Bar label="Medical" value={stock.medical_kits} initial={w.stock.medical_kits} color="#f472b6" />
                {v && v.available.water_l === 0 && (
                  <div className="mt-1 text-[10px] text-amber-300">Down to its safety reserve</div>
                )}
              </div>
            </Tooltip>
          </Marker>
        )
      })}
    </>
  )
}
