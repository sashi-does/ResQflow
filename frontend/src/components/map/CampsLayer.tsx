import { CircleMarker, Tooltip } from 'react-leaflet'
import type { CampDef, Node } from '../../types'

export function CampsLayer({ camps, nodes }: { camps: CampDef[]; nodes: Map<string, Node> }) {
  return (
    <>
      {camps.map((c) => {
        const n = nodes.get(c.node_id)
        if (!n) return null
        return (
          <CircleMarker
            key={c.id}
            center={[n.lat, n.lon]}
            radius={5 + Math.sqrt(c.population) / 12}
            pathOptions={{ color: '#10b981', fillColor: '#10b981', fillOpacity: 0.35, weight: 2 }}
          >
            <Tooltip direction="top">
              <b>{c.id} · {c.name}</b>
              <br />
              {c.population.toLocaleString()} people · {c.district}
            </Tooltip>
          </CircleMarker>
        )
      })}
    </>
  )
}
