import { KeyRound, Loader2, Lock, Search, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api, type CopilotAnswer } from '../../api'
import { Empty, PageGrid, Section, StatCard, StatGrid } from '../../components/app/blocks'
import { useStore } from '../../store'

const EXAMPLES = ['Why isn’t Morigaon getting supplies?', 'What happens if NH-27 also floods?', 'Which camp is at most risk tonight?']

export function OfficerAsk() {
  const health = useStore((s) => s.health)
  const setHealth = useStore((s) => s.setHealth)
  useEffect(() => {
    api.health().then(setHealth, () => undefined) // the key may have been disabled since load (e.g. no credits)
  }, [setHealth])
  const toast = useStore((s) => s.toast)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [answers, setAnswers] = useState<(CopilotAnswer & { q: string })[]>([])
  const offline = health?.llm_provider === 'mock' || !!health?.llm_disabled
  const ask = (question: string) => {
    if (!question.trim() || busy) return
    setBusy(true)
    api
      .copilot(question)
      .then((a) => setAnswers((xs) => [{ q: question, ...a }, ...xs]))
      .catch((e: unknown) => toast(String(e), 'error'))
      .finally(() => {
        setBusy(false)
        setQ('')
      })
  }
  const lookups = answers.reduce((n, a) => n + (a.tools_used?.length ?? 0), 0)
  return (
    <PageGrid>
      <StatGrid>
        <StatCard label="AI model" value={<span className="text-lg">{health?.llm_disabled ? 'AI offline' : offline ? 'Needs API key' : (health?.llm_model ?? '—')}</span>} sub={offline ? 'running in offline mode' : 'answers from live data'} icon={offline ? KeyRound : Sparkles} tone={offline ? 'amber' : 'blue'} />
        <StatCard label="Access" value="Read-only" sub="it can look things up, never change them" icon={Lock} tone="green" />
        <StatCard label="Questions asked" value={answers.length} sub="this session" icon={Search} tone="blue" />
        <StatCard label="Live lookups used" value={lookups} sub="every fact comes from a lookup" icon={Search} tone="blue" />
      </StatGrid>
      <Section title="Ask a question" description="In English or Assamese. The answer shows which live lookups it used." className="lg:col-span-12">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            ask(q)
          }}
        >
          <Input placeholder="e.g. Which camps run out of water before midnight?" value={q} onChange={(e) => setQ(e.target.value)} data-testid="copilot-input" aria-label="Question" />
          <Button type="submit" disabled={busy || !q.trim()} data-testid="copilot-ask">
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Ask
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((x) => (
            <Button key={x} variant="outline" size="sm" disabled={busy} onClick={() => ask(x)} data-testid="copilot-example">
              {x}
            </Button>
          ))}
        </div>
        {offline && (
          <p className="mt-3 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <KeyRound className="size-4" aria-hidden />
            {health?.llm_disabled
              ? `AI is offline: ${health.llm_disabled}. Everything else in RahatNet keeps working.`
              : 'Offline mode: answering needs an API key. Everything else in RahatNet works without one.'}
          </p>
        )}
      </Section>
      <div className="space-y-4 lg:col-span-12">
        {busy && (
          <Card className="py-4">
            <CardContent className="flex items-center gap-2 px-4 text-sm text-slate-600">
              <Loader2 className="size-4 animate-spin" /> Looking at the live situation…
            </CardContent>
          </Card>
        )}
        {answers.length === 0 && !busy && (
          <Card>
            <CardContent>
              <Empty icon={Sparkles} title="No questions yet">
                Try one of the examples above.
              </Empty>
            </CardContent>
          </Card>
        )}
        {answers.map((a, i) => (
          <Card key={i} className="gap-2 py-4" data-testid="copilot-answer">
            <CardContent className="space-y-2 px-4">
              <div className="text-sm font-semibold text-slate-900">{a.q}</div>
              <p className={`text-sm leading-relaxed whitespace-pre-line ${a.needs_key ? 'text-amber-800' : 'text-slate-700'}`}>{a.answer}</p>
              {a.tools_used && a.tools_used.length > 0 && (
                <div className="flex flex-wrap gap-1.5 text-xs text-slate-500">
                  Looked up:
                  {a.tools_used.map((t, j) => (
                    <code key={j} className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                      {t.name}({Object.values(t.input).map((v) => (Array.isArray(v) ? v.join(', ') : String(v))).join(', ')})
                    </code>
                  ))}
                </div>
              )}
              {a.model && (
                <div className="text-xs text-slate-500">
                  {a.model}
                  {a.latency_ms ? ` · ${(a.latency_ms / 1000).toFixed(1)} s` : ''}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </PageGrid>
  )
}
