import { Polyline, Tooltip } from 'react-leaflet'
import type { Edge } from '../../types'

const WEIGHT: Record<Edge['kind'], number> = { nh: 3, sh: 2.5, local: 2, ferry: 2 }

export function RoadsLayer({ edges }: { edges: Edge[] }) {
  return (
    <>
      {edges.map((e) => (
        <Polyline
          key={e.id}
          positions={e.geometry}
          pathOptions={{
            color: e.kind === 'ferry' ? '#38bdf8' : '#94a3b8',
            weight: WEIGHT[e.kind],
            opacity: 0.75,
            dashArray: e.kind === 'ferry' ? '4 6' : undefined,
          }}
        >
          <Tooltip sticky>
            {e.road} · {e.id} · {Math.round(e.length_km)} km
          </Tooltip>
        </Polyline>
      ))}
    </>
  )
}
