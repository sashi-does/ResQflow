import { useEffect } from 'react'
import { CircleMarker, Polygon, Polyline, useMap, useMapEvents } from 'react-leaflet'
import { useStore } from '../../store'

/** While "Draw flood" is on, map clicks add polygon vertices. */
export function DrawLayer() {
  const map = useMap()
  const drawing = useStore((s) => s.drawing)
  const pts = useStore((s) => s.drawPoints)
  const add = useStore((s) => s.addDrawPoint)

  useMapEvents({
    click: (e) => {
      if (drawing) add([e.latlng.lat, e.latlng.lng])
    },
  })

  useEffect(() => {
    const el = map.getContainer()
    el.style.cursor = drawing ? 'crosshair' : ''
    if (drawing) map.doubleClickZoom.disable()
    else map.doubleClickZoom.enable()
  }, [drawing, map])

  if (!drawing || pts.length === 0) return null
  const style = { color: '#60a5fa', weight: 2, dashArray: '5 5', fillColor: '#3b82f6', fillOpacity: 0.25 }
  return (
    <>
      {pts.length >= 3 ? (
        <Polygon positions={pts} pathOptions={style} interactive={false} />
      ) : (
        <Polyline positions={pts} pathOptions={style} interactive={false} />
      )}
      {pts.map((p, i) => (
        <CircleMarker
          key={i}
          center={p}
          radius={4}
          interactive={false}
          pathOptions={{ color: '#bfdbfe', fillColor: '#3b82f6', fillOpacity: 1 }}
        />
      ))}
    </>
  )
}
