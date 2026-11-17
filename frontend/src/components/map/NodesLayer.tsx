import { CircleMarker, Tooltip } from 'react-leaflet'
import type { Node } from '../../types'

export function NodesLayer({ nodes }: { nodes: Node[] }) {
  return (
    <>
      {nodes.map((n) => (
        <CircleMarker
          key={n.id}
          center={[n.lat, n.lon]}
          radius={2.5}
          pathOptions={{ color: '#cbd5e1', fillColor: '#cbd5e1', fillOpacity: 1, weight: 1 }}
        >
          <Tooltip direction="right" offset={[4, 0]} permanent className="node-label">
            {n.name}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  )
}
