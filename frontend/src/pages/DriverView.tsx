import { useCallback, useState } from 'react'
import { api } from '../api'
import { Activity, FocusMap, Panel, RolePage, Stat } from '../components/RoleLayout'
import { TRUCK_COLORS, TRUCK_STATUS_LABEL, fmtDuration, fmtItems, fmtKg, shortName } from '../lib/format'
import { useStore } from '../store'
import type { LatLon, LogEntry } from '../types'

const KINDS = ['waterlogged', 'blocked', 'landslide'] as const

export function DriverView({ truckId }: { truckId: string }) {
  const truck = useStore((s) => s.trucks[truckId])
  const scenario = useStore((s) => s.scenario)
  const sim = useStore((s) => s.sim)
  const toast = useStore((s) => s.toast)
  const [reportEdge, setReportEdge] = useState<string | null>(null)
  const match = useCallback((e: LogEntry) => e.refs.truck_ids.includes(truckId), [truckId])

  if (!truck || !scenario) return <div className="flex flex-1 items-center justify-center text-slate-400">Loading…</div>
  const path = truck.path_coords ?? []
  const job = truck.job
  const etaMin = truck.eta_sim_seconds && sim ? (truck.eta_sim_seconds - sim.sim_seconds) / 60 : null
  const eta = etaMin !== null ? fmtDuration(etaMin) : null
  const alert = truck.pending_reroute
  const roads = truck.route_roads ?? []
  const ahead = roads.slice(0, 4)
  const km = roads.reduce((a, r) => a + r.km, 0)
  const here: LatLon = [truck.lat, truck.lon]

  return (
    <RolePage
      icon="🚚"
      role="Driver"
      title={`Truck ${truck.id}`}
      meta={job ? `${shortName(job.from)} → ${shortName(job.to)} · ${sim?.sim_time ?? ''}` : (sim?.sim_time ?? '')}
      badge={
        <span className="rounded-md px-2.5 py-1 text-xs font-bold uppercase" style={{ background: `${TRUCK_COLORS[truck.status]}26`, color: TRUCK_COLORS[truck.status] }}>
          {TRUCK_STATUS_LABEL[truck.status]}
        </span>
      }
      about="Route changes from the Routing agent need the driver's acknowledgement. One road report is unverified and closes nothing; a second report or Command's confirmation closes the road for every truck."
    >
      {alert && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/70 p-6" data-testid="reroute-alert">
          <div className="w-full max-w-lg rounded-2xl border border-red-500/60 bg-red-950 p-8 text-center shadow-2xl">
            <div className="text-5xl">⚠️</div>
            <div className="mt-3 text-2xl font-bold text-white">Route changed</div>
            <p className="mt-3 text-base leading-relaxed text-red-100">{alert.message.replace(/^Route changed\. /, '')}</p>
            <p className="mt-2 text-xs text-red-200/70">Sent by the Routing agent at {alert.at}</p>
            <button
              className="mt-6 w-full rounded-xl bg-white py-3 text-lg font-bold text-red-900 hover:bg-red-50"
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
        </div>
      )}

      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 p-6 lg:grid-cols-12">
        <div className="grid grid-cols-2 gap-4 lg:col-span-12 lg:grid-cols-4">
          <Stat label="Destination" value={job ? shortName(job.to) : '—'} sub={job ? `from ${shortName(job.from)}` : 'no active job'} />
          <Stat label="Cargo" value={job ? fmtKg(job.weight_kg) : '—'} sub={job ? fmtItems(job.items) : 'empty'} />
          <Stat label="ETA" value={eta ?? '—'} color="#7dd3fc" sub={truck.status === 'returning' ? 'returning to base' : undefined} />
          <Stat label="Route ahead" value={roads.length ? `${km.toFixed(0)} km` : '—'} sub={roads.length ? `${roads.length} road segments` : 'not moving'} />
        </div>

        <div className="lg:col-span-8">
          <FocusMap focus={path.length > 1 ? path : [here]} path={path} ring={here} className="h-[560px]" />
        </div>

        <div className="flex flex-col gap-4 lg:col-span-4">
          <Panel title="Turn-by-turn route">
            {roads.length === 0 && <div className="text-sm text-slate-500">Not moving.</div>}
            <ol className="space-y-2" data-testid="route-steps">
              {roads.map((r, i) => (
                <li key={`${r.edge_id}-${i}`} className={`flex items-start gap-3 text-sm ${r.blocked ? 'text-red-300' : 'text-slate-200'}`}>
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[11px]">{i + 1}</span>
                  <span>
                    <b>{r.road}</b>
                    <span className="block text-xs text-slate-400">
                      {shortName(r.from)} → {shortName(r.to)} · {r.km} km
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="Report a road problem" testId="road-report">
            {ahead.length === 0 && <div className="text-sm text-slate-500">You're not on a road right now.</div>}
            <div className="flex flex-wrap gap-2">
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
              <div className="mt-3 grid grid-cols-3 gap-2">
                {KINDS.map((k) => (
                  <button
                    key={k}
                    className="btn-reject capitalize"
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
          </Panel>

          <Panel title="Status">
            <div className="grid grid-cols-3 gap-2">
              {['Loaded', 'Arrived', 'Unloaded'].map((b) => (
                <button key={b} className="btn-chip" disabled title="Automatic in demo mode">
                  {b}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">Automatic in demo mode: the simulation updates loading and arrival.</p>
          </Panel>
        </div>

        <Panel title="Activity for this truck" className="lg:col-span-12">
          <Activity match={match} empty="No agent activity for this truck yet." />
        </Panel>
      </div>
    </RolePage>
  )
}
