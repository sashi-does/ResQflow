import { ChevronRight, Workflow } from 'lucide-react'
import { Fragment, useMemo } from 'react'
import { AGENT_COLORS } from '../../lib/format'
import { AGENTS } from '../../lib/agents'
import { useStore } from '../../store'
import type { AgentName, LogEntry } from '../../types'
import { Empty } from './blocks'

const ORDER: AgentName[] = ['field_intake', 'monitor', 'inventory', 'routing', 'coordinator', 'validator', 'dispatcher', 'human']

interface Step {
  agent: AgentName
  count: number
  text: string
}

interface Cycle {
  key: number
  sim_time: string
  steps: Step[]
}

/** Group the decision log into coordination cycles: everything the agents did at the same sim time. */
function cycles(log: LogEntry[], max: number): Cycle[] {
  const out: Cycle[] = []
  const bySec = new Map<number, LogEntry[]>()
  for (const e of log) {
    if (e.agent === 'system') continue
    const list = bySec.get(e.sim_seconds)
    if (list) list.push(e)
    else bySec.set(e.sim_seconds, [e])
  }
  for (const [sec, entries] of bySec) {
    const agents = [...new Set(entries.map((e) => e.agent))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
    if (agents.length < 2) continue // a cycle is at least two agents handing work to each other
    const steps = agents.map((a) => {
      const mine = entries.filter((e) => e.agent === a).reverse() // log is newest-first; show the first action
      return { agent: a, count: mine.length, text: mine[0].summary }
    })
    out.push({ key: sec, sim_time: entries[0].sim_time, steps })
    if (out.length >= max) break
  }
  return out
}

/** Each cycle as a chain: who did what, and who acted on it next. */
export function CoordinationTimeline({ max = 6 }: { max?: number }) {
  const log = useStore((s) => s.log)
  const list = useMemo(() => cycles(log, max), [log, max])
  if (list.length === 0) {
    return (
      <Empty icon={Workflow} title="No coordination yet">
        Start the scenario from Simulation. Each time something changes, you will see the agents hand the work to each other here.
      </Empty>
    )
  }
  return (
    <ol className="space-y-4" data-testid="coordination-timeline">
      {list.map((c) => (
        <li key={c.key} className="rounded-lg border border-slate-200 p-3" data-testid="coordination-cycle">
          <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-900 tnum">{c.sim_time}</span>
            <span>{c.steps.length} agents worked together</span>
          </div>
          <div className="flex flex-wrap items-stretch gap-1.5">
            {c.steps.map((s, i) => {
              const color = s.agent === 'human' ? '#475569' : AGENT_COLORS[s.agent]
              return (
                <Fragment key={s.agent}>
                  {i > 0 && <ChevronRight className="size-4 shrink-0 self-center text-slate-300" aria-hidden />}
                  <div className="min-w-[10rem] flex-1 rounded-md border-l-[3px] bg-slate-50 px-2.5 py-1.5" style={{ borderLeftColor: color }}>
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color }}>
                      {AGENTS[s.agent].name}
                      {s.count > 1 && <span className="font-normal text-slate-500">×{s.count}</span>}
                    </div>
                    <div className="line-clamp-2 text-xs text-slate-700" title={s.text}>
                      {s.text}
                    </div>
                  </div>
                </Fragment>
              )
            })}
          </div>
        </li>
      ))}
    </ol>
  )
}
