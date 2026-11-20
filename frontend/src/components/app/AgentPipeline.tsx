import { ArrowRight, Sparkles } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { AGENT_COLORS } from '../../lib/format'
import { useStore } from '../../store'
import { AGENTS } from '../../lib/agents'
import type { AgentName } from '../../types'

const STAGES: { title: string; agents: AgentName[]; handoff?: string }[] = [
  { title: 'Sense', agents: ['field_intake', 'monitor'], handoff: 'camp updates · road closures' },
  { title: 'Assess', agents: ['inventory', 'routing'], handoff: 'camp needs · safe routes' },
  { title: 'Plan', agents: ['coordinator'], handoff: 'proposed plan' },
  { title: 'Check', agents: ['validator'], handoff: 'checked orders' },
  { title: 'Act', agents: ['dispatcher'], handoff: 'approval requests' },
  { title: 'Decide', agents: ['human'] },
]

const PULSE_MS = 2500

/** Agents that acted in the latest cycle (same sim time), lit for a moment; planning cycles light Plan + Check. */
function useActive(): Set<AgentName> {
  const log = useStore((s) => s.log)
  const planSeq = useStore((s) => s.planSeq)
  const latest = log[0]
  const [active, setActive] = useState<Set<AgentName>>(new Set())
  useEffect(() => {
    if (!latest) return
    const burst = new Set(log.filter((e) => e.sim_seconds === latest.sim_seconds).map((e) => e.agent))
    const t = setTimeout(() => setActive(burst), 0)
    const t2 = setTimeout(() => setActive(new Set()), PULSE_MS)
    return () => {
      clearTimeout(t)
      clearTimeout(t2)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id])
  useEffect(() => {
    if (!planSeq) return
    const t = setTimeout(() => setActive((a) => new Set([...a, 'inventory', 'routing', 'coordinator', 'validator'])), 0)
    const t2 = setTimeout(() => setActive(new Set()), PULSE_MS)
    return () => {
      clearTimeout(t)
      clearTimeout(t2)
    }
  }, [planSeq])
  return active
}

function AgentCard({ id, active }: { id: AgentName; active: boolean }) {
  const st = useStore((s) => s.agents[id])
  const busy = id === 'coordinator' && st?.busy
  const a = AGENTS[id]
  const color = id === 'human' ? '#475569' : AGENT_COLORS[id]
  return (
    <div
      className={cn('relative rounded-lg border bg-white p-3 transition-all duration-300', active || busy ? 'border-transparent shadow-md' : 'border-slate-200')}
      style={active || busy ? { boxShadow: `0 0 0 2px ${color}, 0 4px 14px ${color}33` } : undefined}
      data-testid={`agent-node-${id}`}
      data-active={active ? 'true' : 'false'}
    >
      <div className="flex items-center gap-2">
        <span className={cn('size-2 shrink-0 rounded-full', (active || busy) && 'animate-pulse')} style={{ background: color }} aria-hidden />
        <span className="truncate text-sm font-semibold text-slate-900">{a.name}</span>
      </div>
      <p className="mt-1 text-xs leading-snug text-slate-500">{a.does}</p>
      <div className="mt-2 flex items-center gap-1.5 text-xs" title={st?.last_summary ?? undefined}>
        <span className="font-semibold text-slate-900 tnum">{st?.count ?? 0}</span>
        <span className="text-slate-500">actions</span>
        {busy ? (
          <span className="ml-auto text-brand-700">thinking…</span>
        ) : (
          a.ai && (
            <span className="ml-auto inline-flex items-center gap-0.5 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-800" title="Uses the AI model">
              <Sparkles className="size-3" aria-hidden /> AI
            </span>
          )
        )}
      </div>
    </div>
  )
}

function Handoff({ live }: { live: boolean }) {
  return (
    <div className="flex items-center justify-center py-1 lg:flex-col lg:py-0" aria-hidden>
      <div className="relative h-5 w-px overflow-hidden bg-slate-200 lg:h-px lg:w-full">
        {live && <span className="handoff-dot absolute size-1.5 rounded-full bg-brand-600" />}
      </div>
      <ArrowRight className={cn('size-4 rotate-90 lg:rotate-0', live ? 'text-brand-600' : 'text-slate-300')} />
    </div>
  )
}

/** The agent team as a live pipeline: Sense → Assess → Plan → Check → Act → Decide. */
export function AgentPipeline() {
  const active = useActive()
  const on = (s: (typeof STAGES)[number]) => s.agents.some((a) => active.has(a))
  return (
    <div className="grid grid-cols-1 gap-1 lg:grid-cols-[repeat(5,minmax(0,1fr)_1.75rem)_minmax(0,1fr)] lg:items-center" data-testid="agents-view">
      {STAGES.map((s, i) => (
        <Fragment key={s.title}>
          <div className="space-y-2 self-stretch">
            <div>
              <div className={cn('text-[11px] font-semibold tracking-wider uppercase', on(s) ? 'text-brand-700' : 'text-slate-500')}>
                {i + 1}. {s.title}
              </div>
              <div className={cn('min-h-8 text-[11px] leading-tight', on(s) ? 'text-brand-800' : 'text-slate-500')}>{s.handoff ? `→ ${s.handoff}` : 'people stay in charge'}</div>
            </div>
            {s.agents.map((a) => (
              <AgentCard key={a} id={a} active={active.has(a)} />
            ))}
          </div>
          {s.handoff && <Handoff live={on(s) && on(STAGES[i + 1])} />}
        </Fragment>
      ))}
    </div>
  )
}
