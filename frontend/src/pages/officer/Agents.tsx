import { ChevronLeft, ChevronRight, FlaskConical, Pause, Play, Radio, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { api } from '../../api'
import { ActivityList } from '../../components/app/ActivityList'
import { AgentPipeline } from '../../components/app/AgentPipeline'
import { Empty, PageGrid, Section, StatCard, StatGrid } from '../../components/app/blocks'
import { CoordinationTimeline } from '../../components/app/CoordinationTimeline'
import { DetailSheet, type Detail } from '../../components/app/DetailSheet'
import { AGENTS } from '../../lib/agents'
import { agentColor, buildCycles, cycleTitle, isTeamwork, purposeLabel } from '../../lib/cycles'
import { navigate } from '../../router'
import { useStore } from '../../store'
import type { AgentName, LLMCall, LogEntry } from '../../types'

const FILTERS: AgentName[] = ['field_intake', 'monitor', 'inventory', 'routing', 'coordinator', 'validator', 'dispatcher', 'supply', 'human']
const STEP_MS = 900

function useLLMCalls(trigger: unknown): LLMCall[] {
  const [calls, setCalls] = useState<LLMCall[]>([])
  useEffect(() => {
    let live = true
    const t = setTimeout(() => api.llmCalls(30).then((c) => live && setCalls(c), () => undefined), 300)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [trigger])
  return calls
}

export function OfficerAgents() {
  const log = useStore((s) => s.log)
  const health = useStore((s) => s.health)
  const sim = useStore((s) => s.sim)
  const [on, setOn] = useState<AgentName[]>([])
  const [q, setQ] = useState('')
  const [detail, setDetail] = useState<Detail>(null)
  const [picked, setPicked] = useState<number | null>(null) // null = follow the latest cycle
  const [step, setStep] = useState<number | null>(null) // replay position
  const [hover, setHover] = useState<number | null>(null)

  const cycles = useMemo(() => buildCycles(log).filter(isTeamwork), [log])
  const shownId = hover ?? picked ?? cycles[0]?.id ?? null
  const cycle = cycles.find((c) => c.id === shownId) ?? null
  const idx = cycle ? cycles.indexOf(cycle) : -1
  const calls = useLLMCalls(log[0]?.id)

  // replay: step through the cycle's entries one by one
  useEffect(() => {
    if (step == null || !cycle) return
    if (step >= cycle.entries.length - 1) {
      const t = setTimeout(() => setStep(null), STEP_MS * 2)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setStep(step + 1), STEP_MS)
    return () => clearTimeout(t)
  }, [step, cycle])

  const match = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (e: LogEntry) => (!on.length || on.includes(e.agent)) && (!needle || `${e.summary} ${e.reasoning}`.toLowerCase().includes(needle))
  }, [on, q])
  const rejected = log.filter((e) => e.kind === 'plan.rejected').length
  const people = log.filter((e) => e.agent === 'human').length
  const aiCycles = cycles.filter((c) => c.llmCalls.length > 0).length
  const idle = log.length === 0
  const offline = health?.llm_provider === 'mock' || !!health?.llm_disabled
  const pick = (id: number) => {
    setPicked(id)
    setStep(null)
  }
  const replaying = step != null
  const stepEntry = cycle && step != null ? cycle.entries[step] : null

  return (
    <PageGrid>
      <StatGrid>
        <StatCard label="Coordination cycles" value={cycles.length} sub="times the agents handed work to each other" />
        <StatCard
          label="Planned by the AI"
          value={aiCycles}
          sub={offline ? `offline: ${health?.llm_disabled ? 'AI unavailable' : 'no API key'}, rules plan instead` : `cycles where ${health?.llm_model ?? 'the AI'} proposed the plan`}
          tone={offline ? 'amber' : undefined}
        />
        <StatCard label="Plans stopped by the Validator" value={rejected} sub="sent back to the Coordinator with reasons" tone={rejected ? 'amber' : undefined} />
        <StatCard label="Human decisions" value={people} sub="approvals, confirmations, acknowledgements" />
      </StatGrid>

      <Section
        title="How the agents work together"
        description="Pick a cycle to light up the agents that took part, numbered in the order they acted. Replay steps through the hand-offs one at a time."
        action={
          idle ? (
            <Button size="sm" onClick={() => navigate('/officer/simulation')}>
              <FlaskConical /> Start a case
            </Button>
          ) : (
            <span className="text-xs text-slate-500 tnum">{sim?.held ? 'Clock held: the AI is planning' : sim?.running ? `Live · ${sim.sim_time}` : `Paused · ${sim?.sim_time ?? ''}`}</span>
          )
        }
        className="lg:col-span-12"
      >
        {cycle && (
          <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2" data-testid="cycle-controls">
            <Button variant="ghost" size="icon" className="size-8" disabled={idx >= cycles.length - 1} onClick={() => pick(cycles[idx + 1].id)} aria-label="Previous cycle">
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon" className="size-8" disabled={idx <= 0} onClick={() => pick(cycles[idx - 1].id)} aria-label="Next cycle">
              <ChevronRight />
            </Button>
            <button className="min-w-0 flex-1 text-left" onClick={() => setDetail({ kind: 'cycle', id: cycle.id })} data-testid="cycle-heading">
              <div className="text-xs text-slate-500 tnum">
                Cycle #{cycle.id} · {cycle.start}
                {cycle.end !== cycle.start ? ` → ${cycle.end}` : ''} · {cycle.agents.length} agents · {cycle.entries.length} steps
              </div>
              <div className="truncate text-sm font-semibold text-slate-900">{cycleTitle(cycle)}</div>
            </button>
            <Button size="sm" variant={replaying ? 'secondary' : 'default'} onClick={() => setStep(replaying ? null : 0)} data-testid="replay">
              {replaying ? <Pause /> : <Play />} {replaying ? 'Stop' : 'Replay'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={cn(picked == null && 'border-emerald-300 bg-emerald-50 text-emerald-800')}
              onClick={() => {
                setPicked(null)
                setStep(null)
              }}
              aria-pressed={picked == null}
            >
              <Radio /> {picked == null ? 'Following live' : 'Follow live'}
            </Button>
          </div>
        )}
        <AgentPipeline cycle={cycle} step={step} onAgent={(a) => setOn([a])} />
        {stepEntry && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: agentColor(stepEntry.agent) }} data-testid="replay-caption">
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: agentColor(stepEntry.agent) }}>
              {step! + 1}
            </span>
            <div>
              <div className="text-xs font-semibold" style={{ color: agentColor(stepEntry.agent) }}>
                {AGENTS[stepEntry.agent].name} · {stepEntry.sim_time}
              </div>
              <div className="text-slate-800">{stepEntry.summary}</div>
            </div>
          </div>
        )}
      </Section>

      <Section title="Coordination timeline" description="Every cycle, newest first: why it started and which agents acted. Click one for every step and the AI conversation." className="lg:col-span-7">
        <div className="max-h-[640px] overflow-y-auto pr-1" onMouseLeave={() => setHover(null)}>
          <CoordinationTimeline cycles={cycles.slice(0, 40)} selected={shownId} onSelect={(id) => setHover(id)} onOpen={(id) => { pick(id); setDetail({ kind: 'cycle', id }) }} />
        </div>
      </Section>

      <Section title="Decision log" description="Every action in plain English. Click a row for the reasoning, its cycle and any AI conversation." className="lg:col-span-5">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {FILTERS.map((a) => {
            const active = on.includes(a)
            return (
              <button
                key={a}
                onClick={() => setOn(active ? on.filter((x) => x !== a) : [...on, a])}
                aria-pressed={active}
                className={cn('rounded-full border px-2.5 py-0.5 text-xs font-medium', active ? 'border-transparent text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}
                style={active ? { background: agentColor(a) } : undefined}
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
          <ActivityList match={match} limit={300} empty={idle ? 'Nothing logged yet.' : 'No matching entries.'} testId="feed" onOpen={(e) => setDetail({ kind: 'entry', id: e.id })} />
        </div>
      </Section>

      <Section
        title="AI conversations"
        description={`Every call to the model: what the agent sent, what came back, how long it took.${health?.db === 'connected' ? ' Saved to the history database.' : ''}`}
        className="lg:col-span-12"
      >
        {calls.length === 0 ? (
          <Empty title={offline ? 'No AI conversations: running offline' : 'No AI conversations yet'}>
            {offline ? (health?.llm_disabled ?? 'Add an API key to let the Coordinator, Field Intake and copilot use the model.') : 'They appear here as soon as an agent asks the model.'}
          </Empty>
        ) : (
          <Table data-testid="llm-calls">
            <TableHeader>
              <TableRow>
                <TableHead>Sim time</TableHead>
                <TableHead>What for</TableHead>
                <TableHead className="hidden md:table-cell">Model</TableHead>
                <TableHead className="text-right">Time</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Tokens</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calls.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => setDetail({ kind: 'call', id: c.id })} data-testid="llm-call-row">
                  <TableCell className="tnum">{String(c.meta.sim_time ?? '—')}</TableCell>
                  <TableCell>
                    {purposeLabel(c.purpose)}
                    {typeof c.meta.cycle === 'number' && <span className="ml-1 text-xs text-slate-500">cycle #{c.meta.cycle}</span>}
                  </TableCell>
                  <TableCell className="hidden text-slate-600 md:table-cell">{c.model}</TableCell>
                  <TableCell className="text-right tnum">{(c.latency_ms / 1000).toFixed(1)} s</TableCell>
                  <TableCell className="hidden text-right tnum sm:table-cell">{c.output_tokens ? c.output_tokens.toLocaleString() : '—'}</TableCell>
                  <TableCell>{c.ok ? <span className="text-emerald-700">answered</span> : <span className="text-red-700">failed</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
      <DetailSheet detail={detail} onChange={setDetail} />
    </PageGrid>
  )
}
