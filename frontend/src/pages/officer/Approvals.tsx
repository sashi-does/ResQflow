import { CircleCheckBig, Clock, ShieldAlert, Timer, Truck } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { api } from '../../api'
import { ActivityList } from '../../components/app/ActivityList'
import { Empty, PageGrid, Section, StatCard, StatGrid } from '../../components/app/blocks'
import { Pill } from '../../components/app/status'
import { fmtDuration, fmtItems, fmtKg } from '../../lib/format'
import { useNames } from '../../lib/names'
import { awaitingApproval, useStore } from '../../store'
import type { LogEntry, Order } from '../../types'

function ApprovalCard({ o }: { o: Order }) {
  const toast = useStore((s) => s.toast)
  const simSeconds = useStore((s) => s.sim?.sim_seconds ?? 0)
  const names = useNames()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const autoIn = o.auto_approve_at_sim != null ? Math.max(0, o.auto_approve_at_sim - simSeconds) / 60 : null
  const decide = (d: 'approve' | 'reject') => {
    setBusy(true)
    api
      .decide(o.id, d, note || undefined)
      .then((res) => {
        if (d === 'approve' && res.status === 'dispatched') toast(`Approved. ${names.truck(o.truck_id)} is on its way.`, 'ok')
        else if (d === 'approve') toast('This order could not go: the situation changed. See AI Agents.', 'error')
        else toast(`Rejected. ${names.truck(o.truck_id)} released.`, 'warn')
      })
      .catch((e: unknown) => toast(String(e), 'error'))
      .finally(() => setBusy(false))
  }
  return (
    <Card className="gap-3 py-4" data-testid="approval-card">
      <CardContent className="space-y-3 px-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-slate-900">
            {names.warehouse(o.warehouse_id)} → {names.camp(o.camp_id)}
          </span>
          {o.priority === 'critical' && <Pill tone="red">Critical</Pill>}
          {o.uses_reserve && (
            <Pill tone="amber" icon={ShieldAlert}>
              Uses safety reserve
            </Pill>
          )}
          <span className="ml-auto text-lg font-semibold text-slate-900 tnum">{fmtKg(o.weight_kg)}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
          <span className="flex items-center gap-1">
            <Truck className="size-4" aria-hidden /> {names.truck(o.truck_id)}
          </span>
          <span>Road time {fmtDuration(o.eta_min ?? 0)}</span>
          <span>{fmtItems(o.items)}</span>
        </div>
        {o.reason && (
          <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">AI’s reason: </span>
            {o.reason}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {o.approval_reasons.map((r) => (
            <Badge key={r} variant="outline">
              Needs sign-off: {r}
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-sm" data-testid="approval-countdown">
          <Timer className="size-4 text-slate-500" aria-hidden />
          {autoIn != null ? (
            <span className="text-brand-700">Auto-approves in {fmtDuration(autoIn)} under your policy unless you decide first.</span>
          ) : (
            <span className="text-amber-700">Waiting for you: the policy never auto-approves this one.</span>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input placeholder="Note (optional), e.g. send by boat instead" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Decision note" />
          <div className="flex gap-2">
            <Button className="flex-1" disabled={busy} onClick={() => decide('approve')} data-testid="approve">
              Approve
            </Button>
            <Button variant="outline" className="flex-1 text-red-700" disabled={busy} onClick={() => decide('reject')} data-testid="reject">
              Reject
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function PolicyCard() {
  const policy = useStore((s) => s.policy)
  const toast = useStore((s) => s.toast)
  if (!policy) return null
  const save = (patch: Partial<typeof policy>) =>
    api
      .setPolicy({ ...policy, ...patch })
      .then(() => toast('Approval policy updated', 'ok'))
      .catch((e: unknown) => toast(String(e), 'error'))
  return (
    <Section title="Approval policy" description="What happens if nobody decides in time" testId="policy-panel">
      <div className="space-y-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="auto">Auto-approve CRITICAL orders if nobody acts</Label>
          <Switch id="auto" checked={policy.auto_approve_critical} onCheckedChange={(v) => save({ auto_approve_critical: v })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="maxt">Up to (tonnes)</Label>
            <Input id="maxt" type="number" min={0} max={20} step={0.5} defaultValue={policy.max_tonnes} onBlur={(e) => save({ max_tonnes: Number(e.target.value) })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="delay">After (minutes)</Label>
            <Input id="delay" type="number" min={0} max={240} defaultValue={policy.delay_min} onBlur={(e) => save({ delay_min: Number(e.target.value) })} />
          </div>
        </div>
        <p className="text-muted-foreground">Orders over 6 t need sign-off. Orders that use a warehouse’s safety reserve always need a person.</p>
      </div>
    </Section>
  )
}

export function OfficerApprovals() {
  const orders = useStore((s) => s.orders)
  const simSeconds = useStore((s) => s.sim?.sim_seconds ?? 0)
  const list = awaitingApproval(orders)
  const reserve = list.filter((o) => o.uses_reserve).length
  const soon = list.filter((o) => o.auto_approve_at_sim != null && o.auto_approve_at_sim - simSeconds <= 600).length
  const decided = useCallback((e: LogEntry) => e.kind === 'order.approved' || e.kind === 'order.rejected', [])
  const approvedCount = useStore((s) => s.log.filter((e) => e.kind === 'order.approved').length)
  return (
    <PageGrid>
      <StatGrid>
        <StatCard label="Waiting for you" value={list.length} icon={Clock} tone={list.length ? 'amber' : 'green'} testId="stat-waiting" />
        <StatCard label="Use the safety reserve" value={reserve} sub="always need a person" icon={ShieldAlert} tone={reserve ? 'red' : 'green'} />
        <StatCard label="Auto-approve within 10 min" value={soon} sub="under your policy" icon={Timer} tone="blue" />
        <StatCard label="Approved so far" value={approvedCount} sub="by people or the policy" icon={CircleCheckBig} tone="green" />
      </StatGrid>
      <div className="space-y-4 lg:col-span-8">
        {list.length === 0 ? (
          <Card>
            <CardContent>
              <Empty icon={CircleCheckBig} title="No orders waiting">
                Orders over 6 t, or that draw on a warehouse’s safety reserve, appear here before any truck leaves.
              </Empty>
            </CardContent>
          </Card>
        ) : (
          list.map((o) => <ApprovalCard key={o.id} o={o} />)
        )}
      </div>
      <div className="space-y-6 lg:col-span-4">
        <PolicyCard />
        <Section title="Recent decisions" description="Who approved what">
          <ActivityList match={decided} limit={8} empty="No decisions yet." />
        </Section>
      </div>
    </PageGrid>
  )
}
