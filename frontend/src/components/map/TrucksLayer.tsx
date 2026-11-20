import L from 'leaflet'
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import { TRUCK_COLORS, TRUCK_STATUS_LABEL, fmtDuration, shortName } from '../../lib/format'
import { useStore } from '../../store'
import type { Scenario, TruckView } from '../../types'

const LERP_MS = 1000 // ticks arrive ~1/s; move linearly between them so motion is continuous

interface Animated {
  marker: L.Marker
  from: L.LatLng
  to: L.LatLng
  t0: number
  iconKey: string
}

function truckIcon(t: TruckView, selected: boolean): L.DivIcon {
  const c = TRUCK_COLORS[t.status]
  const ring = selected ? 'box-shadow:0 0 0 2px #0f766e;' : ''
  return L.divIcon({
    className: '',
    html: `<div class="truck-icon" style="${ring}"><span class="dot" style="background:${c}"></span><span>${t.id}</span></div>`,
    iconSize: [40, 20],
    iconAnchor: [20, 10],
  })
}

function describe(t: TruckView, sc: Scenario | null, simSeconds: number): string {
  const names = new Map<string, string>()
  sc?.camps.forEach((c) => names.set(c.id, shortName(c.name)))
  sc?.nodes.forEach((n) => names.set(n.id, shortName(n.name)))
  const dest = t.heading_to ? (names.get(t.heading_to) ?? t.heading_to) : ''
  const eta = t.eta_sim_seconds ? ` · ETA ${fmtDuration((t.eta_sim_seconds - simSeconds) / 60)}` : ''
  return `<b>${t.id}</b> · ${TRUCK_STATUS_LABEL[t.status]}${dest ? ` → ${dest}` : ''}${eta}`
}

export function TrucksLayer() {
  const map = useMap()
  const trucks = useStore((s) => s.trucks)
  const scenario = useStore((s) => s.scenario)
  const simSeconds = useStore((s) => s.sim?.sim_seconds ?? 0)
  const selected = useStore((s) => s.selected?.truck_ids)
  const anim = useRef(new Map<string, Animated>())

  useEffect(() => {
    const now = performance.now()
    const live = new Set(Object.keys(trucks))
    for (const t of Object.values(trucks)) {
      const to = L.latLng(t.lat, t.lon)
      const isSel = !!selected?.includes(t.id)
      const iconKey = `${t.status}-${isSel}`
      let a = anim.current.get(t.id)
      if (!a) {
        const marker = L.marker(to, { icon: truckIcon(t, isSel), zIndexOffset: 1000, keyboard: false })
        marker.bindTooltip('', { direction: 'top', offset: [0, -10] })
        marker.on('click', () => useStore.getState().setPick({ kind: 'truck', id: t.id }))
        marker.addTo(map)
        a = { marker, from: to, to, t0: now, iconKey }
        anim.current.set(t.id, a)
      } else {
        const cur = a.marker.getLatLng()
        const jump = cur.distanceTo(to) > 60_000 // reset / reconnect: don't slide across the map
        a.from = jump ? to : cur
        a.to = to
        a.t0 = now
        if (a.iconKey !== iconKey) {
          a.marker.setIcon(truckIcon(t, isSel))
          a.iconKey = iconKey
        }
      }
      a.marker.setTooltipContent(describe(t, scenario, simSeconds))
    }
    for (const [id, a] of anim.current) {
      if (!live.has(id)) {
        a.marker.remove()
        anim.current.delete(id)
      }
    }
  }, [trucks, map, scenario, simSeconds, selected])

  useEffect(() => {
    const store = anim.current
    let raf = 0
    const loop = (now: number) => {
      for (const a of store.values()) {
        const k = Math.min(1, (now - a.t0) / LERP_MS)
        a.marker.setLatLng([a.from.lat + (a.to.lat - a.from.lat) * k, a.from.lng + (a.to.lng - a.from.lng) * k])
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      for (const a of store.values()) a.marker.remove()
      store.clear()
    }
  }, [map])

  return null
}
