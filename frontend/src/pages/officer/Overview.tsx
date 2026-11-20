import { AlertTriangle, ArrowRight, CircleCheckBig, MapPinOff, MessageSquareText, RouteOff, TentTree, Truck, Users } from 'lucide-react'
import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { ActivityList } from '../../components/app/ActivityList'
import { Empty, PageGrid, Section, StatCard, StatGrid } from '../../components/app/blocks'
import { OpsMap } from '../../components/app/OpsMap'
import { CampStatus, Pill } from '../../components/app/status'
import { fmtKg, fmtNum } from '../../lib/format'
import { useNames } from '../../lib/names'
import { navigate } from '../../router'
import { awaitingApproval, useStore } from '../../store'
import type { LogEntry } from '../../types'

export function OfficerOverview() {
  const camps = useStore((s) => s.camps)
  const trucks = useStore((s) => s.trucks)
  const blocked = useStore((s) => s.blocked)
  const orders = useStore((s) => s.orders)
  const reports = useStore((s) => s.fieldReports)
  const hazards = useStore((s) => s.hazards)
  const scenario = useStore((s) => s.scenario)
  const names = useNames()
  const cs = Object.values(camps)
  const critical = cs.filter((c) => c.cut_off || c.status === 'critical')
  const atRisk = cs.filter((c) => c.cut_off || c.status !== 'ok')
  const pop = (id: string) => camps[id]?.population ?? scenario?.camps.find((c) => c.id === id)?.population ?? 0
  const onRoad = Object.values(trucks).filter((t) => ['en_route', 'returning', 'holding', 'unloading'].includes(t.status))
  const approvals = awaitingApproval(orders)
  const pendingReports = Object.values(reports).filter((r) => r.status === 'pending_confirmation' || r.status === 'unparsed')
  const unverified = hazards.filter((h) => h.verified === false)
  const cutOff = cs.filter((c) => c.cut_off)
  const aiOnly = useCallback((e: LogEntry) => e.agent !== 'human' && e.agent !== 'system', [])
  const attention = approvals.length + pendingReports.length + unverified.length + cutOff.length

  return (
    <PageGrid>
      <StatGrid>
        <StatCard label="Camps critical" value={critical.length} sub={`of ${cs.length} camps · incl. cut off`} icon={TentTree} tone={critical.length ? 'red' : 'green'} testId="stat-critical" />
        <StatCard label="People at risk" value={fmtNum(atRisk.reduce((a, c) => a + pop(c.id), 0))} sub="in camps with under 1 day of cover" icon={Users} tone={atRisk.length ? 'amber' : 'green'} />
        <StatCard label="Trucks on the road" value={onRoad.length} sub={`of ${Object.keys(trucks).length} trucks`} icon={Truck} tone="blue" />
        <StatCard label="Roads closed" value={blocked.length} sub="road segments under water" icon={RouteOff} tone={blocked.length ? 'red' : 'green'} />
      </StatGrid>

      <Section
        title="Needs your attention"
        description={attention ? `${attention} item${attention > 1 ? 's' : ''} waiting for a person` : 'Nothing is waiting for you.'}
        className="lg:col-span-5"
        testId="attention-overview"
      >
        {attention === 0 ? (
          <Empty icon={CircleCheckBig} title="All clear">
            Large orders, field reports that need confirming and cut-off camps will appear here.
          </Empty>
        ) : (
          <ul className="divide-y">
            {approvals.map((o) => (
              <li key={o.id} className="flex items-center gap-3 py-2.5">
                <CircleCheckBig className="size-4 shrink-0 text-amber-600" aria-hidden />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-medium text-slate-900">
                    Approve {fmtKg(o.weight_kg)} to {names.camp(o.camp_id)}
                  </div>
                  <div className="text-xs text-slate-500">
                    {names.truck(o.truck_id)} from {names.warehouse(o.warehouse_id)} · {o.approval_reasons.join(', ')}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate('/officer/approvals')}>
                  Review
                </Button>
              </li>
            ))}
            {pendingReports.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5">
                <MessageSquareText className="size-4 shrink-0 text-brand-600" aria-hidden />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-medium text-slate-900">Field report from {names.camp(r.camp_id)}</div>
                  <div className="truncate text-xs text-slate-500">{r.changes.join(', ') || r.reasons.join(', ')}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate('/officer/field-reports')}>
                  Confirm
                </Button>
              </li>
            ))}
            {unverified.map((h) => (
              <li key={h.id} className="flex items-center gap-3 py-2.5">
                <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-medium text-slate-900">{h.label}</div>
                  <div className="text-xs text-slate-500">Unverified driver report</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate('/officer/field-reports')}>
                  Verify
                </Button>
              </li>
            ))}
            {cutOff.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                <MapPinOff className="size-4 shrink-0 text-slate-500" aria-hidden />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-medium text-slate-900">{names.camp(c.id)} is cut off</div>
                  <div className="text-xs text-slate-500">{c.unserved_reason ?? 'No safe road to this camp.'}</div>
                </div>
                <CampStatus level="cut_off" />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="lg:col-span-7">
        <OpsMap className="h-[380px]" compact />
        <div className="mt-2 flex justify-end">
          <Button variant="link" size="sm" onClick={() => navigate('/officer/operations')}>
            Open Live Operations <ArrowRight />
          </Button>
        </div>
      </div>

      <Section
        title="Camps"
        description="Sorted by days of cover"
        className="lg:col-span-5"
      >
        <ul className="divide-y">
          {[...cs]
            .sort((a, b) => a.days_of_cover - b.days_of_cover)
            .slice(0, 6)
            .map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{names.camp(c.id)}</span>
                <span className="text-slate-500 tnum">{c.water_days.toFixed(1)} d water</span>
                <CampStatus level={c.cut_off ? 'cut_off' : c.status} />
              </li>
            ))}
        </ul>
      </Section>

      <Section
        title="Latest AI decisions"
        description="The 5 most recent agent actions, in plain English"
        action={
          <Button variant="link" size="sm" onClick={() => navigate('/officer/agents')}>
            All decisions <ArrowRight />
          </Button>
        }
        className="lg:col-span-7"
      >
        <ActivityList match={aiOnly} limit={5} empty="No AI decisions yet. Start the scenario from Simulation." testId="latest-decisions" />
        <div className="mt-3 flex gap-2">
          <Pill tone="blue">AI proposes</Pill>
          <Pill tone="slate">code checks</Pill>
          <Pill tone="green">people approve</Pill>
        </div>
      </Section>
    </PageGrid>
  )
}
