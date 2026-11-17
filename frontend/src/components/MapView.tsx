import { MapContainer, TileLayer } from 'react-leaflet'

const ASSAM_CENTER: [number, number] = [26.4, 92.9]

// Esri World Dark Gray: keyless dark basemap (CARTO now requires an API key).
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas'
const ATTRIBUTION = 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors'

export function MapView() {
  return (
    <MapContainer center={ASSAM_CENTER} zoom={7} className="h-full w-full" preferCanvas>
      <TileLayer url={`${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`} attribution={ATTRIBUTION} maxZoom={16} />
      <TileLayer url={`${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`} maxZoom={16} />
    </MapContainer>
  )
}
