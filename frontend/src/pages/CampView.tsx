import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { Activity, FocusMap, Panel, RolePage, Stat } from '../components/RoleLayout'
import { CAMP_COLORS, fmtDuration, fmtItems, fmtNum, shortName } from '../lib/format'
import { useStore } from '../store'
import type { DemoReport, FieldReport, LatLon, LogEntry, Order, Supplies } from '../types'

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
    <div className={`rounded-lg border p-3 text-sm ${tone === 'ok' ? 'border-emerald-500/40' : tone === 'bad' ? 'border-red-500/40' : 'border-amber-500/40'}`} data-testid="field-report">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span className="font-mono">{r.sim_time}</span>
        <span className="ml-auto font-semibold" data-testid="field-report-status">{STATUS_TEXT[r.status]}</span>
      </div>
      <p className="mt-1.5 text-slate-100">“{r.text}”</p>
      {r.parsed && (
        <div className="mt-2 rounded-md bg-slate-950 p-2.5 text-slate-300">
          <div className="mb-1 text-xs text-pink-300">
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
      <div className="text-sm text-slate-300">
        {o.id} ({o.truck_id}): {short ? <span className="text-amber-300">short by {fmtItems(receipt.shortfall)}</span> : 'received in full ✓'}
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-slate-700 p-3 text-sm" data-testid="delivery-check">
      <div className="text-slate-300">
        {o.id} from truck {o.truck_id}: expected {fmtItems(o.items)}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {(Object.keys(ITEM_LABEL) as (keyof Supplies)[]).map((k) => (
          <label key={k} className="text-xs text-slate-400">
            {ITEM_LABEL[k]}
            <input
              type="number"
              min={0}
              value={vals[k]}
              onChange={(e) => setVals({ ...vals, [k]: Number(e.target.value) })}
              className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            />
          </label>
        ))}
      </div>
      <button
        className="btn-approve mt-2"
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
      .then((os) => setDelivered(os.filter((o) => o.camp_id === campId && o.status === 'delivered').slice(-5).reverse()))
      .catch(() => setDelivered([]))
  }, [campId, deliveredKey])

  const mine = useMemo(
    () => Object.values(reports).filter((r) => r.camp_id === campId).sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true })),
    [reports, campId],
  )
  const match = useCallback((e: LogEntry) => e.refs.camp_ids.includes(campId), [campId])
  const incoming = Object.values(trucks).filter((t) => t.job?.camp_id === campId && t.job.status === 'dispatched')
  const node = scenario?.nodes.find((n) => n.id === def?.node_id)
  if (!def || !camp || !node) return <div className="flex flex-1 items-center justify-center text-slate-400">Loading…</div>
  const here: LatLon = [node.lat, node.lon]
  const level = camp.cut_off ? 'cut_off' : camp.status
  const pop = camp.population ?? def.population
  const burn = { water_l: pop * 3, food_rations: pop, medical_kits: pop / 100 }
  const Speech = speechCtor()
  const truckPts = incoming.map((t) => [t.lat, t.lon] as LatLon)

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
    <RolePage
      icon="⛺"
      role="Camp Coordinator"
      title={def.name}
      meta={`${def.district} · ${shortName(def.name)} · ${sim?.sim_time ?? ''}`}
      badge={
        <span
          className="rounded-md px-2.5 py-1 text-xs font-bold uppercase"
          style={{ background: `${CAMP_COLORS[level]}26`, color: CAMP_COLORS[level] }}
          data-testid="camp-status"
        >
          {camp.cut_off ? 'cut off' : camp.status}
        </span>
      }
      about="Write the way people write, in English or Assamese. The Field Intake agent turns it into structured updates; big changes wait for Command to confirm."
    >
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 p-6 lg:grid-cols-12">
        {camp.unserved_reason && (
          <div className="rounded-xl border border-red-500/50 bg-red-950/40 px-4 py-3 text-sm text-red-200 lg:col-span-12">{camp.unserved_reason}</div>
        )}

        <div className="grid grid-cols-2 gap-4 lg:col-span-12 lg:grid-cols-4">
          <Stat label="People in camp" value={fmtNum(pop)} sub={`${def.district} district`} />
          {(Object.keys(ITEM_LABEL) as (keyof Supplies)[]).map((k) => {
            const days = burn[k] ? camp.stock[k] / burn[k] : 0
            const color = days < 0.5 ? CAMP_COLORS.critical : days < 1 ? CAMP_COLORS.low : CAMP_COLORS.ok
            return (
              <Stat
                key={k}
                label={`${ITEM_LABEL[k]} left`}
                value={`${days.toFixed(1)} days`}
                color={color}
                pct={(days / 1.5) * 100}
                sub={`${fmtNum(camp.stock[k])} in stock · uses ${fmtNum(burn[k])}/day`}
              />
            )
          })}
        </div>

        <div className="flex flex-col gap-4 lg:col-span-7">
          <Panel title="Send field report" action={<span className="text-xs text-pink-300">Field Intake AI</span>}>
            <textarea
              className="h-32 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              placeholder="What's happening at the camp? (English or অসমীয়া)"
              value={text}
              onChange={(e) => setText(e.target.value)}
              data-testid="report-text"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
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
              <button className="btn-primary ml-auto px-6 py-2" disabled={sending || !text.trim()} onClick={() => send(text)} data-testid="send-report">
                {sending ? 'Field Intake AI is reading…' : 'Send report'}
              </button>
            </div>
            {health && health.llm_provider === 'mock' && (
              <p className="mt-2 text-xs text-slate-500">
                Offline mode: the example reports use recorded AI readings; other text is flagged for a human (needs an API key).
              </p>
            )}
          </Panel>

          <Panel title={`Reports from this camp (${mine.length})`}>
            {mine.length === 0 && <div className="text-sm text-slate-500">No reports sent yet.</div>}
            <div className="space-y-3">
              {mine.map((r) => (
                <ReportCard key={r.id} r={r} />
              ))}
            </div>
          </Panel>

          <Panel title="Deliveries received">
            {delivered.length === 0 && <div className="text-sm text-slate-500">No deliveries yet.</div>}
            <div className="space-y-3">
              {delivered.map((o) => (
                <DeliveryCheck key={o.id} o={o} />
              ))}
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-5">
          <FocusMap focus={[here, ...truckPts]} ring={here} className="h-80" />

          <Panel title={`Incoming trucks (${incoming.length})`}>
            {incoming.length === 0 && <div className="text-sm text-slate-500">None on the way right now.</div>}
            <table className="w-full text-sm">
              <tbody>
                {incoming.map((t) => (
                  <tr key={t.id} className="border-b border-slate-800 last:border-0">
                    <td className="py-2 font-semibold text-white">🚚 {t.id}</td>
                    <td className="py-2 text-slate-300">{t.job ? fmtItems(t.job.items) : ''}</td>
                    <td className="py-2 text-right text-sky-300">
                      {t.status === 'loading' ? 'loading' : t.eta_sim_seconds && sim ? `ETA ${fmtDuration((t.eta_sim_seconds - sim.sim_seconds) / 60)}` : 'on the road'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          {((camp.urgent_needs ?? []).length > 0 || (camp.health_flags ?? []).length > 0) && (
            <Panel title="Flagged to Command" tone="warn">
              {(camp.urgent_needs ?? []).map((n) => (
                <div key={n} className="text-sm text-amber-200">• Need: {n}</div>
              ))}
              {(camp.health_flags ?? []).map((n) => (
                <div key={n} className="text-sm text-red-200">• Health: {n}</div>
              ))}
            </Panel>
          )}

          <Panel title="Activity for this camp">
            <Activity match={match} empty="No agent activity for this camp yet." />
          </Panel>
        </div>
      </div>
    </RolePage>
  )
}
