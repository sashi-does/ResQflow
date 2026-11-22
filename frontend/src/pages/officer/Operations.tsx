import { Maximize2, Megaphone, Minimize2, MousePointerClick, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardAction, CardDescription } from '@/components/ui/card'
import { ActivityList } from '../../components/app/ActivityList'
import { Empty } from '../../components/app/blocks'
import { OpsMap } from '../../components/app/OpsMap'
import { CampStatus, TruckStatusPill } from '../../components/app/status'
import { fmtDuration, fmtItems, fmtKg, fmtNum, shortName } from '../../lib/format'
import { useNames } from '../../lib/names'
import { useStore } from '../../store'
import { cn } from '@/lib/utils'
import { api } from '../../api'
import { Incidents } from '../../components/command/Incidents'
import type { IncidentFilter } from '../../lib/incidents'
import { useWeather } from '../../lib/weather'
import { Fleet, IntelTiles, Suggestions } from '../../components/command/Intel'
import { SendAlertDialog, type AlertDraft } from '../../components/command/SendAlertDialog'
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
        {w.offline && <Row k="Status" v={<span className="text-red-700">Offline: {w.offline_reason}</span>} />}
        {(w.restocks ?? []).map((r) => (
          <Row key={r.id} k="Restock on the way" v={`${fmtItems(r.items)} · arrives ${r.arrives_at}`} />
        ))}
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
  // One fixed frame on desktop (incidents | map | intelligence); long lists scroll inside their own column.
  const pick = useStore((s) => s.pick)
  const sim = useStore((s) => s.sim)
  const toast = useStore((s) => s.toast)
  const weather = useWeather()
  const [filter, setFilter] = useState<IncidentFilter>('all')
  const [draft, setDraft] = useState<AlertDraft | null>(null)
  const [full, setFull] = useState(false)
  const frame = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === frame.current)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void frame.current?.requestFullscreen?.()
  }
  const onAlert = useCallback((d: AlertDraft) => setDraft(d), [])
  return (
    <div ref={frame} className={cn('flex flex-col gap-3', full ? 'h-dvh bg-slate-50 p-3' : 'lg:h-[calc(100dvh-12.5rem)] lg:min-h-[560px]')} data-testid="ops-frame">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold', sim?.running ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600')}>
          <span className={cn('size-1.5 rounded-full', sim?.running ? 'animate-pulse bg-emerald-500' : 'bg-slate-400')} aria-hidden />
          {sim?.held ? 'AI planning' : sim?.running ? 'Live' : 'Paused'}
        </span>
        <span className="text-sm font-semibold text-slate-900 tnum">{sim?.sim_time ?? '—'}</span>
        <span className="hidden text-xs text-slate-500 sm:inline">· {CASE_TITLE[sim?.case_id ?? ''] ?? 'Assam floods'}</span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setDraft({ camps: 'risk' })} data-testid="open-send-alert">
            <Megaphone /> Send alert
          </Button>
          <Button size="sm" variant="outline" onClick={() => api.replan().then(() => toast('Re-planning now', 'info'), (e: unknown) => toast(String(e), 'error'))}>
            <RefreshCw /> Re-plan now
          </Button>
          <Button size="sm" variant="ghost" onClick={toggleFull} aria-label={full ? 'Exit full screen' : 'Full screen'}>
            {full ? <Minimize2 /> : <Maximize2 />}
          </Button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12">
        <Card className="h-[360px] min-h-0 gap-0 overflow-hidden py-0 lg:col-span-3 lg:h-full">
          <Incidents filter={filter} onFilter={setFilter} />
        </Card>
        <OpsMap className="h-[420px] lg:col-span-6 lg:h-full" compact />
        <Card className="max-h-[640px] min-h-0 py-0 lg:col-span-3 lg:h-full lg:max-h-none">
          <CardContent className="h-full min-h-0 space-y-5 overflow-y-auto px-4 py-4" data-testid="ops-details-scroll">
            {pick ? (
              <Details />
            ) : (
              <>
                <IntelTiles weather={weather} />
                <Suggestions weather={weather} onAlert={onAlert} />
                <Fleet />
              </>
            )}
          </CardContent>
        </Card>
      </div>
      <SendAlertDialog draft={draft} onClose={() => setDraft(null)} />
    </div>
  )
}

const CASE_TITLE: Record<string, string> = { highway: 'Case 1 · Highway flood', northbank: 'Case 2 · North bank cut off', surge: 'Case 3 · Lower Assam surge' }
