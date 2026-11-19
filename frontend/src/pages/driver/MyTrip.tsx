import { Clock, MapPin, Package, Route } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSession } from '../../auth'
import { Empty, PageGrid, RowsSkeleton, Section, StatCard } from '../../components/app/blocks'
import { FocusMap } from '../../components/app/FocusMap'
import { TruckStatusPill } from '../../components/app/status'
import { fmtDuration, fmtItems, fmtKg, shortName } from '../../lib/format'
import { useStore } from '../../store'
import type { LatLon } from '../../types'

export function DriverMyTrip() {
  const id = useSession()?.user.scope_id ?? ''
  const truck = useStore((s) => s.trucks[id])
  const sim = useStore((s) => s.sim)
  if (!truck) return <RowsSkeleton rows={5} />
  const job = truck.job
  const roads = truck.route_roads ?? []
  const km = roads.reduce((a, r) => a + r.km, 0)
  const eta = truck.eta_sim_seconds && sim ? fmtDuration((truck.eta_sim_seconds - sim.sim_seconds) / 60) : null
  const here: LatLon = [truck.lat, truck.lon]
  const path = truck.path_coords ?? []
  return (
    <PageGrid>
      <div className="grid grid-cols-2 gap-4 lg:col-span-12 lg:grid-cols-4">
        <StatCard label="Going to" value={<span className="text-xl">{job ? shortName(job.to) : truck.status === 'returning' ? 'Base' : '—'}</span>} sub={job ? `from ${shortName(job.from)}` : 'no active job'} icon={MapPin} tone="blue" testId="driver-job" />
        <StatCard label="Cargo" value={job ? fmtKg(job.weight_kg) : '—'} sub={job ? fmtItems(job.items) : 'empty'} icon={Package} tone="blue" />
        <StatCard label="ETA" value={eta ?? '—'} sub={<TruckStatusPill status={truck.status} />} icon={Clock} tone="blue" />
        <StatCard label="Road ahead" value={roads.length ? `${km.toFixed(0)} km` : '—'} sub={roads.length ? `${roads.length} roads` : 'not moving'} icon={Route} tone="blue" />
      </div>
      <Section title="Your route" description="Road by road. Red means the road is closed." className="lg:col-span-5">
        {roads.length === 0 ? (
          <Empty icon={Route} title={truck.status === 'idle' ? 'No job yet. Wait at the warehouse.' : 'Not moving right now.'} />
        ) : (
          <ol className="space-y-3" data-testid="route-steps">
            {roads.map((r, i) => (
              <li key={`${r.edge_id}-${i}`} className="flex items-start gap-3">
                <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold', r.blocked ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700')}>{i + 1}</span>
                <div>
                  <div className={cn('font-semibold', r.blocked ? 'text-red-700' : 'text-slate-900')}>{r.road}</div>
                  <div className="text-sm text-slate-500">
                    {shortName(r.from)} → {shortName(r.to)} · {r.km} km
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-6 grid grid-cols-3 gap-2">
          {['Loaded', 'Arrived', 'Unloaded'].map((b) => (
            <Button key={b} variant="outline" disabled title="Updated automatically in the demo">
              {b}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">In the demo the simulation updates loading and arrival automatically.</p>
      </Section>
      <div className="lg:col-span-7">
        <FocusMap focus={path.length > 1 ? path : [here]} path={path} ring={here} className="h-80 lg:h-[480px]" />
      </div>
    </PageGrid>
  )
}
