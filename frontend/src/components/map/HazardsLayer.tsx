import { GeoJSON, Tooltip } from 'react-leaflet'
import { useStore } from '../../store'

export function HazardsLayer() {
  const hazards = useStore((s) => s.hazards)
  const selected = useStore((s) => s.selected?.hazard_ids)
  return (
    <>
      {hazards
        .filter((h) => h.polygon)
        .map((h) => (
          <GeoJSON
            key={h.id}
            data={h.polygon as GeoJSON.Polygon}
            interactive
            style={() => ({
              color: selected?.includes(h.id) ? '#f59e0b' : '#2563eb',
              weight: 1.5,
              fillColor: '#3b82f6',
              fillOpacity: 0.22,
              className: 'hazard-poly',
            })}
          >
            <Tooltip permanent direction="bottom" offset={[0, 18]} className="hazard-label">
              {h.label}
            </Tooltip>
          </GeoJSON>
        ))}
    </>
  )
}
