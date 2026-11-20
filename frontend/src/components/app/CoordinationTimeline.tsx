import { ArrowRight, Bot, ChevronRight, Workflow } from 'lucide-react'
import { Fragment } from 'react'
import { cn } from '@/lib/utils'
import { AGENTS } from '../../lib/agents'
import { agentColor, cycleTitle, type Cycle } from '../../lib/cycles'
import { Empty } from './blocks'

/** Each coordination cycle as one clickable row: why it started, the chain of agents, and what came out of it. */
export function CoordinationTimeline({ cycles, selected, onSelect, onOpen }: { cycles: Cycle[]; selected?: number | null; onSelect?: (id: number) => void; onOpen: (id: number) => void }) {
  if (cycles.length === 0) {
    return (
      <Empty icon={Workflow} title="No coordination yet">
        Start a case from Simulation. Each time something changes, you will see the agents hand the work to each other here.
      </Empty>
    )
  }
  return (
    <ol className="space-y-2" data-testid="coordination-timeline">
      {cycles.map((c) => (
        <li key={c.id}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              onSelect?.(c.id)
              onOpen(c.id)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect?.(c.id)
                onOpen(c.id)
              }
            }}
            onMouseEnter={() => onSelect?.(c.id)}
            className={cn(
              'group cursor-pointer rounded-lg border p-3 transition-colors hover:border-brand-400 hover:bg-brand-50/40 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none',
              selected === c.id ? 'border-brand-500 bg-brand-50/50' : 'border-slate-200',
            )}
            data-testid="coordination-cycle"
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-900 tnum">{c.start}</span>
                  <span className="tnum">#{c.id}</span>
                  {c.llmCalls.length > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-brand-50 px-1 text-[10px] font-semibold text-brand-800">
                      <Bot className="size-3" aria-hidden /> AI planned
                    </span>
                  )}
                  {c.rejected > 0 && <span className="rounded bg-amber-50 px-1 text-[10px] font-semibold text-amber-800">Validator objected ×{c.rejected}</span>}
                </div>
                <div className="mt-0.5 truncate text-sm font-medium text-slate-900">{cycleTitle(c)}</div>
              </div>
              <ChevronRight className="mt-1 size-4 shrink-0 text-slate-400 group-hover:text-slate-700" aria-hidden />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]">
              {c.agents.map((a, i) => (
                <Fragment key={a}>
                  {i > 0 && <ArrowRight className="size-3 text-slate-400" aria-hidden />}
                  <span className="rounded-full px-2 py-0.5 font-semibold text-white" style={{ background: agentColor(a) }}>
                    {AGENTS[a].name}
                  </span>
                </Fragment>
              ))}
            </div>
            <div className="mt-2 text-xs text-slate-500 tnum">
              {c.entries.length} steps
              {c.dispatched > 0 && ` · ${c.dispatched} truck${c.dispatched > 1 ? 's' : ''} sent`}
              {c.approvals > 0 && ` · ${c.approvals} waiting for approval`}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
