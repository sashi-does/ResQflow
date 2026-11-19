import { useEffect, useState } from 'react'
import { AGENT_COLORS, AGENT_LABEL } from '../lib/format'
import { useStore } from '../store'
import type { AgentName, LogEntry } from '../types'

type Node = { id: AgentName; x: number; y: number }
const NODES: Node[] = [
  { id: 'field_intake', x: 70, y: 52 },
  { id: 'monitor', x: 225, y: 52 },
  { id: 'inventory', x: 70, y: 150 },
  { id: 'routing', x: 225, y: 150 },
  { id: 'human', x: 365, y: 200 },
  { id: 'coordinator', x: 148, y: 248 },
  { id: 'validator', x: 70, y: 346 },
  { id: 'dispatcher', x: 225, y: 346 },
]
const POS = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<AgentName, Node>
type Edge = [AgentName, AgentName]
const EDGES: Edge[] = [
  ['field_intake', 'inventory'],
  ['monitor', 'inventory'],
  ['monitor', 'routing'],
  ['inventory', 'coordinator'],
  ['routing', 'coordinator'],
  ['coordinator', 'validator'],
  ['validator', 'coordinator'],
  ['validator', 'dispatcher'],
  ['dispatcher', 'human'],
  ['human', 'dispatcher'],
  ['routing', 'human'],
  ['human', 'routing'],
  ['field_intake', 'human'],
  ['human', 'field_intake'],
]
const key = (e: Edge) => `${e[0]}>${e[1]}`

/** Which messages a decision-log entry implies (who talked to whom). */
function edgesFor(e: LogEntry): Edge[] {
  const k = e.kind
  switch (e.agent) {
    case 'monitor':
      return k === 'hazard.unverified' ? [['monitor', 'routing']] : [['monitor', 'routing'], ['monitor', 'inventory']]
    case 'routing':
      return [['monitor', 'routing'], ['routing', 'human']]
    case 'inventory':
      return [['inventory', 'coordinator']]
    case 'coordinator':
      return k === 'plan.proposed' ? [['inventory', 'coordinator'], ['routing', 'coordinator']] : [['inventory', 'coordinator']]
    case 'validator':
      return k === 'plan.rejected' ? [['coordinator', 'validator'], ['validator', 'coordinator']] : [['coordinator', 'validator']]
    case 'dispatcher':
      return k === 'approval.requested' ? [['validator', 'dispatcher'], ['dispatcher', 'human']] : [['validator', 'dispatcher']]
    case 'field_intake':
      return k === 'field_report.pending' || k === 'field_report.unparsed'
        ? [['field_intake', 'human']]
        : [['field_intake', 'inventory']]
    case 'human':
      if (k.startsWith('field_report')) return [['human', 'field_intake']]
      if (k === 'driver.ack' || k === 'hazard.confirmed') return [['human', 'routing']]
      return [['human', 'dispatcher']]
    default:
      return []
  }
}

const PULSE_MS = 1400

export function AgentsView() {
  const log = useStore((s) => s.log)
  const stats = useStore((s) => s.agents)
  const planSeq = useStore((s) => s.planSeq)
  const latest = log[0]
  const [pulse, setPulse] = useState<{ nodes: Set<string>; edges: Set<string>; at: number }>({
    nodes: new Set(),
    edges: new Set(),
    at: 0,
  })

  useEffect(() => {
    if (!latest) return
    // gather everything logged in the same instant (one agent cycle) so the whole chain lights up together
    const burst = log.filter((e) => e.sim_seconds === latest.sim_seconds).slice(0, 12)
    const nodes = new Set(burst.map((e) => e.agent as string))
    const edges = new Set(burst.flatMap(edgesFor).map(key))
    const t = setTimeout(() => setPulse({ nodes, edges, at: Date.now() }), 0)
    const t2 = setTimeout(() => setPulse({ nodes: new Set(), edges: new Set(), at: Date.now() }), PULSE_MS)
    return () => {
      clearTimeout(t)
      clearTimeout(t2)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id])

  useEffect(() => {
    if (!planSeq) return
    // every planning cycle: Inventory + Routing feed the Coordinator, the Validator checks its plan
    const nodes = new Set(['inventory', 'routing', 'coordinator', 'validator'])
    const edges = new Set(
      (
        [
          ['inventory', 'coordinator'],
          ['routing', 'coordinator'],
          ['coordinator', 'validator'],
        ] as Edge[]
      ).map(key),
    )
    const t = setTimeout(() => setPulse((p) => ({ nodes: new Set([...p.nodes, ...nodes]), edges: new Set([...p.edges, ...edges]), at: Date.now() })), 0)
    const t2 = setTimeout(() => setPulse({ nodes: new Set(), edges: new Set(), at: Date.now() }), PULSE_MS)
    return () => {
      clearTimeout(t)
      clearTimeout(t2)
    }
  }, [planSeq])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="agents-view">
      <svg viewBox="0 0 420 400" className="mx-auto block w-full max-w-[460px]">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#64748b" />
          </marker>
        </defs>
        {EDGES.map((e) => {
          const a = POS[e[0]]
          const b = POS[e[1]]
          const rev = EDGES.some((x) => x[0] === e[1] && x[1] === e[0])
          const off = rev ? (e[0] < e[1] ? 6 : -6) : 0 // separate the two directions of a pair
          const dx = b.x - a.x
          const dy = b.y - a.y
          const len = Math.hypot(dx, dy)
          const nx = (-dy / len) * off
          const ny = (dx / len) * off
          const r = 30
          const x1 = a.x + (dx / len) * r + nx
          const y1 = a.y + (dy / len) * r + ny
          const x2 = b.x - (dx / len) * r + nx
          const y2 = b.y - (dy / len) * r + ny
          const active = pulse.edges.has(key(e))
          return (
            <line
              key={key(e)}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={active ? AGENT_COLORS[e[0]] : '#334155'}
              strokeWidth={active ? 3 : 1.5}
              markerEnd="url(#arrow)"
              className={active ? 'edge-pulse' : undefined}
              data-active={active ? 'true' : undefined}
            />
          )
        })}
        {NODES.map((n) => {
          const active = pulse.nodes.has(n.id)
          const st = stats[n.id]
          const busy = n.id === 'coordinator' && st?.busy
          return (
            <g key={n.id} data-testid={`agent-node-${n.id}`} data-active={active ? 'true' : 'false'}>
              <circle
                cx={n.x}
                cy={n.y}
                r={26}
                fill={`${AGENT_COLORS[n.id]}${active || busy ? '55' : '22'}`}
                stroke={AGENT_COLORS[n.id]}
                strokeWidth={active ? 3 : 1.5}
                className={active || busy ? 'node-pulse' : undefined}
                style={{ transformOrigin: `${n.x}px ${n.y}px` }}
              />
              <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#f8fafc">
                {st?.count ?? 0}
              </text>
              <text x={n.x} y={n.y + 42} textAnchor="middle" fontSize="11" fill="#cbd5e1">
                {AGENT_LABEL[n.id]}
                {n.id === 'coordinator' || n.id === 'field_intake' ? ' ✦' : ''}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="px-3 text-[11px] text-slate-500">
        Nodes pulse when an agent acts; arrows show who passed what to whom. ✦ = uses the AI model. Numbers are actions so far.
      </p>
      <table className="mt-2 w-full text-left text-[11px]">
        <thead className="text-[10px] tracking-wider text-slate-500 uppercase">
          <tr>
            <th className="px-3 py-1">Agent</th>
            <th className="px-1 py-1 text-right">Acts</th>
            <th className="px-1 py-1 text-right">Avg ms</th>
            <th className="px-2 py-1">Last action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {NODES.map((n) => {
            const st = stats[n.id]
            return (
              <tr key={n.id} className="align-top">
                <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: AGENT_COLORS[n.id] }}>
                  {AGENT_LABEL[n.id]}
                  {n.id === 'coordinator' && st?.model && (
                    <div className="text-[10px] text-slate-400">
                      {st.model} · retries {st.retries ?? 0}
                      {st.busy ? ' · thinking…' : ''}
                    </div>
                  )}
                </td>
                <td className="px-1 py-1.5 text-right tabular-nums text-slate-300">{st?.count ?? 0}</td>
                <td className="px-1 py-1.5 text-right tabular-nums text-slate-400">
                  {st?.avg_latency_ms != null ? st.avg_latency_ms.toFixed(st.avg_latency_ms < 10 ? 1 : 0) : '—'}
                </td>
                <td className="px-2 py-1.5 text-slate-300">
                  {st?.last_summary ? (
                    <>
                      <span className="font-mono text-slate-500">{st.last_at} </span>
                      {st.last_summary.length > 110 ? `${st.last_summary.slice(0, 110)}…` : st.last_summary}
                    </>
                  ) : (
                    <span className="text-slate-600">idle</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
