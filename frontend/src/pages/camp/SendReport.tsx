import { Bot, CircleCheck, Clock, Loader2, Mic, Send, Square } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { api } from '../../api'
import type { DemoReport, FieldReport } from '../../types'
import { Empty, PageGrid, Section, StatCard } from '../../components/app/blocks'
import { Pill } from '../../components/app/status'
import { useStore } from '../../store'
import { speechCtor, transcriptOf, type SpeechRec } from '../../lib/speech'
import { ReportUnderstanding } from '../officer/FieldReports'
import { useMyCamp } from './common'

const STATUS: Record<FieldReport['status'], { tone: 'amber' | 'green' | 'red' | 'slate' | 'blue'; text: string }> = {
  processing: { tone: 'blue', text: 'AI is reading…' },
  applied: { tone: 'green', text: 'Applied' },
  pending_confirmation: { tone: 'amber', text: 'Sent to District Officer for confirmation' },
  unparsed: { tone: 'amber', text: 'Sent to District Officer to read' },
  rejected: { tone: 'slate', text: 'Not accepted by the District Officer' },
  confirmed: { tone: 'green', text: 'Confirmed by the District Officer' },
}

function ReportCard({ r, highlight, scrollTo }: { r: FieldReport; highlight?: boolean; scrollTo?: boolean }) {
  const st = STATUS[r.status]
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scrollTo) ref.current?.scrollIntoView({ block: 'start' }) // on a phone the answer is below the form
  }, [scrollTo])
  return (
    <Card ref={ref} className={highlight ? 'border-brand-200 py-4 ring-2 ring-brand-100' : 'py-4'} data-testid="field-report">
      <CardContent className="space-y-3 px-4">
        <div className="flex flex-wrap items-center gap-2">
          {highlight && (
            <span className="flex items-center gap-1 text-sm font-semibold text-brand-700">
              <Bot className="size-4" aria-hidden /> AI understood
            </span>
          )}
          <span className="text-xs text-slate-500 tnum">{r.sim_time}</span>
          <Pill tone={st.tone} className="ml-auto" testId="field-report-status">
            {st.text}
          </Pill>
        </div>
        <blockquote className="border-l-2 border-slate-200 pl-3 text-sm text-slate-700">{r.text}</blockquote>
        <div className="rounded-md bg-slate-50 p-3">
          <ReportUnderstanding r={r} />
        </div>
        {r.reasons.length > 0 && <p className="text-xs text-amber-800">Why it needs a person: {r.reasons.join(' · ')}</p>}
      </CardContent>
    </Card>
  )
}

export function CampSendReport() {
  const { id, def } = useMyCamp()
  const reports = useStore((s) => s.fieldReports)
  const health = useStore((s) => s.health)
  const toast = useStore((s) => s.toast)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [listening, setListening] = useState(false)
  const recRef = useRef<SpeechRec | null>(null) // at most one recording at a time
  const [sentId, setSentId] = useState<string | null>(null)
  const [examples, setExamples] = useState<DemoReport[]>([])
  useEffect(() => {
    api.demoReports().then(setExamples).catch(() => setExamples([]))
  }, [])
  const mine = useMemo(
    () => Object.values(reports).filter((r) => r.camp_id === id).sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true })),
    [reports, id],
  )
  const Speech = speechCtor()
  const send = () => {
    if (!text.trim()) return
    setSending(true)
    api
      .sendReport(id, text)
      .then((r) => {
        setText('')
        setSentId(r.id)
        toast(STATUS[r.status].text, r.status === 'applied' ? 'ok' : 'info')
      })
      .catch((e: unknown) => toast(String(e), 'error'))
      .finally(() => setSending(false))
  }
  const listen = (lang: string) => {
    if (!Speech || recRef.current) return
    const rec = new Speech()
    rec.lang = lang
    rec.interimResults = true // live text while speaking
    rec.continuous = false
    const before = text.trim() // what was typed before this recording: kept, never repeated
    rec.onresult = (e) => {
      // rebuild this recording's text from all its results each time (never append), so repeats can't pile up
      const heard = transcriptOf(e.results)
      setText(before ? `${before} ${heard}` : heard)
    }
    const done = () => {
      recRef.current = null
      setListening(false)
    }
    rec.onend = done
    rec.onerror = done
    recRef.current = rec
    setListening(true)
    rec.start()
  }
  const stopListening = () => recRef.current?.stop()
  useEffect(() => () => recRef.current?.stop(), []) // leaving the page ends the recording
  const [latest, ...older] = mine
  return (
    <PageGrid>
      <div className="grid grid-cols-2 gap-4 lg:col-span-12 lg:grid-cols-4">
        <StatCard label="Reports sent" value={mine.length} icon={Send} tone="blue" />
        <StatCard label="Applied" value={mine.filter((r) => r.status === 'applied' || r.status === 'confirmed').length} icon={CircleCheck} tone="green" />
        <StatCard label="Waiting for the officer" value={mine.filter((r) => r.status === 'pending_confirmation' || r.status === 'unparsed').length} icon={Clock} tone="amber" />
        <StatCard label="Last report" value={mine[0]?.sim_time ?? '—'} sub="Assamese or English" />
      </div>
      <Section title={`Report from ${def?.name ?? 'your camp'}`} description="Write the way you normally would. Numbers, needs, health problems: the AI picks them out." className="lg:col-span-7">
        <Textarea
          className="min-h-36 text-base"
          placeholder="What’s happening at the camp? (অসমীয়া or English)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          data-testid="report-text"
          aria-label="Field report"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {examples
            .filter((x) => x.camp_id === id)
            .map((x) => (
              <Button key={x.id} variant="outline" size="sm" onClick={() => setText(x.text)} title={x.translation} data-testid="example-chip">
                Example ({x.lang === 'as' ? 'অসমীয়া' : 'English'})
              </Button>
            ))}
          {Speech &&
            (listening ? (
              <Button variant="outline" size="sm" onClick={stopListening} data-testid="mic-stop" className="border-red-300 text-red-700">
                <Square className="fill-current" /> Stop (listening…)
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => listen('as-IN')} data-testid="mic-as">
                  <Mic /> অসমীয়া
                </Button>
                <Button variant="outline" size="sm" onClick={() => listen('en-IN')} data-testid="mic-en">
                  <Mic /> English
                </Button>
              </>
            ))}
          <Button className="ml-auto w-full sm:w-auto" disabled={sending || !text.trim()} onClick={send} data-testid="send-report">
            {sending ? <Loader2 className="animate-spin" /> : <Send />} {sending ? 'AI is reading…' : 'Send report'}
          </Button>
        </div>
        {health?.llm_provider === 'mock' && (
          <p className="mt-3 text-xs text-slate-500">Offline mode: the example reports use recorded AI readings; other text goes to the District Officer to read (needs an API key).</p>
        )}
      </Section>
      <div className="space-y-4 lg:col-span-5">
        {latest ? (
          <ReportCard r={latest} highlight scrollTo={sentId === latest.id} />
        ) : (
          <Card>
            <CardContent>
              <Empty icon={Bot} title="No reports yet">
                After you send one, you’ll see exactly what the AI understood, and whether it was applied or sent to the District Officer.
              </Empty>
            </CardContent>
          </Card>
        )}
        {older.map((r) => (
          <ReportCard key={r.id} r={r} />
        ))}
      </div>
    </PageGrid>
  )
}
