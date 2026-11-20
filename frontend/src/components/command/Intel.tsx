import { CheckCircle2, CloudRain, Construction, Lightbulb, MapPinOff, RefreshCw, TentTree, Truck, Users, Waves } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { api, type Weather } from '../../api'
import { fmtDuration, fmtKg, fmtNum, shortName } from '../../lib/format'
import { truckLabel } from '../../lib/names'
import { navigate } from '../../router'
import { useStore } from '../../store'
import { TruckStatusPill } from '../app/status'
import type { AlertDraft } from './SendAlertDialog'

function Heading({ icon: Icon, children, aside }: { icon: LucideIcon; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <Icon className="size-4 text-brand-700" aria-hidden />
      <h3 className="text-sm font-semibold text-slate-900">{children}</h3>
      {aside && <span className="ml-auto text-[11px] text-slate-500">{aside}</span>}
    </div>
  )
}

function Tile({ icon: Icon, label, value, sub, tone }: { icon: LucideIcon; label: string; value: React.ReactNode; sub?: string; tone?: 'red' | 'amber' }) {
  return (
    <div className={cn('rounded-lg border p-2.5', tone === 'red' ? 'border-red-200 bg-red-50' : tone === 'amber' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white')}>
      <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
        <Icon className={cn('size-3.5', tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : 'text-slate-400')} aria-hidden />
        {label}
      </div>
      <div className="mt-1 text-base leading-tight font-semibold text-slate-900 tnum">{value}</div>
      {sub && <div className="truncate text-[11px] text-slate-600">{sub}</div>}
    </div>
  )
}

/** Situation at a glance: rain, roads, camps, people, trucks, approvals. Every number from the live state. */
export function IntelTiles({ weather }: { weather: Weather | null }) {
  const hazards = useStore((s) => s.hazards)
  const blocked = useStore((s) => s.blocked)
  const camps = useStore((s) => s.camps)
  const trucks = useStore((s) => s.trucks)
  const scenario = useStore((s) => s.scenario)
  const top = weather?.districts[0]
  const floods = hazards.filter((h) => h.kind === 'flood' || h.kind === 'edge_closure').length
  const list = Object.values(camps)
  const crit = list.filter((c) => c.status === 'critical' && !c.cut_off).length
  const cut = list.filter((c) => c.cut_off).length
  const risk = list.filter((c) => c.cut_off || c.status === 'critical').reduce((n, c) => n + (c.population ?? scenario?.camps.find((d) => d.id === c.id)?.population ?? 0), 0)
  const moving = Object.values(trucks).filter((t) => t.status === 'en_route' || t.status === 'loading').length
  const holding = Object.values(trucks).filter((t) => t.status === 'holding').length
  return (
    <section data-testid="intel">
      <Heading icon={CloudRain} aside={weather ? 'Open-Meteo' : undefined}>
        Weather and hazards
      </Heading>
      <div className="grid grid-cols-2 gap-2">
        <Tile icon={CloudRain} label="Heaviest rain, 24 h" value={top ? `${fmtNum(top.rain_24h_mm)} mm` : '—'} sub={top ? `${top.district}${top.heavy ? ' · heavy' : ''}` : 'loading'} tone={top?.heavy ? 'amber' : undefined} />
        <Tile icon={Waves} label="Floods active" value={floods} sub={`${blocked.length} road segments closed`} tone={floods ? 'red' : undefined} />
        <Tile icon={TentTree} label="Camps critical" value={crit} sub="under 0.5 days of water" tone={crit ? 'red' : undefined} />
        <Tile icon={MapPinOff} label="Camps cut off" value={cut} sub="no safe road" tone={cut ? 'red' : undefined} />
        <Tile icon={Users} label="People at risk" value={fmtNum(risk)} sub="in critical or cut-off camps" tone={risk ? 'amber' : undefined} />
        <Tile icon={Truck} label="Trucks moving" value={`${moving}/${Object.keys(trucks).length}`} sub={holding ? `${holding} holding at a flood` : 'none stuck'} tone={holding ? 'amber' : undefined} />
      </div>
    </section>
  )
}

export function Fleet() {
  const trucks = useStore((s) => s.trucks)
  const sim = useStore((s) => s.sim)
  const scenario = useStore((s) => s.scenario)
  const setPick = useStore((s) => s.setPick)
  const list = Object.values(trucks).sort((a, b) => a.id.localeCompare(b.id))
  const busy = list.filter((t) => t.status !== 'idle').length
  const camp = (id: string) => shortName(scenario?.camps.find((c) => c.id === id)?.name ?? id)
  return (
    <section data-testid="fleet">
      <Heading icon={Truck} aside={`${list.length - busy} free · ${busy} working`}>
        Trucks
      </Heading>
      <ul className="space-y-1.5">
        {list.map((t) => (
          <li key={t.id}>
            <button onClick={() => setPick({ kind: 'truck', id: t.id })} className="flex w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-left hover:border-brand-400" data-testid="fleet-truck">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{truckLabel(t.id)}</span>
                <span className="block truncate text-[11px] text-slate-500">
                  {t.job ? `→ ${camp(t.job.camp_id)} · ${fmtKg(t.job.weight_kg)}` : t.at_warehouse ? `at ${shortName(scenario?.warehouses.find((w) => w.id === t.at_warehouse)?.name ?? '')}` : 'no job'}
                  {t.eta_sim_seconds && sim ? ` · ETA ${fmtDuration((t.eta_sim_seconds - sim.sim_seconds) / 60)}` : ''}
                </span>
              </span>
              <TruckStatusPill status={t.status} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

interface Suggestion {
  key: string
  text: string
  why: string
  from: string
  tone: 'red' | 'amber' | 'blue'
  actions: { label: string; run: () => void; primary?: boolean }[]
}

/** Next best actions for the officer, derived by code from the agents' live state (not written by the AI). */
export function Suggestions({ weather, onAlert }: { weather: Weather | null; onAlert: (d: AlertDraft) => void }) {
  const orders = useStore((s) => s.orders)
  const hazards = useStore((s) => s.hazards)
  const camps = useStore((s) => s.camps)
  const trucks = useStore((s) => s.trucks)
  const reports = useStore((s) => s.fieldReports)
  const scenario = useStore((s) => s.scenario)
  const toast = useStore((s) => s.toast)
  const [done, setDone] = useState<Set<string>>(new Set())
  const fail = (e: unknown) => toast(String(e), 'error')
  const list = useMemo(() => {
    const name = (id: string) => shortName(scenario?.camps.find((c) => c.id === id)?.name ?? id)
    const out: Suggestion[] = []
    for (const o of Object.values(orders).filter((x) => x.status === 'awaiting_approval')) {
      out.push({
        key: `o${o.id}`,
        text: `Approve ${fmtKg(o.weight_kg)} for ${name(o.camp_id)} (Truck ${o.truck_id})`,
        why: o.approval_reasons.join(' and ') || 'needs approval',
        from: 'Dispatcher',
        tone: o.priority === 'critical' ? 'red' : 'amber',
        actions: [
          { label: 'Approve', primary: true, run: () => api.decide(o.id, 'approve').then(() => toast(`Approved: Truck ${o.truck_id} released`, 'ok'), fail) },
          { label: 'Review', run: () => navigate('/officer/approvals') },
        ],
      })
    }
    for (const r of Object.values(reports).filter((x) => x.status === 'pending_confirmation' || x.status === 'unparsed')) {
      out.push({ key: `r${r.id}`, text: `Check ${name(r.camp_id)}'s field report`, why: r.reasons[0] ?? 'the AI reading needs a person', from: 'Field Intake', tone: 'amber', actions: [{ label: 'Review', primary: true, run: () => navigate('/officer/field-reports') }] })
    }
    for (const h of hazards.filter((x) => x.kind === 'driver_report' && !x.verified)) {
      out.push({
        key: `h${h.id}`,
        text: `Verify the road report: ${h.label}`,
        why: 'one driver reported it; the road stays open until confirmed',
        from: 'Monitor',
        tone: 'amber',
        actions: [{ label: 'Confirm closure', primary: true, run: () => api.confirmHazard(h.id).then(() => toast('Road closed; trucks re-routed', 'warn'), fail) }],
      })
    }
    for (const c of Object.values(camps).filter((x) => x.cut_off)) {
      out.push({
        key: `cut${c.id}`,
        text: `${name(c.id)} is cut off: arrange a boat or air drop`,
        why: `no safe road from any warehouse; water for ${c.water_days.toFixed(1)} days`,
        from: 'Inventory',
        tone: 'red',
        actions: [{ label: 'Alert the camp', primary: true, run: () => onAlert({ camps: [c.id], message: 'Your camp is cut off by road. A boat or air drop is being arranged. Ration drinking water.' }) }],
      })
    }
    if (Object.values(trucks).some((t) => t.status === 'holding')) {
      out.push({ key: 'hold', text: 'A truck is holding with no safe road: re-plan now', why: 'the Coordinator can reassign its load to a reachable camp', from: 'Routing', tone: 'amber', actions: [{ label: 'Re-plan now', primary: true, run: () => api.replan().then(() => toast('Re-planning now', 'info'), fail) }] })
    }
    for (const d of weather?.districts.filter((x) => x.heavy) ?? []) {
      const ids = (scenario?.camps ?? []).filter((c) => c.district === d.district).map((c) => c.id)
      if (!ids.length) continue
      out.push({
        key: `rain${d.district}`,
        text: `Heavy rain forecast for ${d.district} (${fmtNum(d.rain_24h_mm)} mm): warn the camp`,
        why: `above the ${weather!.threshold_mm} mm/24 h heavy-rain line`,
        from: 'Monitor',
        tone: 'blue',
        actions: [{ label: 'Send alert', primary: true, run: () => onAlert({ camps: ids, message: 'Heavy rain expected in the next 24 hours. Move stock off the ground and keep drinking water covered.' }) }],
      })
    }
    return out
  }, [orders, reports, hazards, camps, trucks, weather, scenario, toast, onAlert]) // eslint-disable-line react-hooks/exhaustive-deps
  const shown = list.filter((s) => !done.has(s.key))
  return (
    <section data-testid="suggestions">
      <Heading icon={Lightbulb} aside="from live state">
        Suggested actions
      </Heading>
      {shown.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
          <CheckCircle2 className="size-4" aria-hidden /> Nothing needs you right now. The agents are handling it.
        </div>
      ) : (
        <ul className="space-y-2">
          {shown.map((s) => (
            <li key={s.key} className={cn('rounded-lg border-l-[3px] border-y border-r border-slate-200 bg-white p-2.5', s.tone === 'red' ? 'border-l-red-500' : s.tone === 'amber' ? 'border-l-amber-500' : 'border-l-brand-500')} data-testid="suggestion">
              <div className="text-sm leading-snug font-medium text-slate-900">{s.text}</div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {s.from} · {s.why}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {s.actions.map((a) => (
                  <Button
                    key={a.label}
                    size="sm"
                    variant={a.primary ? 'default' : 'outline'}
                    className="h-7 text-xs"
                    onClick={() => {
                      a.run()
                      if (a.primary && !a.label.startsWith('Alert') && a.label !== 'Send alert' && a.label !== 'Review') setDone(new Set([...done, s.key]))
                    }}
                  >
                    {a.label === 'Re-plan now' && <RefreshCw />}
                    {a.label === 'Confirm closure' && <Construction />}
                    {a.label}
                  </Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
