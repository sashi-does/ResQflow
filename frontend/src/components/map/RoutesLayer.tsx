import { useMemo } from 'react'
import { Polyline } from 'react-leaflet'
import { useStore } from '../../store'
import type { LatLon, TruckView } from '../../types'

/** Remaining path from the truck's current position (drops the part already driven). */
function remaining(t: TruckView): LatLon[] {
  const path = t.path_coords ?? []
  if (path.length < 2) return []
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < path.length; i++) {
    const d = (path[i][0] - t.lat) ** 2 + (path[i][1] - t.lon) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return [[t.lat, t.lon], ...path.slice(best + 1)]
}

export function RoutesLayer() {
  const trucks = useStore((s) => s.trucks)
  const flashes = useStore((s) => s.flashes)
  const flashing = useMemo(() => new Set(flashes.map((f) => f.truckId)), [flashes])
  return (
    <>
      {Object.values(trucks)
        .filter((t) => (t.status === 'en_route' || t.status === 'returning') && !flashing.has(t.id))
        .map((t) => {
          const pts = remaining(t)
          if (pts.length < 2) return null
          const delivering = t.status === 'en_route'
          return (
            <Polyline
              key={`route-${t.id}`}
              positions={pts}
              interactive={false}
              pathOptions={{
                color: delivering ? '#0d9488' : '#64748b',
                weight: delivering ? 3 : 1.5,
                opacity: delivering ? 0.85 : 0.5,
                dashArray: delivering ? undefined : '3 6',
              }}
            />
          )
        })}
    </>
  )
}
