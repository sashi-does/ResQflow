import L from 'leaflet'
import { useEffect, useMemo, type ReactNode } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet'
import { AGENT_COLORS, AGENT_LABEL } from '../lib/format'
import { useStore } from '../store'
import type { LatLon, LogEntry } from '../types'
import { CampsLayer } from './map/CampsLayer'
import { HazardsLayer } from './map/HazardsLayer'
import { RoadsLayer } from './map/RoadsLayer'
import { TrucksLayer } from './map/TrucksLayer'
import { WarehousesLayer } from './map/WarehousesLayer'

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'

/** Full-width desktop page for a field role: header bar + scrollable body. */
export function RolePage({
  icon,
  role,
  title,
  meta,
  badge,
  about,
  children,
}: {
  icon: string
  role: string
  title: string
  meta: ReactNode
  badge?: ReactNode
  about: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-950" data-testid="role-page">
      <header className="flex flex-wrap items-center gap-4 border-b border-slate-800 bg-slate-900/60 px-6 py-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-2xl">{icon}</div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-wider text-sky-400 uppercase">{role}</div>
          <h1 className="text-xl font-semibold text-white">{title}</h1>
          <div className="text-sm text-slate-400">{meta}</div>
        </div>
        {badge && <div className="ml-2">{badge}</div>}
        <p className="ml-auto hidden max-w-md text-xs leading-relaxed text-slate-500 xl:block">{about}</p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}

export function Panel({
  title,
  action,
  tone,
  className = '',
  children,
  testId,
}: {
  title?: string
  action?: ReactNode
  tone?: 'warn' | 'bad' | 'ok'
  className?: string
  children: ReactNode
  testId?: string
}) {
  const border = tone === 'bad' ? 'border-red-500/50' : tone === 'warn' ? 'border-amber-500/50' : tone === 'ok' ? 'border-emerald-500/50' : 'border-slate-800'
  return (
    <section className={`rounded-xl border ${border} bg-slate-900/70 ${className}`} data-testid={testId}>
      {title && (
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-2.5">
          <h3 className="text-xs font-semibold tracking-wider text-slate-300 uppercase">{title}</h3>
          {action && <div className="ml-auto">{action}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function Stat({ label, value, sub, color, pct }: { label: string; value: ReactNode; sub?: ReactNode; color?: string; pct?: number }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: color ?? '#f1f5f9' }}>
        {value}
      </div>
      {pct !== undefined && (
        <div className="mt-2 h-1.5 rounded bg-slate-800">
          <div className="h-1.5 rounded" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
        </div>
      )}
      {sub && <div className="mt-1.5 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

function Fit({ pts }: { pts: LatLon[] }) {
  const map = useMap()
  const key = pts.map((p) => p.join(',')).join(';')
  useEffect(() => {
    // The grid may size the container after Leaflet mounts: re-measure so every tile loads.
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(map.getContainer())
    return () => ro.disconnect()
  }, [map])
  useEffect(() => {
    if (pts.length === 1) map.setView(pts[0], 8.5)
    else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 9 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map])
  return null
}

/** The live operations map, focused on one place (a camp, a truck's route, a warehouse). */
export function FocusMap({ focus, path, ring, className = '' }: { focus: LatLon[]; path?: LatLon[]; ring?: LatLon; className?: string }) {
  const scenario = useStore((s) => s.scenario)
  const nodes = useMemo(() => new Map((scenario?.nodes ?? []).map((n) => [n.id, n])), [scenario])
  if (!scenario) return null
  return (
    <div className={`relative isolate z-0 overflow-hidden rounded-xl border border-slate-800 ${className}`}>
      <MapContainer center={focus[0] ?? [26.6, 92.6]} zoom={8.5} zoomSnap={0.25} className="h-full w-full" zoomControl={false} attributionControl={false}>
        <TileLayer url={ESRI} />
        <HazardsLayer />
        <RoadsLayer edges={scenario.edges} />
        {path && path.length > 1 && <Polyline positions={path} interactive={false} pathOptions={{ color: '#4ade80', weight: 5, opacity: 0.9 }} />}
        <CampsLayer camps={scenario.camps} nodes={nodes} />
        <WarehousesLayer warehouses={scenario.warehouses} nodes={nodes} />
        <TrucksLayer />
        {ring && <CircleMarker center={ring} radius={18} interactive={false} pathOptions={{ color: '#38bdf8', weight: 2, fillOpacity: 0.05 }} />}
        <Fit pts={focus} />
      </MapContainer>
    </div>
  )
}

/** Decision-log entries relevant to this role. */
export function Activity({ match, empty = 'Nothing yet.' }: { match: (e: LogEntry) => boolean; empty?: string }) {
  const log = useStore((s) => s.log)
  const rows = useMemo(() => log.filter(match).slice(0, 12), [log, match])
  if (rows.length === 0) return <div className="text-sm text-slate-500">{empty}</div>
  return (
    <ul className="space-y-2" data-testid="role-activity">
      {rows.map((e) => (
        <li key={e.id} className="border-l-2 pl-3" style={{ borderLeftColor: AGENT_COLORS[e.agent] }}>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="font-semibold uppercase" style={{ color: AGENT_COLORS[e.agent] }}>
              {AGENT_LABEL[e.agent]}
            </span>
            <span className="font-mono text-slate-500">{e.sim_time}</span>
          </div>
          <div className="text-sm text-slate-200">{e.summary}</div>
        </li>
      ))}
    </ul>
  )
}
