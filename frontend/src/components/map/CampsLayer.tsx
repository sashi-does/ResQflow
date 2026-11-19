import { CircleMarker, Tooltip } from 'react-leaflet'
import { CAMP_COLORS, fmtNum } from '../../lib/format'
import { useStore } from '../../store'
import type { CampDef, Node } from '../../types'

export function CampsLayer({ camps, nodes }: { camps: CampDef[]; nodes: Map<string, Node> }) {
  const live = useStore((s) => s.camps)
  const selected = useStore((s) => s.selected?.camp_ids)
  const setPick = useStore((s) => s.setPick)
  return (
    <>
      {camps.map((c) => {
        const n = nodes.get(c.node_id)
        if (!n) return null
        const v = live[c.id]
        const level = v?.cut_off ? 'cut_off' : (v?.status ?? 'ok')
        const color = CAMP_COLORS[level]
        const radius = 6 + Math.sqrt(c.population) / 11
        return (
          <CircleMarker
            key={`${c.id}-${level}`}
            center={[n.lat, n.lon]}
            radius={radius}
            className={level === 'critical' ? 'camp-critical' : undefined}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.4, weight: 2.5 }}
            eventHandlers={{ click: () => setPick({ kind: 'camp', id: c.id }) }}
          >
            <Tooltip direction="top" offset={[0, -radius]}>
              <div className="text-xs">
                <b>{c.name}</b> · {fmtNum(c.population)} people
                {v && (
                  <>
                    <br />
                    Water {v.water_days.toFixed(1)} days · overall cover {v.days_of_cover.toFixed(1)} days
                    <br />
                    Status: <b style={{ color }}>{v.cut_off ? 'CUT OFF' : v.status.toUpperCase()}</b>
                    {v.priority_boost ? ' · heavy-rain advisory' : ''}
                    {v.incoming.water_l > 0 && (
                      <>
                        <br />
                        Incoming: {fmtNum(v.incoming.water_l)} L water
                      </>
                    )}
                    {v.unserved_reason && (
                      <>
                        <br />
                        <span style={{ color: '#fca5a5' }}>{v.unserved_reason}</span>
                      </>
                    )}
                  </>
                )}
              </div>
            </Tooltip>
          </CircleMarker>
        )
      })}
      {(selected ?? []).map((id) => {
        const c = camps.find((x) => x.id === id)
        const n = c && nodes.get(c.node_id)
        return n && c ? (
          <CircleMarker
            key={`sel-${id}`}
            center={[n.lat, n.lon]}
            radius={10 + Math.sqrt(c.population) / 11}
            interactive={false}
            pathOptions={{ color: '#facc15', weight: 2, fill: false, dashArray: '4 4' }}
          />
        ) : null
      })}
    </>
  )
}
