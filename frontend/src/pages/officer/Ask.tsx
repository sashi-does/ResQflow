import { AlertTriangle, Bot, Clock, KeyRound, Loader2, Lock, Search, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { api, type CopilotMessage } from '../../api'
import { Empty, PageGrid, Section, StatCard, StatGrid } from '../../components/app/blocks'
import { useStore } from '../../store'

const EXAMPLES = ['Why isn’t Morigaon getting supplies?', 'What happens if NH-27 also floods?', 'Which camp is at most risk tonight?']

const copilotName = (m?: string | null) => (m ?? '—').replace(/^nvidia\/nemotron-3\.5-lightning.*/, 'Nemotron 3.5 Lightning (NVIDIA)').replace(/^anthropic\//, '')

const newId = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`).replace(/[^A-Za-z0-9_-]/g, '')

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function Message({ m }: { m: CopilotMessage }) {
  const pending = m.status === 'pending'
  const problem = m.status === 'failed' || m.status === 'needs_key'
  return (
    <Card className="gap-2 py-4" data-testid="copilot-answer" data-status={m.status}>
      <CardContent className="space-y-2 px-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <div className="text-sm font-semibold text-slate-900">{m.question}</div>
          <div className="ml-auto text-xs text-slate-500 tnum">
            {m.sim_time && `${m.sim_time} · `}
            {when(m.asked_at)}
          </div>
        </div>
        {pending ? (
          <p className="flex items-center gap-2 text-sm text-slate-600" data-testid="copilot-thinking">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Looking at the live situation… you can leave this page; the answer is saved here.
          </p>
        ) : (
          <p className={cn('text-sm leading-relaxed whitespace-pre-line', problem ? 'text-amber-800' : 'text-slate-700')}>
            {problem && <AlertTriangle className="mr-1 inline size-4" aria-hidden />}
            {m.answer}
          </p>
        )}
        {m.tools_used.length > 0 && (
          <div className="flex flex-wrap gap-1.5 text-xs text-slate-500">
            Looked up:
            {m.tools_used.map((t, j) => (
              <code key={j} className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                {t.name}({Object.values(t.input).map((v) => (Array.isArray(v) ? v.join(', ') : String(v))).join(', ')})
              </code>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500" data-testid="copilot-meta">
          {m.model && (
            <span className="inline-flex items-center gap-1">
              <Bot className="size-3.5" aria-hidden /> {pending ? 'Asking' : m.status === 'answered' ? 'Answered by' : 'Tried'} {copilotName(m.model)}
            </span>
          )}
          {m.latency_ms != null && (
            <span className="inline-flex items-center gap-1 tnum">
              <Clock className="size-3.5" aria-hidden /> {(m.latency_ms / 1000).toFixed(1)} s
            </span>
          )}
          {m.asked_by && <span>asked by {m.asked_by}</span>}
        </div>
      </CardContent>
    </Card>
  )
}

export function OfficerAsk() {
  const health = useStore((s) => s.health)
  const setHealth = useStore((s) => s.setHealth)
  const messages = useStore((s) => s.copilot)
  const upsert = useStore((s) => s.upsertCopilot)
  const toast = useStore((s) => s.toast)
  const [q, setQ] = useState('')
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    api.health().then(setHealth, () => undefined) // the key may have been disabled since load (e.g. no credits)
    api.copilotHistory().then(
      (ms) => {
        upsert(ms)
        setLoaded(true)
      },
      () => setLoaded(true),
    )
  }, [setHealth, upsert])
  const list = useMemo(() => Object.values(messages).sort((a, b) => b.asked_at.localeCompare(a.asked_at)), [messages])
  const pending = list.some((m) => m.status === 'pending')
  // an answer may land on another server instance, or while the live connection reconnects: check until it's in
  useEffect(() => {
    if (!pending) return
    const t = setInterval(() => api.copilotHistory().then(upsert, () => undefined), 3000)
    return () => clearInterval(t)
  }, [pending, upsert])
  const offline = !health?.copilot_model // the copilot can have its own model (e.g. NVIDIA) even when planning is offline
  const ask = (question: string) => {
    const text = question.trim()
    if (!text) return
    const id = newId()
    upsert([
      {
        id,
        username: '',
        asked_by: null,
        question: text,
        status: 'pending',
        answer: null,
        model: health?.copilot_model ?? null,
        provider: null,
        tools_used: [],
        latency_ms: null,
        call_id: null,
        sim_time: useStore.getState().sim?.sim_time ?? null,
        case_id: null,
        asked_at: new Date().toISOString(),
        answered_at: null,
      },
    ])
    setQ('')
    // the request keeps running if the officer moves to another page; the server saves the answer either way
    api.copilot(text, id).then(
      (m) => upsert([m]),
      (e: unknown) => {
        toast(String(e), 'error')
        upsert([{ ...useStore.getState().copilot[id], status: 'failed', answer: `Couldn't reach the server: ${String(e)}` }])
      },
    )
  }
  const answered = list.filter((m) => m.status === 'answered')
  const lookups = answered.reduce((n, m) => n + m.tools_used.length, 0)
  return (
    <PageGrid>
      <StatGrid>
        <StatCard label="AI model" value={<span className="text-lg">{offline ? (health?.llm_disabled ? 'AI offline' : 'Needs API key') : copilotName(health?.copilot_model)}</span>} sub={offline ? 'running in offline mode' : 'answers from live data'} icon={offline ? KeyRound : Sparkles} tone={offline ? 'amber' : 'blue'} />
        <StatCard label="Access" value="Read-only" sub="it can look things up, never change them" icon={Lock} tone="green" />
        <StatCard label="Questions asked" value={list.length} sub="saved: they're here next time" icon={Search} tone="blue" />
        <StatCard label="Live lookups used" value={lookups} sub="every fact comes from a lookup" icon={Search} tone="blue" />
      </StatGrid>
      <Section title="Ask a question" description="In English or Assamese. The answer shows which live lookups it used and which model answered." className="lg:col-span-12">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            ask(q)
          }}
        >
          <Input placeholder="e.g. Which camps run out of water before midnight?" value={q} onChange={(e) => setQ(e.target.value)} data-testid="copilot-input" aria-label="Question" maxLength={500} />
          <Button type="submit" disabled={!q.trim()} data-testid="copilot-ask">
            <Sparkles /> Ask
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((x) => (
            <Button key={x} variant="outline" size="sm" onClick={() => ask(x)} data-testid="copilot-example">
              {x}
            </Button>
          ))}
        </div>
        {offline && (
          <p className="mt-3 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <KeyRound className="size-4" aria-hidden />
            {health?.llm_disabled
              ? `AI is offline: ${health.llm_disabled}. Everything else in ResQflow keeps working.`
              : 'Offline mode: answering needs an API key. Everything else in ResQflow works without one.'}
          </p>
        )}
      </Section>
      <div className="space-y-4 lg:col-span-12" data-testid="copilot-history">
        {list.length === 0 && loaded && (
          <Card>
            <CardContent>
              <Empty icon={Sparkles} title="No questions yet">
                Try one of the examples above. Every question and answer is saved here.
              </Empty>
            </CardContent>
          </Card>
        )}
        {list.map((m) => (
          <Message key={m.id} m={m} />
        ))}
      </div>
    </PageGrid>
  )
}
