import type { AgentName, LLMCall, LogEntry } from '../types'
import { AGENT_COLORS } from './format'

/** Pipeline order: the real data flow in the backend (Sense → Assess → Plan → Check → Act → Decide). */
export const FLOW: AgentName[] = ['field_intake', 'monitor', 'inventory', 'routing', 'coordinator', 'validator', 'dispatcher', 'human']

export interface Cycle {
  id: number
  /** Why the Coordinator planned ("new hazard: …"); null while the cycle is still collecting changes. */
  trigger: string | null
  start: string
  end: string
  /** Entries oldest first. */
  entries: LogEntry[]
  /** Agents in the order they first acted in this cycle. */
  agents: AgentName[]
  llmCalls: string[]
  dispatched: number
  approvals: number
  rejected: number
  planner: string | null
  /** Only a "cycle started" line and nothing else happened. */
  quiet: boolean
}

const WHY = /Why now: (.*)\.$/

/** Group the decision log (newest first, as in the store) into coordination cycles, newest first. */
export function buildCycles(log: LogEntry[]): Cycle[] {
  const by = new Map<number, LogEntry[]>()
  for (const e of log) {
    if (e.cycle == null || e.agent === 'system' || e.kind === 'sitrep') continue
    const list = by.get(e.cycle)
    if (list) list.push(e)
    else by.set(e.cycle, [e])
  }
  const out: Cycle[] = []
  for (const [id, list] of by) {
    const entries = [...list].sort((a, b) => a.id - b.id)
    const agents: AgentName[] = []
    for (const e of entries) if (!agents.includes(e.agent)) agents.push(e.agent)
    const start = entries.find((e) => e.kind === 'cycle.started')
    const proposal = entries.find((e) => e.kind === 'plan.proposed')
    out.push({
      id,
      trigger: start ? (WHY.exec(start.summary)?.[1] ?? start.summary) : null,
      start: entries[0].sim_time,
      end: entries[entries.length - 1].sim_time,
      entries,
      agents,
      llmCalls: [...new Set(entries.map((e) => e.llm_call).filter((x): x is string => !!x))],
      dispatched: entries.filter((e) => e.kind === 'order.dispatched').length,
      approvals: entries.filter((e) => e.kind === 'approval.requested').length,
      rejected: entries.filter((e) => e.kind === 'plan.rejected').length,
      planner: proposal ? proposal.summary.split(' proposed')[0].split(' revised')[0] : null,
      quiet: entries.length === 1 && !!start,
    })
  }
  return out.sort((a, b) => b.id - a.id)
}

/** A cycle worth showing: at least two agents handed work to each other. */
export const isTeamwork = (c: Cycle) => c.agents.length >= 2

export function cycleTitle(c: Cycle): string {
  if (!c.trigger) return 'Changes since the last plan'
  const t = c.trigger.split('; ')
  return t.length > 1 ? `${cap(t[0])} (+${t.length - 1} more)` : cap(t[0])
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const agentColor = (a: AgentName) => (a === 'human' || a === 'system' ? '#475569' : AGENT_COLORS[a])

const PURPOSE: Record<LLMCall['purpose'], string> = {
  coordinator: 'Coordinator: allocation plan',
  field_intake: 'Field Intake: reading a camp report',
  copilot: 'Ask RahatNet: copilot answer',
  report: 'After-action report: narrative',
  other: 'Other',
}

export const purposeLabel = (p: LLMCall['purpose']) => PURPOSE[p] ?? p
