import { Database, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '../../api'
import { buildCycles, isTeamwork } from '../../lib/cycles'
import { fmtKpi } from '../../lib/kpiFormat'
import type { HistoryRun, HistoryRuns, LogEntry } from '../../types'
import { Empty, RowsSkeleton } from './blocks'
import { CoordinationTimeline } from './CoordinationTimeline'
import { DetailSheet, type Detail } from './DetailSheet'

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function RunSheet({ run, onClose }: { run: HistoryRun | null; onClose: () => void }) {
  const [log, setLog] = useState<LogEntry[] | null>(null)
  const [detail, setDetail] = useState<Detail>(null)
  useEffect(() => {
    if (!run) return
    let live = true
    api.historyLog(run.id).then((l) => live && setLog(l), () => live && setLog([]))
    return () => {
      live = false
      setLog(null)
    }
  }, [run])
  const cycles = useMemo(() => (log ? buildCycles(log).filter(isTeamwork) : []), [log])
  return (
    <Sheet open={!!run} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl" data-testid="run-sheet">
        <SheetHeader className="sticky top-0 z-10 border-b bg-white px-5 py-4">
          <SheetTitle>{run?.case_title}</SheetTitle>
          <SheetDescription>
            {run && `${when(run.started_at)} · ${run.llm_model ?? 'heuristic'} · ran to ${run.last_sim_time ?? '—'} · ${run.entries} log entries · ${run.ai_calls} AI conversations`}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-5 py-4">
          {run?.agentic_kpis && run.baseline_kpis && (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              {(['people_hours_without_water', 'people_hours_without_food', 'truck_hours_stuck', 'supplies_delivered_kg'] as const).map((k) => (
                <div key={k} className="rounded-lg border border-slate-200 p-2">
                  <dt className="text-xs text-slate-500">{k.replaceAll('_', ' ').replace('kg', '')}</dt>
                  <dd className="font-semibold tnum">
                    {fmtKpi(k, run.agentic_kpis![k])} <span className="font-normal text-slate-500">vs {fmtKpi(k, run.baseline_kpis![k])} static</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Coordination cycles (saved)</h3>
          {log == null ? <RowsSkeleton rows={4} /> : <CoordinationTimeline cycles={cycles} onOpen={(id) => setDetail({ kind: 'cycle', id })} />}
        </div>
        <DetailSheet detail={detail} onChange={setDetail} log={log ?? []} />
      </SheetContent>
    </Sheet>
  )
}

/** Runs saved in the history database (Postgres): one row per demo run, any case, any day. */
export function SavedRuns() {
  const [data, setData] = useState<HistoryRuns | null>(null)
  const [open, setOpen] = useState<HistoryRun | null>(null)
  const load = useCallback(() => {
    api.historyRuns().then(setData, () => setData({ enabled: false, status: 'error', runs: [] }))
  }, [])
  useEffect(() => {
    load()
  }, [load])
  if (!data) return <RowsSkeleton rows={3} />
  if (!data.enabled) {
    return (
      <Empty icon={Database} title="History is off">
        Set DATABASE_URL (Postgres) to keep every run, decision, coordination cycle and AI conversation across restarts.
      </Empty>
    )
  }
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
        <span className={data.status === 'connected' ? 'text-emerald-700' : 'text-red-700'}>● {data.status === 'connected' ? 'Connected to Postgres' : `Database error: ${data.error ?? ''}`}</span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={load}>
          <RefreshCw /> Refresh
        </Button>
      </div>
      {data.runs.length === 0 ? (
        <Empty title="No saved runs yet">Run a case from Simulation; it is saved as it plays.</Empty>
      ) : (
        <Table data-testid="saved-runs">
          <TableHeader>
            <TableRow>
              <TableHead>Started</TableHead>
              <TableHead>Case</TableHead>
              <TableHead className="hidden md:table-cell">Planner</TableHead>
              <TableHead>Ran to</TableHead>
              <TableHead className="text-right">Water (RahatNet vs static)</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Cycles · AI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.runs.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpen(r)} data-testid="saved-run">
                <TableCell className="tnum">{when(r.started_at)}</TableCell>
                <TableCell>
                  {r.case_title}
                  {r.id === data.current_run && <span className="ml-1.5 rounded bg-brand-50 px-1 text-[10px] font-semibold text-brand-800">this run</span>}
                </TableCell>
                <TableCell className="hidden text-slate-600 md:table-cell">{r.llm_model ?? '—'}</TableCell>
                <TableCell className="tnum">{r.last_sim_time ?? '—'}</TableCell>
                <TableCell className="text-right tnum">
                  {r.agentic_kpis && r.baseline_kpis
                    ? `${fmtKpi('people_hours_without_water', r.agentic_kpis.people_hours_without_water)} vs ${fmtKpi('people_hours_without_water', r.baseline_kpis.people_hours_without_water)}`
                    : '—'}
                </TableCell>
                <TableCell className="hidden text-right tnum sm:table-cell">
                  {r.cycles} · {r.ai_calls}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <RunSheet run={open} onClose={() => setOpen(null)} />
    </div>
  )
}
