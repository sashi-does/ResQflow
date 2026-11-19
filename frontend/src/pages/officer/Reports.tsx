import { Clock, Droplets, FileDown, FileText, Loader2, Truck, Utensils } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { api } from '../../api'
import { Empty, PageGrid, RowsSkeleton, Section, StatCard, StatGrid } from '../../components/app/blocks'
import { AGENT_LABEL, fmtNum } from '../../lib/format'
import { fmtKpi } from '../../lib/kpiFormat'
import { useStore } from '../../store'
import type { KPIs } from '../../types'

const ROWS: { key: keyof KPIs; label: string; lower: boolean }[] = [
  { key: 'people_hours_without_water', label: 'People-hours without water', lower: true },
  { key: 'people_hours_without_food', label: 'People-hours without food', lower: true },
  { key: 'deliveries_on_time_pct', label: 'On-time deliveries', lower: false },
  { key: 'deliveries_total', label: 'Deliveries', lower: false },
  { key: 'truck_hours_stuck', label: 'Truck-hours stuck at floods', lower: true },
  { key: 'avg_delivery_min', label: 'Average delivery time', lower: true },
  { key: 'supplies_delivered_kg', label: 'Supplies delivered', lower: false },
]

function delta(a: number, b: number, lower: boolean): { text: string; good: boolean | null } {
  if (!b) return { text: a ? 'new' : '—', good: null }
  const pct = (100 * (a - b)) / b
  if (Math.abs(pct) < 0.5) return { text: '±0%', good: null }
  return { text: `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`, good: lower ? pct < 0 : pct > 0 }
}

function AfterAction() {
  const report = useStore((s) => s.report)
  if (!report) return null
  return (
    <article className="print-report space-y-6 text-sm text-slate-800" data-testid="report">
      <header>
        <div className="text-xs font-semibold tracking-wider text-slate-500 uppercase">RahatNet · After-action report</div>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">{report.title}</h2>
        <div className="text-slate-500">Written at sim time {report.generated_at_sim}</div>
      </header>
      <section>
        <h3 className="font-semibold text-slate-900">Summary</h3>
        <p className="mt-1 leading-relaxed" data-testid="report-summary">
          {report.narrative.summary}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {report.narrative_source === 'llm' ? `Narrative by ${report.narrative_model}; ` : ''}
          {report.narrative_note || 'every number is filled in by code from the simulation, not written by the AI.'}
        </p>
      </section>
      <section>
        <h3 className="font-semibold text-slate-900">Agentic vs Static</h3>
        <Table data-testid="report-kpis">
          <TableHeader>
            <TableRow>
              <TableHead>Measure</TableHead>
              <TableHead className="text-right">RahatNet</TableHead>
              <TableHead className="text-right">Static plan</TableHead>
              <TableHead className="text-right">Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.kpi_rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell>{r.label}</TableCell>
                <TableCell className="text-right font-semibold tnum" data-testid={`report-${r.key}`}>
                  {fmtKpi(r.key, r.agentic)}
                </TableCell>
                <TableCell className="text-right tnum">{fmtKpi(r.key, r.static)}</TableCell>
                <TableCell className={cn('text-right tnum', r.better === true ? 'text-emerald-700' : r.better === false ? 'text-red-700' : '')}>
                  {r.delta_pct == null ? '—' : `${r.delta_pct > 0 ? '+' : ''}${r.delta_pct.toFixed(0)}%`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h3 className="font-semibold text-slate-900">Cut off and escalated</h3>
          {report.cut_off.length === 0 && report.escalations.length === 0 && <p className="mt-1 text-slate-500">Nothing escalated.</p>}
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {report.cut_off.map((c) => (
              <li key={c.camp}>
                <b>{c.camp}</b> ({fmtNum(c.population)} people): {c.reason}
                {c.since ? `, since ${c.since}` : ''}
              </li>
            ))}
            {report.escalations
              .filter((e) => !e.what.endsWith('cut off'))
              .map((e, i) => (
                <li key={i}>
                  {e.what}: <i>{e.status.replace('_', ' ')}</i>
                  {e.why ? ` (${e.why})` : ''}
                </li>
              ))}
          </ul>
        </section>
        <section>
          <h3 className="font-semibold text-slate-900">Recommendations</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            {report.narrative.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
        </section>
      </div>
      <section>
        <h3 className="font-semibold text-slate-900">Timeline of key decisions</h3>
        <ol className="mt-1 space-y-1 text-xs">
          {report.timeline.map((e, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-16 shrink-0 text-slate-500 tnum">{e.sim_time}</span>
              <span className="w-24 shrink-0 font-semibold">{e.agent === 'human' ? 'Person' : AGENT_LABEL[e.agent]}</span>
              <span>{e.summary}</span>
            </li>
          ))}
        </ol>
      </section>
    </article>
  )
}

export function OfficerReports() {
  const kpis = useStore((s) => s.kpis)
  const report = useStore((s) => s.report)
  const setReport = useStore((s) => s.setReport)
  const sim = useStore((s) => s.sim)
  const toast = useStore((s) => s.toast)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!report) api.latestReport().then((r) => r && setReport(r, false), () => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const write = () => {
    setBusy(true)
    api
      .report()
      .then((r) => {
        setReport(r, false)
        toast('After-action report written. The simulation is paused.', 'ok')
      })
      .catch((e: unknown) => toast(String(e), 'error'))
      .finally(() => setBusy(false))
  }
  const a = kpis?.agentic
  const b = kpis?.baseline
  const early = !a || (a.deliveries_total < 3 && (sim?.sim_seconds ?? 0) < 6 * 3600)
  const d = (k: keyof KPIs, lower: boolean) => (a && b ? delta(a[k], b[k], lower).text : '—')
  return (
    <PageGrid>
      <StatGrid>
        <StatCard label="People-hours without water" value={a ? fmtKpi('people_hours_without_water', a.people_hours_without_water) : '—'} sub={`Static plan ${b ? fmtKpi('people_hours_without_water', b.people_hours_without_water) : '—'} · ${d('people_hours_without_water', true)}`} icon={Droplets} tone="blue" testId="kpi-people_hours_without_water" />
        <StatCard label="People-hours without food" value={a ? fmtKpi('people_hours_without_food', a.people_hours_without_food) : '—'} sub={`Static plan ${b ? fmtKpi('people_hours_without_food', b.people_hours_without_food) : '—'} · ${d('people_hours_without_food', true)}`} icon={Utensils} tone="blue" />
        <StatCard label="Truck-hours stuck at floods" value={a ? fmtKpi('truck_hours_stuck', a.truck_hours_stuck) : '—'} sub={`Static plan ${b ? fmtKpi('truck_hours_stuck', b.truck_hours_stuck) : '—'}`} icon={Truck} tone="blue" />
        <StatCard label="Simulated time" value={sim?.sim_time ?? '—'} sub={sim?.ended ? 'scenario finished' : 'so far'} icon={Clock} tone="blue" />
      </StatGrid>
      <Section
        title="Agentic vs Static"
        description="Same floods and trucks. The static plan is fixed at 06:00 and never re-routes; its trucks wait at flooded roads."
        className="lg:col-span-12"
      >
        {!kpis ? (
          <RowsSkeleton rows={4} />
        ) : (
          <>
            {early && <p className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">Collecting data: comparisons become meaningful after a few deliveries.</p>}
            <Table data-testid="kpi-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Measure</TableHead>
                  <TableHead className="text-right">RahatNet</TableHead>
                  <TableHead className="text-right">Static plan</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ROWS.map((r) => {
                  const dd = delta(kpis.agentic[r.key], kpis.baseline[r.key], r.lower)
                  return (
                    <TableRow key={r.key}>
                      <TableCell>{r.label}</TableCell>
                      <TableCell className="text-right font-semibold tnum" data-testid={`kpi-cell-${r.key}`}>{fmtKpi(r.key, kpis.agentic[r.key])}</TableCell>
                      <TableCell className="text-right tnum">{fmtKpi(r.key, kpis.baseline[r.key])}</TableCell>
                      <TableCell className={cn('text-right tnum', early ? 'text-slate-400' : dd.good === true ? 'text-emerald-700' : dd.good === false ? 'text-red-700' : '')}>
                        {early ? '…' : dd.text}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </>
        )}
      </Section>
      <Section
        title="After-action report"
        description="Numbers come from code. The AI (when there is an API key) writes only the prose around them."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={write} disabled={busy} data-testid="write-report">
              {busy ? <Loader2 className="animate-spin" /> : <FileText />} {report ? 'Rewrite' : 'End & write report'}
            </Button>
            {report && (
              <Button onClick={() => window.print()} data-testid="download-pdf">
                <FileDown /> Download PDF
              </Button>
            )}
          </div>
        }
        className="lg:col-span-12"
      >
        {report ? (
          <AfterAction />
        ) : (
          <Empty icon={FileText} title="No report yet">
            It is written automatically when the 24-hour scenario ends, or now with “End & write report” (this pauses the simulation).
          </Empty>
        )}
      </Section>
    </PageGrid>
  )
}
