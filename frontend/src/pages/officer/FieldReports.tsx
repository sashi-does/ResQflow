import { Bot, CircleCheck, MessageSquareText, RouteOff, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '../../api'
import { Empty, PageGrid, StatCard, StatGrid } from '../../components/app/blocks'
import { Pill } from '../../components/app/status'
import { useNames } from '../../lib/names'
import { useStore } from '../../store'
import type { FieldReport } from '../../types'

const STATUS: Record<FieldReport['status'], { tone: 'amber' | 'green' | 'red' | 'slate' | 'blue'; word: string }> = {
  processing: { tone: 'blue', word: 'AI is reading' },
  applied: { tone: 'green', word: 'Applied automatically' },
  pending_confirmation: { tone: 'amber', word: 'Needs your confirmation' },
  unparsed: { tone: 'amber', word: 'Needs a person to read' },
  rejected: { tone: 'slate', word: 'Rejected' },
  confirmed: { tone: 'green', word: 'Confirmed' },
}

export function ReportUnderstanding({ r }: { r: FieldReport }) {
  if (!r.parsed) {
    return <p className="text-sm text-slate-500">{r.status === 'processing' ? 'Reading…' : 'The AI could not read this one. A person needs to.'}</p>
  }
  const p = r.parsed
  return (
    <div className="space-y-1.5 text-sm" data-testid="ai-understood">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Bot className="size-3.5 text-blue-600" aria-hidden />
        <span>
          {r.source === 'recorded' ? 'Recorded AI reading (offline demo)' : r.model ? `Read by ${r.model}` : 'AI reading'} · {Math.round(p.confidence * 100)}% sure
        </span>
      </div>
      {r.changes.length > 0 && (
        <div>
          <span className="font-medium text-slate-900">Changes: </span>
          {r.changes.join(', ')}
        </div>
      )}
      {p.urgent_needs.length > 0 && (
        <div>
          <span className="font-medium text-slate-900">Urgent needs: </span>
          {p.urgent_needs.join(', ')}
        </div>
      )}
      {p.health_flags.length > 0 && (
        <div>
          <span className="font-medium text-red-700">Health: </span>
          {p.health_flags.join(', ')}
        </div>
      )}
    </div>
  )
}

function ReportRow({ r }: { r: FieldReport }) {
  const toast = useStore((s) => s.toast)
  const names = useNames()
  const st = STATUS[r.status]
  const fail = (e: unknown) => toast(String(e), 'error')
  const open = r.status === 'pending_confirmation' || r.status === 'unparsed'
  return (
    <Card className="gap-0 py-0" data-testid="field-report-row">
      <CardContent className="grid gap-4 p-4 md:grid-cols-2">
        <div>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{names.camp(r.camp_id, false)}</span>
            <span className="text-xs text-slate-500 tnum">{r.sim_time}</span>
          </div>
          <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">As written</div>
          <blockquote className="mt-1 border-l-2 border-slate-200 pl-3 text-sm text-slate-800">{r.text}</blockquote>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">What the AI understood</div>
            <Pill tone={st.tone} className="ml-auto" testId="report-status">
              {st.word}
            </Pill>
          </div>
          <ReportUnderstanding r={r} />
          {r.reasons.length > 0 && (
            <p className="flex items-start gap-1.5 text-sm text-amber-800">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {r.reasons.join(' · ')}
            </p>
          )}
          {open && (
            <div className="mt-auto flex gap-2 pt-1">
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => api.decideReport(r.id, 'confirm').then(() => toast('Report confirmed and applied', 'ok'), fail)} data-testid="confirm-report">
                Confirm & apply
              </Button>
              <Button variant="outline" onClick={() => api.decideReport(r.id, 'reject').then(() => toast('Report rejected', 'warn'), fail)}>
                Reject
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function OfficerFieldReports() {
  const reports = useStore((s) => s.fieldReports)
  const hazards = useStore((s) => s.hazards)
  const toast = useStore((s) => s.toast)
  const all = Object.values(reports).sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }))
  const pending = all.filter((r) => r.status === 'pending_confirmation' || r.status === 'unparsed')
  const roadReports = hazards.filter((h) => h.source === 'driver' || h.kind === 'driver_report')
  const unverified = roadReports.filter((h) => !h.verified)
  const fail = (e: unknown) => toast(String(e), 'error')
  return (
    <PageGrid>
      <StatGrid>
        <StatCard label="Waiting for confirmation" value={pending.length} icon={MessageSquareText} tone={pending.length ? 'amber' : 'green'} />
        <StatCard label="Applied automatically" value={all.filter((r) => r.status === 'applied').length} sub="small, confident changes" icon={CircleCheck} tone="green" />
        <StatCard label="Unverified road reports" value={unverified.length} sub="from drivers" icon={RouteOff} tone={unverified.length ? 'amber' : 'green'} />
        <StatCard label="Reports today" value={all.length + roadReports.length} icon={Bot} tone="blue" />
      </StatGrid>
      <div className="lg:col-span-12">
        <Tabs defaultValue="camps">
          <TabsList>
            <TabsTrigger value="camps" data-testid="tab-camp-reports">
              Camp reports {pending.length > 0 && <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-xs text-amber-800">{pending.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="roads" data-testid="tab-road-reports">
              Driver road reports {unverified.length > 0 && <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-xs text-amber-800">{unverified.length}</span>}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="camps" className="mt-4 space-y-4">
            {all.length === 0 ? (
              <Card>
                <CardContent>
                  <Empty icon={MessageSquareText} title="No field reports yet">
                    Camp coordinators send reports from their phones, in Assamese or English.
                  </Empty>
                </CardContent>
              </Card>
            ) : (
              [...pending, ...all.filter((r) => !pending.includes(r))].map((r) => <ReportRow key={r.id} r={r} />)
            )}
          </TabsContent>
          <TabsContent value="roads" className="mt-4 space-y-4">
            {roadReports.length === 0 ? (
              <Card>
                <CardContent>
                  <Empty icon={RouteOff} title="No road reports">
                    When a driver reports a problem, it waits here until you confirm it or a second driver reports it.
                  </Empty>
                </CardContent>
              </Card>
            ) : (
              roadReports.map((h) => (
                <Card key={h.id} className="py-4" data-testid="road-report-row">
                  <CardContent className="flex flex-wrap items-center gap-3 px-4">
                    <TriangleAlert className={h.verified ? 'size-5 text-red-600' : 'size-5 text-amber-600'} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900">{h.label}</div>
                      <div className="text-sm text-slate-500">
                        Reported by {(h.reported_by ?? []).map((t) => `Truck ${t}`).join(', ')} ·{' '}
                        {h.verified ? 'confirmed: road closed, trucks re-routed' : 'unverified: the road stays open until confirmed'}
                      </div>
                    </div>
                    {h.verified ? (
                      <Pill tone="red">Road closed</Pill>
                    ) : (
                      <div className="flex gap-2">
                        <Button className="bg-red-600 hover:bg-red-700" onClick={() => api.confirmHazard(h.id).then(() => toast('Road closed. Trucks re-routed.', 'warn'), fail)} data-testid="confirm-road">
                          Confirm closure
                        </Button>
                        <Button variant="outline" onClick={() => api.removeHazard(h.id).then(() => toast('Report dismissed', 'info'), fail)}>
                          Dismiss
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PageGrid>
  )
}
