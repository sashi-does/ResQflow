import L from 'leaflet'
import { useEffect, useState } from 'react'
import { Polyline, Tooltip, useMap } from 'react-leaflet'
import { fmtDuration } from '../../lib/format'
import type { Flash } from '../../store'
import { useStore } from '../../store'

/** The money shot: old route flashes red and fades, new safe route draws itself in bright green. */
function FlashPaths({ flash }: { flash: Flash }) {
  const map = useMap()
  const [phase, setPhase] = useState<'old' | 'both' | 'new'>('old')

  useEffect(() => {
    const pts = [...flash.oldPath, ...flash.newPath]
    if (pts.length > 1) {
      // only move the camera if the re-route isn't already on screen
      const target = L.latLngBounds(pts)
      if (!map.getBounds().contains(target)) map.flyToBounds(target.pad(0.2), { duration: 1.2, maxZoom: 9 })
    }
    const t1 = setTimeout(() => setPhase('both'), 1400)
    const t2 = setTimeout(() => setPhase('new'), 3000)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [flash, map])

  const mid = flash.newPath[Math.floor(flash.newPath.length / 2)]
  const slower = flash.deltaMin > 1
  const label = `${flash.truckId} re-routed · ${slower ? `+${fmtDuration(flash.deltaMin)}` : flash.deltaMin < -1 ? `−${fmtDuration(-flash.deltaMin)}` : 'same ETA'} · safe road`
  const setPathLength = (e: L.LeafletEvent) => {
    const el = (e.target as L.Polyline).getElement()
    el?.setAttribute('pathLength', '1')
  }
  return (
    <>
      {phase !== 'new' && flash.oldPath.length > 1 && (
        <Polyline
          positions={flash.oldPath}
          className="flash-old"
          interactive={false}
          pathOptions={{ color: '#ef4444', weight: 6, opacity: 1 }}
        />
      )}
      {phase !== 'old' && flash.newPath.length > 1 && (
        <Polyline
          positions={flash.newPath}
          className="flash-new"
          interactive={false}
          eventHandlers={{ add: setPathLength }}
          pathOptions={{ color: '#4ade80', weight: 6, opacity: 1 }}
        >
          {mid && (
            <Tooltip permanent direction="top" className="flash-label">
              {label}
            </Tooltip>
          )}
        </Polyline>
      )}
    </>
  )
}

export function RouteFlash() {
  const flashes = useStore((s) => s.flashes)
  return (
    <>
      {flashes.map((f) => (
        <FlashPaths key={f.key} flash={f} />
      ))}
    </>
  )
}
