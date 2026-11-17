import { Polyline, Tooltip } from 'react-leaflet'
import { useStore } from '../../store'
import type { Edge } from '../../types'

const WEIGHT: Record<Edge['kind'], number> = { nh: 3, sh: 2.5, local: 2, ferry: 2 }

export function RoadsLayer({ edges }: { edges: Edge[] }) {
  const blocked = useStore((s) => s.blocked)
  const selectedEdges = useStore((s) => s.selected?.edge_ids)
  const blockedSet = new Set(blocked)
  return (
    <>
      {edges.map((e) => {
        const isBlocked = blockedSet.has(e.id)
        return (
          <Polyline
            key={`${e.id}-${isBlocked ? 'b' : 'o'}`}
            positions={e.geometry}
            className={isBlocked ? 'road-blocked' : undefined}
            pathOptions={
              isBlocked
                ? { color: '#ef4444', weight: WEIGHT[e.kind] + 1.5, opacity: 1, dashArray: '8 7' }
                : {
                    color: e.kind === 'ferry' ? '#38bdf8' : '#64748b',
                    weight: WEIGHT[e.kind],
                    opacity: 0.85,
                    dashArray: e.kind === 'ferry' ? '4 6' : undefined,
                  }
            }
          >
            <Tooltip sticky>
              <b>{e.road}</b>
              <br />
              {Math.round(e.length_km)} km{e.crossing_min ? ` · ${e.crossing_min} min crossing` : ''}
              {isBlocked ? ' · CLOSED (flooded)' : ''}
            </Tooltip>
          </Polyline>
        )
      })}
      {(selectedEdges ?? []).map((id) => {
        const e = edges.find((x) => x.id === id)
        return e ? (
          <Polyline
            key={`sel-${id}`}
            positions={e.geometry}
            interactive={false}
            pathOptions={{ color: '#facc15', weight: 9, opacity: 0.35 }}
          />
        ) : null
      })}
    </>
  )
}
