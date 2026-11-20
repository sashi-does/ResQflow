import L from 'leaflet'
import { useEffect, useMemo } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet'
import { cn } from '@/lib/utils'
import { useStore } from '../../store'
import type { LatLon } from '../../types'
import { CampsLayer } from '../map/CampsLayer'
import { HazardsLayer } from '../map/HazardsLayer'
import { RoadsLayer } from '../map/RoadsLayer'
import { TrucksLayer } from '../map/TrucksLayer'
import { WarehousesLayer } from '../map/WarehousesLayer'

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'

function Fit({ pts }: { pts: LatLon[] }) {
  const map = useMap()
  const key = pts.map((p) => p.join(',')).join(';')
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(map.getContainer())
    return () => ro.disconnect()
  }, [map])
  useEffect(() => {
    if (pts.length === 1) map.setView(pts[0], 8.5)
    else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 9 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map])
  return null
}

/** A small live map focused on one place (camp, truck route, warehouse), with a compact legend. */
export function FocusMap({ focus, path, ring, className }: { focus: LatLon[]; path?: LatLon[]; ring?: LatLon; className?: string }) {
  const scenario = useStore((s) => s.scenario)
  const nodes = useMemo(() => new Map((scenario?.nodes ?? []).map((n) => [n.id, n])), [scenario])
  if (!scenario) return <div className={cn('animate-pulse rounded-xl bg-slate-200', className)} />
  return (
    <div className={cn('relative isolate z-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100', className)} data-testid="focus-map">
      <MapContainer center={focus[0] ?? [26.6, 92.6]} zoom={8.5} zoomSnap={0.25} className="h-full w-full" zoomControl={false} attributionControl={false}>
        <TileLayer url={ESRI} />
        <HazardsLayer />
        <RoadsLayer edges={scenario.edges} />
        {path && path.length > 1 && <Polyline positions={path} interactive={false} pathOptions={{ color: '#0d9488', weight: 4, opacity: 0.9 }} />}
        <CampsLayer camps={scenario.camps} nodes={nodes} />
        <WarehousesLayer warehouses={scenario.warehouses} nodes={nodes} />
        <TrucksLayer />
        {ring && <CircleMarker center={ring} radius={18} interactive={false} pathOptions={{ color: '#0f766e', weight: 2, fillOpacity: 0.06, dashArray: '4 3' }} />}
        <Fit pts={focus} />
      </MapContainer>
      <div className="absolute bottom-2 left-2 z-[1000] flex flex-wrap gap-x-3 gap-y-1 rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-[11px] text-slate-700" data-testid="mini-legend">
        <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-4 bg-teal-600" /> route</span>
        <span className="flex items-center gap-1"><i className="inline-block h-0 w-4 border-t-2 border-dashed border-red-600" /> road closed</span>
        <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm border border-blue-600 bg-blue-500/25" /> flood</span>
        <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-full bg-red-600 ring-2 ring-white" /> camp</span>
        <span className="flex items-center gap-1"><i className="wh-icon !size-2.5" /> warehouse</span>
      </div>
    </div>
  )
}
