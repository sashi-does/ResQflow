import { ArrowRight, Bot, ChevronDown, Clock, MessageSquareText, Sparkles, Wrench } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { api } from '../../api'
import { AGENTS } from '../../lib/agents'
import { agentColor, buildCycles, cycleTitle, purposeLabel, type Cycle } from '../../lib/cycles'
import { useStore } from '../../store'
import type { LLMCall, LogEntry } from '../../types'

export type Detail = { kind: 'cycle'; id: number } | { kind: 'entry'; id: number } | { kind: 'call'; id: string } | null


function pretty(text: string | undefined): string {
  if (!text) return ''
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

function Block({ title, children, open = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  const [o, setO] = useState(open)
  return (
    <section className="rounded-lg border border-slate-200">
      <button className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold tracking-wide text-slate-600 uppercase" onClick={() => setO(!o)} aria-expanded={o}>
        {title}
        <ChevronDown className={cn('size-4 transition-transform', o && 'rotate-180')} aria-hidden />
      </button>
      {o && <div className="border-t border-slate-100 px-3 py-2">{children}</div>}
    </section>
  )
}

function Code({ text }: { text: string }) {
  return <pre className="max-h-80 overflow-auto rounded bg-slate-50 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-slate-800">{text || '—'}</pre>
}

/** One AI conversation: what the agent sent, what the model answered, tools it used. */
export function Conversation({ id, compact = false }: { id: string; compact?: boolean }) {
  const [call, setCall] = useState<LLMCall | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    api.llmCall(id).then(
      (c) => live && setCall(c),
      (e: unknown) => live && setErr(String(e)),
    )
    return () => {
      live = false
    }
  }, [id])
  if (err) return <p className="text-sm text-slate-500">This conversation is no longer in memory{err.includes('404') ? ' and no history database is configured' : ''}.</p>
  if (!call) return <p className="text-sm text-slate-500">Loading the conversation…</p>
  return (
    <div className="space-y-3" data-testid="conversation">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
          <Sparkles className="size-3.5 text-brand-700" aria-hidden /> {purposeLabel(call.purpose)}
        </span>
        <span>{call.model}</span>
        <span className="inline-flex items-center gap-1 tnum">
          <Clock className="size-3" aria-hidden /> {(call.latency_ms / 1000).toFixed(1)} s
        </span>
        {call.input_tokens > 0 && (
          <span className="tnum">
            {call.input_tokens.toLocaleString()} in · {call.output_tokens.toLocaleString()} out tokens
          </span>
        )}
        {!call.ok && <span className="rounded bg-red-50 px-1.5 font-semibold text-red-700">failed: {call.error}</span>}
      </div>
      {typeof call.meta.attempt === 'number' && call.meta.attempt > 1 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">Attempt {String(call.meta.attempt)}: this request included the Validator's objections to the previous plan.</p>
      )}
      <Block title="What the agent sent (live data)" open={!compact}>
        <Code text={pretty(call.user)} />
      </Block>
      <Block title="What the AI answered">
        <Code text={pretty(call.response)} />
      </Block>
      {call.tool_calls.length > 0 && (
        <Block title={`Read-only lookups (${call.tool_calls.length})`}>
          <ul className="space-y-2">
            {call.tool_calls.map((t, i) => (
              <li key={i} className="text-xs">
                <div className="flex items-center gap-1 font-semibold text-slate-800">
                  <Wrench className="size-3" aria-hidden /> {t.name}({JSON.stringify(t.input)})
                </div>
                {t.result && <Code text={pretty(t.result)} />}
              </li>
            ))}
          </ul>
        </Block>
      )}
      <Block title="Instructions given to the AI (system prompt)" open={false}>
        <Code text={call.system ?? ''} />
      </Block>
    </div>
  )
}

function EntryRow({ e, n, onOpen }: { e: LogEntry; n?: number; onOpen?: () => void }) {
  const [open, setOpen] = useState(false)
  const color = agentColor(e.agent)
  return (
    <li className="relative pl-7">
      <span className="absolute top-1 left-0 grid size-5 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: color }}>
        {n ?? '•'}
      </span>
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold" style={{ color }}>
          {e.agent === 'human' ? (e.actor ?? 'Person') : AGENTS[e.agent].name}
        </span>
        <span className="text-slate-500 tnum">{e.sim_time}</span>
        {e.llm_call && (
          <span className="inline-flex items-center gap-0.5 rounded bg-brand-50 px-1 text-[10px] font-semibold text-brand-800">
            <Bot className="size-3" aria-hidden /> AI
          </span>
        )}
        {(e.reasoning || onOpen) && (
          <button className="ml-auto text-slate-500 hover:text-slate-900" onClick={() => (onOpen ? onOpen() : setOpen(!open))}>
            {onOpen ? 'Open' : open ? 'Hide why' : 'Why'}
          </button>
        )}
      </div>
      <p className="text-sm text-slate-800">{e.summary}</p>
      {open && e.reasoning && <p className="mt-1 text-xs leading-relaxed whitespace-pre-line text-slate-600">{e.reasoning}</p>}
    </li>
  )
}

function CycleBody({ c, onEntry }: { c: Cycle; onEntry: (id: number) => void }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        {[
          ['Steps', c.entries.length],
          ['Trucks sent', c.dispatched],
          ['Need approval', c.approvals],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-slate-200 py-2">
            <div className="text-lg font-semibold text-slate-900 tnum">{v}</div>
            <div className="text-slate-500">{k}</div>
          </div>
        ))}
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Hand-offs, in order</h3>
        <div className="flex flex-wrap items-center gap-1 text-xs">
          {c.agents.map((a, i) => (
            <span key={a} className="inline-flex items-center gap-1">
              {i > 0 && <ArrowRight className="size-3 text-slate-400" aria-hidden />}
              <span className="rounded-full px-2 py-0.5 font-semibold text-white" style={{ background: agentColor(a) }}>
                {AGENTS[a].name}
              </span>
            </span>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Every step</h3>
        <ol className="space-y-3" data-testid="cycle-steps">
          {c.entries.map((e, i) => (
            <EntryRow key={e.id} e={e} n={i + 1} onOpen={() => onEntry(e.id)} />
          ))}
        </ol>
      </div>
      {c.llmCalls.length > 0 ? (
        <div className="space-y-3">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <MessageSquareText className="size-3.5" aria-hidden /> AI conversation{c.llmCalls.length > 1 ? 's' : ''} in this cycle
          </h3>
          {c.llmCalls.map((id) => (
            <Conversation key={id} id={id} compact />
          ))}
        </div>
      ) : (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
          No AI call in this cycle: {c.planner ? `${c.planner} planned it with deterministic rules.` : 'the agents reacted with deterministic code (fast, no model needed).'}
        </p>
      )}
    </div>
  )
}

function EntryBody({ e, onCycle }: { e: LogEntry; onCycle: (id: number) => void }) {
  const refs = Object.entries(e.refs).filter(([, v]) => v.length) as [string, string[]][]
  return (
    <div className="space-y-4">
      <p className="text-[15px] leading-relaxed text-slate-900">{e.summary}</p>
      {e.reasoning && (
        <div>
          <h3 className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Why</h3>
          <p className="text-sm leading-relaxed whitespace-pre-line text-slate-700">{e.reasoning}</p>
        </div>
      )}
      <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-slate-500">Sim time</dt>
        <dd className="tnum">{e.sim_time}</dd>
        <dt className="text-slate-500">Kind</dt>
        <dd className="font-mono text-xs">{e.kind}</dd>
        {e.actor && (
          <>
            <dt className="text-slate-500">Person</dt>
            <dd>{e.actor}</dd>
          </>
        )}
        {refs.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-500 capitalize">{k.replace('_ids', 's')}</dt>
            <dd className="flex flex-wrap gap-1">
              {v.map((x) => (
                <span key={x} className="rounded bg-slate-100 px-1.5 text-xs font-medium text-slate-700">
                  {x}
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      {e.cycle != null && (
        <Button variant="outline" size="sm" onClick={() => onCycle(e.cycle!)} data-testid="open-cycle">
          Open coordination cycle #{e.cycle} <ArrowRight />
        </Button>
      )}
      {e.llm_call && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <MessageSquareText className="size-3.5" aria-hidden /> The AI conversation behind this entry
          </h3>
          <Conversation id={e.llm_call} />
        </div>
      )}
    </div>
  )
}

/** Right-hand detail panel for a cycle, a decision-log entry, or an AI conversation. */
export function DetailSheet({ detail, onChange, log: logProp }: { detail: Detail; onChange: (d: Detail) => void; log?: LogEntry[] }) {
  const storeLog = useStore((s) => s.log)
  const log = logProp ?? storeLog
  const cycles = useMemo(() => buildCycles(log), [log])
  const cycle = detail?.kind === 'cycle' ? cycles.find((c) => c.id === detail.id) : undefined
  const entry = detail?.kind === 'entry' ? log.find((e) => e.id === detail.id) : undefined
  let title = ''
  let sub = ''
  if (cycle) {
    title = `Cycle #${cycle.id}: ${cycleTitle(cycle)}`
    sub = `${cycle.start}${cycle.end !== cycle.start ? ` → ${cycle.end}` : ''} · ${cycle.agents.length} agents · ${cycle.entries.length} steps`
  } else if (entry) {
    title = entry.agent === 'human' ? 'Person' : AGENTS[entry.agent].name
    sub = `${entry.sim_time} · decision-log entry #${entry.id}`
  } else if (detail?.kind === 'call') {
    title = 'AI conversation'
    sub = 'Exactly what was sent to the model and what came back'
  }
  return (
    <Sheet open={!!detail} onOpenChange={(o) => !o && onChange(null)}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl" data-testid="detail-sheet">
        <SheetHeader className="sticky top-0 z-10 border-b bg-white px-5 py-4">
          <SheetTitle className="pr-6 text-base">{title || 'Details'}</SheetTitle>
          <SheetDescription>{sub || 'This item is no longer in the live log.'}</SheetDescription>
        </SheetHeader>
        <div className="px-5 py-4">
          {cycle && <CycleBody c={cycle} onEntry={(id) => onChange({ kind: 'entry', id })} />}
          {entry && <EntryBody e={entry} onCycle={(id) => onChange({ kind: 'cycle', id })} />}
          {detail?.kind === 'call' && <Conversation id={detail.id} />}
        </div>
      </SheetContent>
    </Sheet>
  )
}
