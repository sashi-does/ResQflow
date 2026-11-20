import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
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

export function MapView() {
  const scenario = useStore((s) => s.scenario)
  const nodeById = useMemo(() => new Map((scenario?.nodes ?? []).map((n) => [n.id, n])), [scenario])

  return (
    <MapContainer
      center={ASSAM_CENTER}
      zoom={8}
      zoomSnap={0.25}
      className="h-full w-full"
      zoomControl={false}
      attributionControl
    >
      <TileLayer url={`${ESRI}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`} attribution={ATTRIBUTION} maxZoom={16} />
      {scenario && (
        <>
          <FitToNodes nodes={scenario.nodes} />
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
