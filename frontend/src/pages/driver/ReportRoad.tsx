import { CloudRain, Construction, Mountain, Send, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { api } from '../../api'
import { useSession } from '../../auth'
import { Empty, PageGrid, Section, StatCard } from '../../components/app/blocks'
import { Pill } from '../../components/app/status'
import { shortName } from '../../lib/format'
import { useStore } from '../../store'

const KINDS: { id: 'waterlogged' | 'blocked' | 'landslide'; label: string; icon: LucideIcon }[] = [
  { id: 'waterlogged', label: 'Waterlogged', icon: CloudRain },
  { id: 'blocked', label: 'Blocked', icon: Construction },
  { id: 'landslide', label: 'Landslide', icon: Mountain },
]

export function DriverReportRoad() {
  const id = useSession()?.user.scope_id ?? ''
  const truck = useStore((s) => s.trucks[id])
  const hazards = useStore((s) => s.hazards)
  const toast = useStore((s) => s.toast)
  const ahead = (truck?.route_roads ?? []).slice(0, 4)
  const [edge, setEdge] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const chosen = edge ?? ahead[0]?.edge_id ?? null
  const mine = hazards.filter((h) => (h.reported_by ?? []).includes(id))
  const report = (kind: string) => {
    if (!chosen) return
    setBusy(true)
    api
      .roadReport(id, chosen, kind, note)
      .then((h) => {
        setNote('')
        toast(h.verified ? 'Road closed: a second report confirmed it' : 'Reported. The District Officer will verify it.', 'warn')
      })
      .catch((e: unknown) => toast(String(e), 'error'))
      .finally(() => setBusy(false))
  }
  return (
    <PageGrid>
      <div className="grid grid-cols-2 gap-4 lg:col-span-12 lg:grid-cols-4">
        <StatCard label="Your reports" value={mine.length} icon={Send} tone="blue" />
        <StatCard label="Confirmed closures" value={mine.filter((h) => h.verified).length} icon={TriangleAlert} tone="red" />
      </div>
      <Section title="Which road?" description="Roads on your route, nearest first." className="lg:col-span-6" testId="road-report">
        {ahead.length === 0 ? (
          <Empty icon={TriangleAlert} title="You’re not on a road right now" />
        ) : (
          <div className="space-y-2">
            {ahead.map((r) => (
              <button
                key={r.edge_id}
                onClick={() => setEdge(r.edge_id)}
                aria-pressed={chosen === r.edge_id}
                className={cn('flex w-full items-center gap-3 rounded-lg border p-3 text-left', chosen === r.edge_id ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'hover:bg-slate-50')}
                data-testid="road-choice"
              >
                <span className="font-semibold text-slate-900">{r.road.split(' (')[0]}</span>
                <span className="text-sm text-slate-500">
                  {shortName(r.from)} → {shortName(r.to)}
                </span>
              </button>
            ))}
          </div>
        )}
      </Section>
      <Section title="What’s wrong?" description="One tap sends it. One report doesn’t close a road; a second report or the District Officer does." className="lg:col-span-6">
        <div className="grid grid-cols-3 gap-2">
          {KINDS.map((k) => (
            <Button key={k.id} variant="outline" className="h-24 flex-col gap-2 text-base" disabled={!chosen || busy} onClick={() => report(k.id)} data-testid={`report-${k.id}`}>
              <k.icon className="size-7 text-amber-600" aria-hidden />
              {k.label}
            </Button>
          ))}
        </div>
        <div className="mt-4 grid gap-1.5">
          <Label htmlFor="note">Note (optional)</Label>
          <Input id="note" placeholder="e.g. water knee-deep near the bridge" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </Section>
      {mine.length > 0 && (
        <div className="space-y-3 lg:col-span-12">
          {mine.map((h) => (
            <Card key={h.id} className="py-3">
              <CardContent className="flex items-center gap-3 px-4 text-sm">
                <TriangleAlert className="size-4 text-amber-600" aria-hidden />
                <span className="flex-1 text-slate-900">{h.label}</span>
                {h.verified ? <Pill tone="red">Road closed</Pill> : <Pill tone="amber">Waiting for verification</Pill>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageGrid>
  )
}
