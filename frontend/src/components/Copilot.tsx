import { useState } from 'react'
import { useStore } from '../store'

interface Answer {
  q: string
  answer: string
  tools_used?: { name: string; input: Record<string, unknown> }[]
  model?: string
  latency_ms?: number | null
  needs_key?: boolean
  error?: boolean
}

const EXAMPLES = ["Why isn't Morigaon getting supplies?", 'What happens if NH-27 also floods?', 'Which camp is at most risk tonight?']

async function askCopilot(question: string): Promise<Omit<Answer, 'q'>> {
  const r = await fetch('/api/copilot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return (await r.json()) as Omit<Answer, 'q'>
}

/** "Ask RahatNet": read-only copilot for District Command (doc 10 D2). */
export function Copilot({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [answers, setAnswers] = useState<Answer[]>([])
  const toast = useStore((s) => s.toast)
  const send = (question: string) => {
    if (!question.trim() || busy) return
    setBusy(true)
    askCopilot(question)
      .then((a) => setAnswers((xs) => [{ q: question, ...a }, ...xs]))
      .catch((e: unknown) => toast(String(e), 'error'))
      .finally(() => {
        setBusy(false)
        setQ('')
      })
  }
  return (
    <div className="fixed top-12 right-0 bottom-0 z-[2500] flex w-[420px] flex-col border-l border-emerald-500/40 bg-slate-950/98 shadow-2xl" data-testid="copilot">
      <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
        <span className="text-lg">✦</span>
        <div>
          <div className="font-semibold text-white">Ask RahatNet</div>
          <div className="text-[11px] text-slate-400">Answers from live data. Read-only: it never changes anything.</div>
        </div>
        <button className="ml-auto text-slate-400 hover:text-white" onClick={onClose} aria-label="close copilot">
          ✕
        </button>
      </div>
      <div className="flex flex-wrap gap-1 px-4 pt-3">
        {EXAMPLES.map((x) => (
          <button key={x} className="btn-chip text-left" disabled={busy} onClick={() => send(x)}>
            {x}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2 px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault()
          send(q)
        }}
      >
        <input
          className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm"
          placeholder="Ask in English or অসমীয়া…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          data-testid="copilot-input"
        />
        <button className="btn-primary" disabled={busy || !q.trim()}>
          {busy ? '…' : 'Ask'}
        </button>
      </form>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
        {busy && <div className="shimmer rounded px-3 py-2 text-sm text-emerald-300">Looking at the live state…</div>}
        {answers.map((a, i) => (
          <div key={i} className="rounded-lg border border-slate-800 bg-slate-900 p-3" data-testid="copilot-answer">
            <div className="text-xs font-semibold text-slate-400">Q: {a.q}</div>
            <p className={`mt-1 text-sm leading-relaxed whitespace-pre-line ${a.needs_key ? 'text-amber-300' : 'text-slate-100'}`}>{a.answer}</p>
            {a.tools_used && a.tools_used.length > 0 && (
              <div className="mt-2 text-[11px] text-slate-500">
                Looked up:{' '}
                {a.tools_used.map((t, j) => (
                  <code key={j} className="mr-1 rounded bg-slate-800 px-1">
                    {t.name}({Object.values(t.input).map((v) => (Array.isArray(v) ? v.join(', ') : String(v))).join(', ')})
                  </code>
                ))}
              </div>
            )}
            {a.model && (
              <div className="mt-1 text-[10px] text-slate-600">
                {a.model}
                {a.latency_ms ? ` · ${(a.latency_ms / 1000).toFixed(1)}s` : ''}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
