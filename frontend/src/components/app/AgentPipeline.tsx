import { ArrowRight, Sparkles } from 'lucide-react'
import { Fragment } from 'react'
import { cn } from '@/lib/utils'
import { AGENTS } from '../../lib/agents'
import { agentColor, type Cycle } from '../../lib/cycles'
import { useStore } from '../../store'
import type { AgentName } from '../../types'

const STAGES: { title: string; agents: AgentName[]; handoff?: string }[] = [
  { title: 'Sense', agents: ['field_intake', 'monitor'], handoff: 'camp updates · road closures' },
  { title: 'Assess', agents: ['inventory', 'routing'], handoff: 'camp needs · safe routes' },
  { title: 'Plan', agents: ['coordinator'], handoff: 'proposed plan' },
  { title: 'Check', agents: ['validator'], handoff: 'checked orders' },
  { title: 'Act', agents: ['dispatcher', 'supply'], handoff: 'approval requests' },
  { title: 'Decide', agents: ['human'] },
]

interface Lit {
  /** order in the cycle (1-based) for agents that took part */
  order: Map<AgentName, number>
  /** agents lit at this moment of the replay */
  on: Set<AgentName>
  current: AgentName | null
  text: Map<AgentName, string>
}

function lit(cycle: Cycle | null, step: number | null): Lit {
  const order = new Map<AgentName, number>()
  const text = new Map<AgentName, string>()
  if (!cycle) return { order, on: new Set(), current: null, text }
  cycle.agents.forEach((a, i) => order.set(a, i + 1))
  const upto = step == null ? cycle.entries : cycle.entries.slice(0, step + 1)
  for (const e of upto) text.set(e.agent, e.summary) // the latest thing each agent did so far
  const current = step == null ? null : (cycle.entries[step]?.agent ?? null)
  return { order, on: new Set(upto.map((e) => e.agent)), current, text }
}

function AgentCard({ id, l, selected, onClick }: { id: AgentName; l: Lit; selected: boolean; onClick?: () => void }) {
  const st = useStore((s) => s.agents[id])
  const thinking = id === 'coordinator' && st?.busy
  const a = AGENTS[id]
  const color = agentColor(id)
  const n = l.order.get(id)
  const on = l.on.has(id) || thinking
  const current = l.current === id || thinking
  const dim = selected && !n && !thinking
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative w-full rounded-lg border bg-white p-3 text-left transition-all duration-300',
        on ? 'border-transparent' : 'border-slate-200',
        dim && 'opacity-45',
        current && 'scale-[1.02]',
      )}
      style={on ? { boxShadow: `0 0 0 2px ${color}, 0 6px 18px ${color}40`, background: `${color}0d` } : undefined}
      data-testid={`agent-node-${id}`}
      data-active={on ? 'true' : 'false'}
      aria-label={`${a.name}${n ? `, step ${n} in this cycle` : ''}`}
    >
      {n != null && (
        <span className="absolute -top-2 -right-2 grid size-5 place-items-center rounded-full text-[10px] font-bold text-white shadow" style={{ background: color }}>
          {n}
        </span>
      )}
      <div className="flex items-center gap-2">
        <span className={cn('size-2 shrink-0 rounded-full', current && 'animate-ping')} style={{ background: color }} aria-hidden />
        <span className="text-sm leading-tight font-semibold text-slate-900">{a.name}</span>
      </div>
      {thinking ? (
        <p className="mt-1.5 text-xs font-medium text-brand-700">Thinking… the clock waits for the plan.</p>
      ) : l.text.get(id) ? (
        <p className="mt-1.5 line-clamp-3 text-xs leading-snug text-slate-700">{l.text.get(id)}</p>
      ) : (
        <p className="mt-1.5 text-xs leading-snug text-slate-500">{a.does}</p>
      )}
      <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-500 tnum">
        {st?.count ?? 0} actions today
        {a.ai && (
          <span className="ml-auto inline-flex items-center gap-0.5 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-800" title="Uses the AI model">
            <Sparkles className="size-3" aria-hidden /> AI
          </span>
        )}
      </div>
    </button>
  )
}

function Handoff({ live, flowing }: { live: boolean; flowing: boolean }) {
  return (
    <div className="flex items-center justify-center py-1 lg:flex-col lg:py-0" aria-hidden>
      <div className={cn('relative h-5 w-0.5 overflow-hidden lg:h-0.5 lg:w-full', live ? 'bg-brand-300' : 'bg-slate-200')}>
        {flowing && <span className="handoff-dot absolute size-1.5 rounded-full bg-brand-600" />}
      </div>
      <ArrowRight className={cn('size-4 rotate-90 lg:rotate-0', live ? 'text-brand-600' : 'text-slate-300')} />
    </div>
  )
}

/** The agent team as a pipeline (Sense → Assess → Plan → Check → Act → Decide), lit for one coordination cycle. */
export function AgentPipeline({ cycle, step = null, onAgent }: { cycle: Cycle | null; step?: number | null; onAgent?: (a: AgentName) => void }) {
  const l = lit(cycle, step)
  const thinking = useStore((s) => s.agents.coordinator?.busy)
  const on = (s: (typeof STAGES)[number]) => s.agents.some((a) => l.on.has(a))
  const isCurrent = (s: (typeof STAGES)[number]) => !!l.current && s.agents.includes(l.current)
  return (
    <div className="grid grid-cols-1 gap-1 lg:grid-cols-[repeat(5,minmax(0,1fr)_1.75rem)_minmax(0,1fr)] lg:items-start" data-testid="agents-view">
      {STAGES.map((s, i) => (
        <Fragment key={s.title}>
          <div className="space-y-2.5">
            <div>
              <div className={cn('text-[11px] font-semibold tracking-wider uppercase', on(s) ? 'text-brand-700' : 'text-slate-500')}>
                {i + 1}. {s.title}
              </div>
              <div className={cn('min-h-8 text-[11px] leading-tight', on(s) ? 'text-brand-800' : 'text-slate-500')}>{s.handoff ? `→ ${s.handoff}` : 'people stay in charge'}</div>
            </div>
            {s.agents.map((a) => (
              <AgentCard key={a} id={a} l={l} selected={!!cycle} onClick={onAgent ? () => onAgent(a) : undefined} />
            ))}
          </div>
          {s.handoff && (
            <div className="lg:pt-24">
              <Handoff live={on(s) && on(STAGES[i + 1])} flowing={(isCurrent(STAGES[i + 1]) && on(s)) || (!!thinking && s.title === 'Assess')} />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  )
}
