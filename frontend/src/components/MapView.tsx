import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import { useTheme } from '../lib/theme'
import { useStore } from '../store'
import type { Node } from '../types'
import { CampsLayer } from './map/CampsLayer'
import { DrawLayer } from './map/DrawLayer'
import { HazardsLayer } from './map/HazardsLayer'
import { NodesLayer } from './map/NodesLayer'
import { RoadsLayer } from './map/RoadsLayer'
import { RouteFlash } from './map/RouteFlash'
import { RoutesLayer } from './map/RoutesLayer'
import { TrucksLayer } from './map/TrucksLayer'
import { WarehousesLayer } from './map/WarehousesLayer'

const ASSAM_CENTER: [number, number] = [26.6, 92.6]

// Esri World Light Gray: keyless, quiet basemap that matches the light app (CARTO now requires an API key).
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas'
const ATTRIBUTION = 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors'

function FitToNodes({ nodes }: { nodes: Node[] }) {
  const map = useMap()
  useEffect(() => {
    if (nodes.length === 0) return
    map.fitBounds(
      nodes.map((n) => [n.lat, n.lon] as [number, number]),
      { paddingTopLeft: [20, 40], paddingBottomRight: [80, 90] },
    )
  }, [map, nodes])
  return null
}

/** Fly to whatever was picked (map click, search, incident list) or to an explicit focus point. */
function FlyTo({ nodes }: { nodes: Map<string, Node> }) {
  const map = useMap()
  const pick = useStore((s) => s.pick)
  const focus = useStore((s) => s.focus)
  const scenario = useStore((s) => s.scenario)
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lon], Math.max(map.getZoom(), focus.zoom), { duration: 0.8 })
  }, [map, focus])
  useEffect(() => {
    if (!pick || !scenario) return
    let at: [number, number] | null = null
    if (pick.kind === 'truck') {
      const t = useStore.getState().trucks[pick.id]
      if (t) at = [t.lat, t.lon]
    } else {
      const def = pick.kind === 'camp' ? scenario.camps.find((c) => c.id === pick.id) : scenario.warehouses.find((w) => w.id === pick.id)
      const n = def && nodes.get(def.node_id)
      if (n) at = [n.lat, n.lon]
    }
    if (at && !map.getBounds().pad(-0.15).contains(at)) map.flyTo(at, map.getZoom(), { duration: 0.6 })
  }, [map, pick, scenario, nodes])
  return null
}

export function MapView() {
  const scenario = useStore((s) => s.scenario)
  const nodeById = useMemo(() => new Map((scenario?.nodes ?? []).map((n) => [n.id, n])), [scenario])
  const theme = useTheme()
  const base = theme === 'dark' ? 'World_Dark_Gray_Base' : 'World_Light_Gray_Base'

  return (
    <MapContainer
      center={ASSAM_CENTER}
      zoom={8}
      zoomSnap={0.25}
      className="h-full w-full"
      zoomControl={false}
      attributionControl
    >
      <TileLayer key={base} url={`${ESRI}/${base}/MapServer/tile/{z}/{y}/{x}`} attribution={ATTRIBUTION} maxZoom={16} />
      {scenario && (
        <>
          <FitToNodes nodes={scenario.nodes} />
          <FlyTo nodes={nodeById} />
          <HazardsLayer />
          <RoadsLayer edges={scenario.edges} />
          <RoutesLayer />
          <NodesLayer nodes={scenario.nodes} />
          <CampsLayer camps={scenario.camps} nodes={nodeById} />
          <WarehousesLayer warehouses={scenario.warehouses} nodes={nodeById} />
          <RouteFlash />
          <TrucksLayer />
          <DrawLayer />
        </>
      )}
    </MapContainer>
  )
}
