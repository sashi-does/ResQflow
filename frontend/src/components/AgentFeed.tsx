import { useState } from 'react'
import { AGENT_COLORS, AGENT_LABEL } from '../lib/format'
import { useStore } from '../store'
import type { AgentName, LogEntry } from '../types'

const AGENTS: AgentName[] = ['field_intake', 'monitor', 'inventory', 'routing', 'coordinator', 'validator', 'dispatcher', 'human']

function Entry({ e, fresh }: { e: LogEntry; fresh: boolean }) {
  const [open, setOpen] = useState(false)
  const select = useStore((s) => s.select)
  const selectedId = useStore((s) => s.selected?.entryId)
  const color = AGENT_COLORS[e.agent]
  const demo = e.summary.startsWith('[demo]')
  const isSel = selectedId === e.id
  return (
    <li
      className={`${fresh ? 'feed-entry ' : ''}cursor-pointer border-l-2 px-3 py-2 ${isSel ? 'bg-slate-800/80' : 'hover:bg-slate-800/40'}`}
      style={{ borderLeftColor: color }}
      onClick={() => select(isSel ? null : { ...e.refs, entryId: e.id })}
      data-kind={e.kind}
    >
      <div className="mb-0.5 flex items-center gap-2">
        <span
          className="rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: `${color}22`, color }}
        >
          {AGENT_LABEL[e.agent]}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-slate-500">{e.sim_time}</span>
        {demo && <span className="rounded bg-fuchsia-500/20 px-1 text-[10px] text-fuchsia-300">demo</span>}
        {e.reasoning && (
          <button
            className="ml-auto text-[11px] text-slate-500 hover:text-slate-300"
            onClick={(ev) => {
              ev.stopPropagation()
              setOpen(!open)
            }}
            aria-label="toggle reasoning"
          >
            {open ? 'hide why ▴' : 'why ▾'}
          </button>
        )}
      </div>
      <div className="text-[13px] font-medium leading-snug text-slate-100">{e.summary}</div>
      {open && e.reasoning && (
        <div className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-400">{e.reasoning}</div>
      )}
    </li>
  )
}

export function AgentFeed() {
  const log = useStore((s) => s.log)
  const filter = useStore((s) => s.agentFilter)
  const toggle = useStore((s) => s.toggleAgent)
  const thinking = useStore((s) => s.thinking)
  const shown = filter.length ? log.filter((e) => filter.includes(e.agent)) : log
  const [mountedMax] = useState(() => log[0]?.id ?? 0)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap gap-1 border-b border-slate-800 px-3 py-2">
        {AGENTS.map((a) => {
          const on = filter.includes(a)
          return (
            <button
              key={a}
              onClick={() => toggle(a)}
              className="rounded-full border px-2 py-px text-[11px]"
              style={{
                borderColor: on ? AGENT_COLORS[a] : '#334155',
                color: on ? AGENT_COLORS[a] : '#94a3b8',
                background: on ? `${AGENT_COLORS[a]}1a` : 'transparent',
              }}
            >
              {AGENT_LABEL[a]}
            </button>
          )
        })}
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-slate-800/70 overflow-y-auto" data-testid="feed">
        {thinking && (
          <li className="shimmer px-3 py-2 text-[13px] text-emerald-300">Coordinator thinking…</li>
        )}
        {shown.length === 0 && !thinking && (
          <li className="px-4 py-10 text-center text-sm text-slate-500">
            No agent activity yet. Press <b>Run Demo</b> to start the Assam flood scenario.
          </li>
        )}
        {shown.map((e) => (
          <Entry key={e.id} e={e} fresh={e.id > mountedMax} />
        ))}
      </ul>
    </div>
  )
}
