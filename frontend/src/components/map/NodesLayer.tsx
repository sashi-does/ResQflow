import { CircleMarker, Tooltip } from 'react-leaflet'
import { shortName } from '../../lib/format'
import type { Node } from '../../types'

// nudge labels that would collide with neighbours or flood labels
const LABEL_DIR: Record<string, 'right' | 'left' | 'bottom' | 'top'> = {
  NMG: 'bottom',
  BSK: 'top',
  KLB: 'bottom',
  BKT: 'top',
  NMT: 'right',
  JGR: 'bottom',
  GHY: 'bottom',
}

export function NodesLayer({ nodes }: { nodes: Node[] }) {
  return (
    <>
      {nodes.map((n) => (
        <CircleMarker
          key={n.id}
          center={[n.lat, n.lon]}
          radius={2.5}
          interactive={false}
          pathOptions={{ color: '#ffffff', fillColor: '#64748b', fillOpacity: 1, weight: 1 }}
        >
          <Tooltip
            direction={LABEL_DIR[n.id] ?? 'right'}
            offset={LABEL_DIR[n.id] === 'bottom' ? [0, 4] : LABEL_DIR[n.id] === 'top' ? [0, -6] : [6, 0]}
            permanent
            className="node-label"
          >
            {shortName(n.name)}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  )
}
