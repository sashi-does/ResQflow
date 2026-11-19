import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { Card, PhoneFrame } from '../components/PhoneFrame'
import { CAMP_COLORS, fmtDuration, fmtItems, fmtNum, shortName } from '../lib/format'
import { useStore } from '../store'
import type { DemoReport, FieldReport, Order, Supplies } from '../types'

const ITEM_LABEL: Record<keyof Supplies, string> = { water_l: 'Water (L)', food_rations: 'Food (rations)', medical_kits: 'Medical kits' }
const STATUS_TEXT: Record<FieldReport['status'], string> = {
  processing: 'AI is reading…',
  applied: 'Applied',
  pending_confirmation: 'Waiting for Command to confirm',
  unparsed: 'Flagged for a human to read',
  rejected: 'Rejected by Command',
  confirmed: 'Confirmed by Command',
}

interface SpeechRec {
  lang: string
  interimResults: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  start: () => void
}

function speechCtor(): (new () => SpeechRec) | null {
  const w = window as unknown as Record<string, unknown>
  return ((w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => SpeechRec) | undefined) ?? null
}

function ReportCard({ r }: { r: FieldReport }) {
  const tone = r.status === 'applied' || r.status === 'confirmed' ? 'ok' : r.status === 'rejected' ? 'bad' : 'warn'
  return (
    <div className={`mt-2 rounded-lg border p-2 text-xs ${tone === 'ok' ? 'border-emerald-500/40' : tone === 'bad' ? 'border-red-500/40' : 'border-amber-500/40'}`} data-testid="field-report">
      <div className="flex items-center gap-2 text-[10px] text-slate-400">
        <span className="font-mono">{r.sim_time}</span>
        <span className="ml-auto font-semibold" data-testid="field-report-status">{STATUS_TEXT[r.status]}</span>
      </div>
      <p className="mt-1 text-slate-200">“{r.text}”</p>
      {r.parsed && (
        <div className="mt-1.5 rounded bg-slate-900 p-1.5 text-slate-300">
          <div className="text-[10px] text-pink-300">
            Field Intake AI read it as
            {r.source === 'recorded' ? ' (recorded AI response, offline demo)' : r.model ? ` (${r.model})` : ''} ·{' '}
            {Math.round(r.parsed.confidence * 100)}% sure
          </div>
          {r.changes.length > 0 && <div>Changes: {r.changes.join(', ')}</div>}
          {r.parsed.urgent_needs.length > 0 && <div>Urgent: {r.parsed.urgent_needs.join(', ')}</div>}
          {r.parsed.health_flags.length > 0 && <div>Health: {r.parsed.health_flags.join(', ')}</div>}
        </div>
      )}
      {r.reasons.length > 0 && <div className="mt-1 text-amber-300">{r.reasons.join(' · ')}</div>}
    </div>
  )
}

function DeliveryCheck({ o }: { o: Order }) {
  const receipt = useStore((s) => s.receipts[o.id])
  const toast = useStore((s) => s.toast)
  const [vals, setVals] = useState<Supplies>(o.items)
  if (receipt) {
    const short = Object.values(receipt.shortfall).some((v) => v > 0)
    return (
      <div className="mt-2 text-xs text-slate-300">
        {o.id} ({o.truck_id}): {short ? <span className="text-amber-300">short by {fmtItems(receipt.shortfall)}</span> : 'received in full ✓'}
      </div>
    )
  }
  return (
    <div className="mt-2 rounded-lg border border-slate-700 p-2 text-xs" data-testid="delivery-check">
      <div className="text-slate-300">
        {o.id} from truck {o.truck_id}: expected {fmtItems(o.items)}
      </div>
      <div className="mt-1 grid grid-cols-3 gap-1">
        {(Object.keys(ITEM_LABEL) as (keyof Supplies)[]).map((k) => (
          <label key={k} className="text-[10px] text-slate-400">
            {ITEM_LABEL[k]}
            <input
              type="number"
              min={0}
              value={vals[k]}
              onChange={(e) => setVals({ ...vals, [k]: Number(e.target.value) })}
              className="w-full rounded border border-slate-700 bg-slate-900 px-1 text-slate-100"
            />
          </label>
        ))}
      </div>
      <button
        className="btn-approve mt-1.5 w-full"
        onClick={() =>
          api
            .confirmDelivery(o.camp_id, o.id, vals)
            .then((r) => {
              const short = Object.values(r.shortfall).some((v) => v > 0)
              toast(short ? `Shortfall reported: ${fmtItems(r.shortfall)}` : 'Delivery confirmed', short ? 'warn' : 'ok')
              useStore.setState((st) => ({ receipts: { ...st.receipts, [o.id]: { received: vals, shortfall: r.shortfall } } }))
            })
            .catch((e: unknown) => toast(String(e), 'error'))
        }
      >
        Confirm delivery received
      </button>
    </div>
  )
}

export function CampView({ campId }: { campId: string }) {
  const scenario = useStore((s) => s.scenario)
  const camp = useStore((s) => s.camps[campId])
  const trucks = useStore((s) => s.trucks)
  const sim = useStore((s) => s.sim)
  const reports = useStore((s) => s.fieldReports)
  const health = useStore((s) => s.health)
  const toast = useStore((s) => s.toast)
  const def = scenario?.camps.find((c) => c.id === campId)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [examples, setExamples] = useState<DemoReport[]>([])
  const [delivered, setDelivered] = useState<Order[]>([])
  const [listening, setListening] = useState(false)

  useEffect(() => {
    api.demoReports().then(setExamples).catch(() => setExamples([]))
  }, [])
  const deliveredKey = camp?.stock.water_l ?? 0
  useEffect(() => {
    api
      .ordersAll()
      .then((os) => setDelivered(os.filter((o) => o.camp_id === campId && o.status === 'delivered').slice(-3)))
      .catch(() => setDelivered([]))
  }, [campId, deliveredKey])

  const mine = useMemo(
    () => Object.values(reports).filter((r) => r.camp_id === campId).sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true })),
    [reports, campId],
  )
  const incoming = Object.values(trucks).filter((t) => t.job?.camp_id === campId && t.job.status === 'dispatched')
  if (!def || !camp) return <PhoneFrame caption="">Loading…</PhoneFrame>
  const level = camp.cut_off ? 'cut_off' : camp.status
  const burn = { water_l: (camp.population ?? def.population) * 3, food_rations: camp.population ?? def.population, medical_kits: (camp.population ?? def.population) / 100 }
  const Speech = speechCtor()

  const send = (t: string) => {
    if (!t.trim()) return
    setSending(true)
    api
      .sendReport(campId, t)
      .then((r) => {
        setText('')
        toast(r.status === 'applied' ? 'Report applied' : STATUS_TEXT[r.status], r.status === 'applied' ? 'ok' : 'warn')
      })
      .catch((e: unknown) => toast(String(e), 'error'))
      .finally(() => setSending(false))
  }
  const listen = (lang: string) => {
    if (!Speech) return
    const rec = new Speech()
    rec.lang = lang
    rec.interimResults = false
    rec.onresult = (e) => setText((prev) => `${prev} ${e.results[0][0].transcript}`.trim())
    rec.onend = () => setListening(false)
    setListening(true)
    rec.start()
  }

  return (
    <PhoneFrame
      caption={
        <>
          <p className="text-base font-semibold text-slate-200">Camp Coordinator</p>
          <p className="mt-2">
            What the coordinator at {shortName(def.name)} sees on their phone. They write the way people write, in English or Assamese.
            The <span className="text-pink-300">Field Intake agent</span> turns it into structured updates; big changes wait for Command
            to confirm.
          </p>
          <p className="mt-2">Updates appear in the Command feed within a second.</p>
        </>
      }
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">⛺</span>
        <div>
          <div className="font-semibold text-white">{def.name}</div>
          <div className="text-[11px] text-slate-400">
            {fmtNum(camp.population ?? def.population)} people · {def.district} · {sim?.sim_time}
          </div>
        </div>
        <span className="ml-auto rounded px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: `${CAMP_COLORS[level]}33`, color: CAMP_COLORS[level] }} data-testid="camp-status">
          {camp.cut_off ? 'cut off' : camp.status}
        </span>
      </div>
      {camp.unserved_reason && <Card tone="bad">{camp.unserved_reason}</Card>}

      <Card title="Supplies left">
        {(Object.keys(ITEM_LABEL) as (keyof Supplies)[]).map((k) => {
          const days = burn[k] ? camp.stock[k] / burn[k] : 0
          const color = days < 0.5 ? CAMP_COLORS.critical : days < 1 ? CAMP_COLORS.low : CAMP_COLORS.ok
          return (
            <div key={k} className="mt-1 flex items-center gap-2 text-xs">
              <span className="w-24 text-slate-300">{ITEM_LABEL[k]}</span>
              <span className="h-2 flex-1 rounded bg-slate-800">
                <span className="block h-2 rounded" style={{ width: `${Math.min(100, (days / 1.5) * 100)}%`, background: color }} />
              </span>
              <span className="w-16 text-right tabular-nums text-slate-300">{days.toFixed(1)} d</span>
            </div>
          )
        })}
      </Card>

      <Card title="Incoming trucks">
        {incoming.length === 0 && <div className="text-xs text-slate-500">None on the way right now.</div>}
        {incoming.map((t) => (
          <div key={t.id} className="mt-1 text-xs text-slate-200">
            🚚 {t.id} · {t.job ? fmtItems(t.job.items) : ''}
            <div className="text-[11px] text-slate-400">
              {t.status === 'loading' ? 'loading' : 'on the road'}
              {t.eta_sim_seconds && sim ? ` · ETA ${fmtDuration((t.eta_sim_seconds - sim.sim_seconds) / 60)}` : ''}
            </div>
          </div>
        ))}
      </Card>

      {((camp.urgent_needs ?? []).length > 0 || (camp.health_flags ?? []).length > 0) && (
        <Card title="Flagged to Command" tone="warn">
          {(camp.urgent_needs ?? []).map((n) => (
            <div key={n} className="text-xs text-amber-200">• Need: {n}</div>
          ))}
          {(camp.health_flags ?? []).map((n) => (
            <div key={n} className="text-xs text-red-200">• Health: {n}</div>
          ))}
        </Card>
      )}

      <Card title="Send field report">
        <textarea
          className="h-24 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm text-slate-100"
          placeholder="What's happening at the camp? (English or অসমীয়া)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          data-testid="report-text"
        />
        <div className="mt-1 flex flex-wrap gap-1">
          {examples
            .filter((x) => x.camp_id === campId)
            .map((x) => (
              <button key={x.id} className="btn-chip" onClick={() => setText(x.text)} title={x.translation}>
                Example: {x.lang === 'as' ? 'অসমীয়া' : 'English'}
              </button>
            ))}
          {Speech && (
            <>
              <button className="btn-chip" disabled={listening} onClick={() => listen('en-IN')}>
                🎤 EN
              </button>
              <button className="btn-chip" disabled={listening} onClick={() => listen('as-IN')}>
                🎤 অসমীয়া
              </button>
            </>
          )}
        </div>
        <button className="btn-primary mt-2 w-full py-2" disabled={sending || !text.trim()} onClick={() => send(text)} data-testid="send-report">
          {sending ? 'Field Intake AI is reading…' : 'Send report'}
        </button>
        {health && health.llm_provider === 'mock' && (
          <p className="mt-1 text-[10px] text-slate-500">
            Offline mode: the two example reports use recorded AI readings; other text is flagged for a human (needs an API key).
          </p>
        )}
        {mine.map((r) => (
          <ReportCard key={r.id} r={r} />
        ))}
      </Card>

      <Card title="Deliveries received">
        {delivered.length === 0 && <div className="text-xs text-slate-500">No deliveries yet.</div>}
        {delivered.map((o) => (
          <DeliveryCheck key={o.id} o={o} />
        ))}
      </Card>
    </PhoneFrame>
  )
}
