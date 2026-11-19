import L from 'leaflet'
import { useEffect, useState } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet'
import { api } from '../api'
import { Card, PhoneFrame } from '../components/PhoneFrame'
import { TRUCK_COLORS, TRUCK_STATUS_LABEL, fmtDuration, fmtItems, fmtKg, shortName } from '../lib/format'
import { useStore } from '../store'
import type { LatLon } from '../types'

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
const KINDS = ['waterlogged', 'blocked', 'landslide'] as const

function Fit({ pts }: { pts: LatLon[] }) {
  const map = useMap()
  const key = pts.length ? `${pts[0][0]},${pts[pts.length - 1][1]},${pts.length}` : ''
  useEffect(() => {
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [16, 16] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map])
  return null
}

export function DriverView({ truckId }: { truckId: string }) {
  const truck = useStore((s) => s.trucks[truckId])
  const scenario = useStore((s) => s.scenario)
  const sim = useStore((s) => s.sim)
  const blocked = useStore((s) => s.blocked)
  const toast = useStore((s) => s.toast)
  const [reportEdge, setReportEdge] = useState<string | null>(null)

  if (!truck || !scenario) return <PhoneFrame caption="">Loading…</PhoneFrame>
  const path = truck.path_coords ?? []
  const job = truck.job
  const eta = truck.eta_sim_seconds && sim ? fmtDuration((truck.eta_sim_seconds - sim.sim_seconds) / 60) : null
  const alert = truck.pending_reroute
  const ahead = (truck.route_roads ?? []).slice(0, 4)

  return (
    <PhoneFrame
      caption={
        <>
          <p className="text-base font-semibold text-slate-200">Driver</p>
          <p className="mt-2">
            What the driver of {truck.id} sees. When the Routing agent changes the route, the phone shows it full-screen and the
            driver acknowledges; the acknowledgement lands in the Command feed.
          </p>
          <p className="mt-2">
            Drivers can report a road problem. One report is <i>unverified</i> and closes nothing; a second report or Command's
            confirmation closes the road and re-routes every truck on it.
          </p>
        </>
      }
    >
      {alert && (
        <div className="absolute inset-0 z-[1200] flex flex-col justify-center bg-red-950/95 p-6 text-center" data-testid="reroute-alert">
          <div className="text-5xl">⚠️</div>
          <div className="mt-3 text-2xl font-bold text-white">Route changed</div>
          <p className="mt-3 text-base leading-relaxed text-red-100">{alert.message.replace(/^Route changed\. /, '')}</p>
          <p className="mt-2 text-xs text-red-200/70">Sent by the Routing agent at {alert.at}</p>
          <button
            className="mt-6 rounded-xl bg-white py-3 text-lg font-bold text-red-900"
            data-testid="ack"
            onClick={() =>
              api
                .ack(truck.id)
                .then(() => toast('Acknowledged. Command has been told.', 'ok'))
                .catch((e: unknown) => toast(String(e), 'error'))
            }
          >
            Acknowledge
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-lg">🚚</span>
        <div>
          <div className="font-semibold text-white">Truck {truck.id}</div>
          <div className="text-[11px] text-slate-400">{sim?.sim_time}</div>
        </div>
        <span className="ml-auto rounded px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: `${TRUCK_COLORS[truck.status]}33`, color: TRUCK_COLORS[truck.status] }}>
          {TRUCK_STATUS_LABEL[truck.status]}
        </span>
      </div>

      <Card title="Current job">
        {job ? (
          <div className="text-sm text-slate-200" data-testid="driver-job">
            <div className="font-semibold">
              {shortName(job.from)} → {shortName(job.to)}
            </div>
            <div className="text-xs text-slate-400">
              {fmtItems(job.items)} · {fmtKg(job.weight_kg)}
            </div>
            {eta && <div className="mt-1 text-xs text-sky-300">ETA {eta}</div>}
          </div>
        ) : (
          <div className="text-sm text-slate-400">
            {truck.status === 'returning' ? `Returning to base${eta ? ` · ${eta}` : ''}` : 'No job. Waiting at the warehouse.'}
          </div>
        )}
      </Card>

      <div className="relative isolate z-0 mt-3 h-44 overflow-hidden rounded-xl border border-slate-700">
        <MapContainer center={[truck.lat, truck.lon]} zoom={8} className="h-full w-full" zoomControl={false} attributionControl={false}>
          <TileLayer url={ESRI} />
          {scenario.edges.map((e) => (
            <Polyline
              key={`${e.id}-${blocked.includes(e.id)}`}
              positions={e.geometry}
              interactive={false}
              pathOptions={{ color: blocked.includes(e.id) ? '#ef4444' : '#475569', weight: 2, dashArray: blocked.includes(e.id) ? '5 5' : undefined }}
            />
          ))}
          {path.length > 1 && <Polyline positions={path} pathOptions={{ color: '#4ade80', weight: 4 }} />}
          <CircleMarker center={[truck.lat, truck.lon]} radius={7} pathOptions={{ color: '#fff', fillColor: TRUCK_COLORS[truck.status], fillOpacity: 1 }} />
          <Fit pts={path.length > 1 ? path : [[truck.lat, truck.lon]]} />
        </MapContainer>
      </div>

      <Card title="Route">
        {(truck.route_roads ?? []).length === 0 && <div className="text-xs text-slate-500">Not moving.</div>}
        <ol className="space-y-1" data-testid="route-steps">
          {(truck.route_roads ?? []).map((r, i) => (
            <li key={`${r.edge_id}-${i}`} className={`flex items-start gap-2 text-xs ${r.blocked ? 'text-red-300' : 'text-slate-200'}`}>
              <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-slate-700 text-center text-[10px] leading-4">{i + 1}</span>
              <span>
                <b>{r.road}</b>
                <span className="text-slate-400">
                  {' '}
                  · {shortName(r.from)} → {shortName(r.to)} · {r.km} km
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Report road problem">
        {ahead.length === 0 && <div className="text-xs text-slate-500">You're not on a road right now.</div>}
        <div className="flex flex-wrap gap-1">
          {ahead.map((r) => (
            <button
              key={r.edge_id}
              className={`btn-chip ${reportEdge === r.edge_id ? 'border-sky-400 text-sky-200' : ''}`}
              onClick={() => setReportEdge(r.edge_id)}
            >
              {r.road.split(' (')[0]} · {shortName(r.to)}
            </button>
          ))}
        </div>
        {reportEdge && (
          <div className="mt-2 grid grid-cols-3 gap-1">
            {KINDS.map((k) => (
              <button
                key={k}
                className="btn-reject text-xs"
                data-testid={`report-${k}`}
                onClick={() =>
                  api
                    .roadReport(truck.id, reportEdge, k)
                    .then((h) => {
                      setReportEdge(null)
                      toast(h.verified ? 'Road closed: second report confirmed it' : 'Reported. Command will verify it.', 'warn')
                    })
                    .catch((e: unknown) => toast(String(e), 'error'))
                }
              >
                {k}
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card title="Status">
        <div className="grid grid-cols-3 gap-1">
          {['Loaded', 'Arrived', 'Unloaded'].map((b) => (
            <button key={b} className="btn-chip" disabled title="Automatic in demo mode">
              {b}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-slate-500">Automatic in demo mode: the simulation updates loading and arrival.</p>
      </Card>
    </PhoneFrame>
  )
}
