import { MousePointerClick, X } from 'lucide-react'
import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardAction, CardDescription } from '@/components/ui/card'
import { ActivityList } from '../../components/app/ActivityList'
import { Empty } from '../../components/app/blocks'
import { OpsMap } from '../../components/app/OpsMap'
import { CampStatus, TruckStatusPill } from '../../components/app/status'
import { fmtDuration, fmtItems, fmtKg, fmtNum, shortName } from '../../lib/format'
import { useNames } from '../../lib/names'
import { useStore } from '../../store'
import type { LogEntry } from '../../types'

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="shrink-0 whitespace-nowrap text-slate-500">{k}</dt>
      <dd className="text-right font-medium text-slate-900 tnum">{v}</dd>
    </div>
  )
}

function Details() {
  const pick = useStore((s) => s.pick)
  const setPick = useStore((s) => s.setPick)
  const camps = useStore((s) => s.camps)
  const trucks = useStore((s) => s.trucks)
  const warehouses = useStore((s) => s.warehouses)
  const sim = useStore((s) => s.sim)
  const scenario = useStore((s) => s.scenario)
  const names = useNames()
  const match = useCallback(
    (e: LogEntry) =>
      pick?.kind === 'camp' ? e.refs.camp_ids.includes(pick.id) : pick?.kind === 'truck' ? e.refs.truck_ids.includes(pick.id) : !!pick && e.summary.includes(names.warehouse(pick.id)),
    [pick, names],
  )
  if (!pick) {
    return (
      <Empty icon={MousePointerClick} title="Click a camp, truck or warehouse">
        Details and its latest activity appear here.
      </Empty>
    )
  }
  const close = (
    <Button variant="ghost" size="icon" onClick={() => setPick(null)} aria-label="Close details">
      <X />
    </Button>
  )
  let title = ''
  let desc: React.ReactNode = null
  let body: React.ReactNode = null
  if (pick.kind === 'camp') {
    const c = camps[pick.id]
    const def = scenario?.camps.find((x) => x.id === pick.id)
    title = names.camp(pick.id, false)
    desc = def?.district
    body = c && (
      <dl className="divide-y">
        <Row k="Status" v={<CampStatus level={c.cut_off ? 'cut_off' : c.status} />} />
        <Row k="People" v={fmtNum(c.population ?? def?.population ?? 0)} />
        <Row k="Water left" v={`${c.water_days.toFixed(1)} days`} />
        <Row k="Overall cover" v={`${c.days_of_cover.toFixed(1)} days`} />
        <Row k="On the way" v={fmtItems(c.incoming)} />
        {c.unserved_reason && <p className="py-2 text-sm text-red-700">{c.unserved_reason}</p>}
      </dl>
    )
  } else if (pick.kind === 'truck') {
    const t = trucks[pick.id]
    title = names.truck(pick.id)
    body = t && (
      <dl className="divide-y">
        <Row k="Status" v={<TruckStatusPill status={t.status} />} />
        {t.job && <Row k="Job" v={`${shortName(t.job.from)} → ${names.camp(t.job.camp_id)}`} />}
        {t.job && <Row k="Cargo" v={`${fmtItems(t.job.items)} (${fmtKg(t.job.weight_kg)})`} />}
        {t.eta_sim_seconds && sim ? <Row k="ETA" v={fmtDuration((t.eta_sim_seconds - sim.sim_seconds) / 60)} /> : null}
        {(t.route_roads ?? []).length > 0 && <Row k="Route" v={(t.route_roads ?? []).map((r) => r.road.split(' (')[0]).join(' → ')} />}
      </dl>
    )
  } else {
    const w = warehouses[pick.id]
    title = `${names.warehouse(pick.id)} warehouse`
    body = w && (
      <dl className="divide-y">
        <Row k="Water" v={`${fmtNum(w.stock.water_l)} L (free ${fmtNum(w.available.water_l)})`} />
        <Row k="Food rations" v={`${fmtNum(w.stock.food_rations)} (free ${fmtNum(w.available.food_rations)})`} />
        <Row k="Medical kits" v={`${fmtNum(w.stock.medical_kits)} (free ${fmtNum(w.available.medical_kits)})`} />
        <Row k="Safety reserve" v="20% of opening stock" />
      </dl>
    )
  }
  return (
    <div data-testid="ops-details">
      <CardHeader className="px-0">
        <CardTitle>{title}</CardTitle>
        {desc && <CardDescription>{desc}</CardDescription>}
        <CardAction>{close}</CardAction>
      </CardHeader>
      <div className="mt-2">{body}</div>
      <h4 className="mt-5 mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Latest activity</h4>
      <ActivityList match={match} limit={6} empty="No activity yet." />
    </div>
  )
}

export function OfficerOperations() {
  // One fixed frame on desktop: the map fills it and a long details panel scrolls inside its card instead of stretching the page.
  return (
    <div className="grid grid-cols-1 gap-6 lg:h-[calc(100dvh-12.5rem)] lg:min-h-[520px] lg:grid-cols-12" data-testid="ops-frame">
      <OpsMap className="h-[420px] lg:col-span-8 lg:h-full xl:col-span-9" />
      <Card className="max-h-[560px] min-h-0 py-0 lg:col-span-4 lg:h-full lg:max-h-none xl:col-span-3">
        <CardContent className="h-full min-h-0 overflow-y-auto py-6" data-testid="ops-details-scroll">
          <Details />
        </CardContent>
      </Card>
    </div>
  )
}
