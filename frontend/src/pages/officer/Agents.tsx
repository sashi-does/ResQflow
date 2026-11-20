import { FlaskConical, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { ActivityList } from '../../components/app/ActivityList'
import { AgentPipeline } from '../../components/app/AgentPipeline'
import { PageGrid, Section, StatCard, StatGrid } from '../../components/app/blocks'
import { CoordinationTimeline } from '../../components/app/CoordinationTimeline'
import { AGENTS } from '../../lib/agents'
import { AGENT_COLORS } from '../../lib/format'
import { navigate } from '../../router'
import { useStore } from '../../store'
import type { AgentName, LogEntry } from '../../types'

const FILTERS: AgentName[] = ['field_intake', 'monitor', 'inventory', 'routing', 'coordinator', 'validator', 'dispatcher', 'human']

export function OfficerAgents() {
  const log = useStore((s) => s.log)
  const stats = useStore((s) => s.agents)
  const health = useStore((s) => s.health)
  const sim = useStore((s) => s.sim)
  const [on, setOn] = useState<AgentName[]>([])
  const [q, setQ] = useState('')
  const match = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (e: LogEntry) => (!on.length || on.includes(e.agent)) && (!needle || `${e.summary} ${e.reasoning}`.toLowerCase().includes(needle))
  }, [on, q])
  const coord = stats.coordinator
  const rejected = log.filter((e) => e.kind === 'plan.rejected').length
  const people = log.filter((e) => e.agent === 'human').length
  const handoffs = useMemo(() => {
    const secs = new Map<number, Set<string>>()
    for (const e of log) secs.set(e.sim_seconds, (secs.get(e.sim_seconds) ?? new Set()).add(e.agent))
    return [...secs.values()].filter((s) => s.size > 1).length
  }, [log])
  const idle = log.length === 0
  const offline = health?.llm_provider === 'mock' || !!health?.llm_disabled
  return (
    <PageGrid>
      <StatGrid>
        <StatCard label="Coordination cycles" value={handoffs} sub="times two or more agents acted together" />
        <StatCard label="Planner" value={<span className="text-lg">{coord?.model ?? (offline ? 'Rule-based (offline)' : '—')}</span>} sub={offline ? 'no AI available: the heuristic plans' : 'AI proposes, the Validator checks'} />
        <StatCard label="Plans stopped by the Validator" value={rejected} sub="sent back to the Coordinator with reasons" tone={rejected ? 'amber' : undefined} />
        <StatCard label="Human decisions" value={people} sub="approvals, confirmations, acknowledgements" />
      </StatGrid>

      <Section
        title="How the agents work together"
        description="Each stage hands its result to the next. Agents light up when they act; a moving dot shows work flowing between stages."
        action={
          idle ? (
            <Button size="sm" onClick={() => navigate('/officer/simulation')}>
              <FlaskConical /> Start the scenario
            </Button>
          ) : (
            <span className="text-xs text-slate-500 tnum">{sim?.running ? `Live · ${sim.sim_time}` : `Paused · ${sim?.sim_time ?? ''}`}</span>
          )
        }
        className="lg:col-span-12"
      >
        <AgentPipeline />
      </Section>

      <Section title="Coordination timeline" description="The latest cycles, newest first: what each agent did and who acted on it next." className="lg:col-span-7">
        <CoordinationTimeline />
      </Section>

      <Section title="Decision log" description="Every action in plain English. Open “Why” for the reasoning." className="lg:col-span-5">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {FILTERS.map((a) => {
            const active = on.includes(a)
            return (
              <button
                key={a}
                onClick={() => setOn(active ? on.filter((x) => x !== a) : [...on, a])}
                aria-pressed={active}
                className={cn('rounded-full border px-2.5 py-0.5 text-xs font-medium', active ? 'border-transparent text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}
                style={active ? { background: a === 'human' ? '#475569' : AGENT_COLORS[a] } : undefined}
              >
                {AGENTS[a].name}
              </button>
            )
          })}
        </div>
        <div className="relative mb-4">
          <Search className="absolute top-2.5 left-2.5 size-4 text-slate-400" aria-hidden />
          <Input className="pl-8" placeholder="Search (e.g. NH-715, Majuli, T3)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the decision log" />
        </div>
        <div className="max-h-[560px] overflow-y-auto pr-1">
          <ActivityList match={match} limit={300} empty={idle ? 'Nothing logged yet.' : 'No matching entries.'} testId="feed" />
        </div>
      </Section>
    </PageGrid>
  )
}
