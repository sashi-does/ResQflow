import { ChevronDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { AGENT_COLORS, AGENT_LABEL } from '../../lib/format'
import { useStore } from '../../store'
import type { LogEntry } from '../../types'
import { Empty } from './blocks'

const HUMAN = '#475569'

function Row({ e }: { e: LogEntry }) {
  const [open, setOpen] = useState(false)
  const color = e.agent === 'human' ? HUMAN : AGENT_COLORS[e.agent]
  return (
    <li className="border-l-2 py-1.5 pl-3" style={{ borderLeftColor: color }} data-kind={e.kind}>
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold uppercase" style={{ color }}>
          {e.agent === 'human' ? 'Person' : AGENT_LABEL[e.agent]}
        </span>
        <span className="text-slate-500 tnum">{e.sim_time}</span>
        {e.summary.startsWith('[demo]') && <span className="rounded bg-violet-50 px-1 text-[10px] font-semibold text-violet-700">demo</span>}
        {e.reasoning && (
          <button className="ml-auto flex items-center gap-0.5 text-slate-500 hover:text-slate-900" onClick={() => setOpen(!open)} aria-expanded={open}>
            Why <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
          </button>
        )}
      </div>
      <div className="text-sm text-slate-800">{e.summary}</div>
      {open && <div className="mt-1 text-xs leading-relaxed whitespace-pre-line text-slate-600">{e.reasoning}</div>}
    </li>
  )
}

/** Decision-log entries in plain English, newest first. */
export function ActivityList({ match, limit = 12, empty = 'Nothing yet.', testId }: { match?: (e: LogEntry) => boolean; limit?: number; empty?: string; testId?: string }) {
  const log = useStore((s) => s.log)
  const rows = useMemo(() => (match ? log.filter(match) : log).slice(0, limit), [log, match, limit])
  if (rows.length === 0) return <Empty title={empty} />
  return (
    <ul className="space-y-2" data-testid={testId ?? 'activity'}>
      {rows.map((e) => (
        <Row key={e.id} e={e} />
      ))}
    </ul>
  )
}
