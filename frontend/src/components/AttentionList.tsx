import { api } from '../api'
import { shortName } from '../lib/format'
import { useStore } from '../store'

/** Command: things the AI or a single source proposed that need a human (doc 10 C4). */
export function AttentionList() {
  const reports = useStore((s) => s.fieldReports)
  const hazards = useStore((s) => s.hazards)
  const scenario = useStore((s) => s.scenario)
  const toast = useStore((s) => s.toast)
  const pending = Object.values(reports).filter((r) => r.status === 'pending_confirmation' || r.status === 'unparsed')
  const unverified = hazards.filter((h) => h.verified === false)
  if (pending.length === 0 && unverified.length === 0) return null
  const camp = (id: string) => shortName(scenario?.camps.find((c) => c.id === id)?.name ?? id)
  const fail = (e: unknown) => toast(String(e), 'error')
  return (
    <div className="space-y-2 border-b border-slate-800 p-3" data-testid="attention">
      <div className="text-[11px] font-semibold tracking-wider text-pink-300 uppercase">Needs a human check</div>
      {pending.map((r) => (
        <div key={r.id} className="rounded-lg border border-pink-500/40 bg-slate-900 p-2 text-xs" data-testid="attention-report">
          <div className="font-semibold text-white">
            Field report · {camp(r.camp_id)} · {r.sim_time}
          </div>
          <p className="mt-1 text-slate-300">“{r.text}”</p>
          {r.changes.length > 0 && <div className="mt-1 text-slate-200">AI proposes: {r.changes.join(', ')}</div>}
          <div className="mt-1 text-amber-300">{r.reasons.join(' · ')}</div>
          <div className="mt-2 flex gap-2">
            <button className="btn-approve flex-1" onClick={() => api.decideReport(r.id, 'confirm').then(() => toast('Field report confirmed', 'ok'), fail)}>
              Confirm
            </button>
            <button className="btn-reject flex-1" onClick={() => api.decideReport(r.id, 'reject').then(() => toast('Field report rejected', 'warn'), fail)}>
              Reject
            </button>
          </div>
        </div>
      ))}
      {unverified.map((h) => (
        <div key={h.id} className="rounded-lg border border-amber-500/40 bg-slate-900 p-2 text-xs" data-testid="attention-hazard">
          <div className="font-semibold text-white">{h.label}</div>
          <div className="text-slate-400">Reported by {(h.reported_by ?? []).join(', ')}. Not closing the road until confirmed.</div>
          <div className="mt-2 flex gap-2">
            <button className="btn-approve flex-1" onClick={() => api.confirmHazard(h.id).then(() => toast('Road closed; trucks re-routed', 'warn'), fail)}>
              Confirm closure
            </button>
            <button className="btn-reject flex-1" onClick={() => api.removeHazard(h.id).then(() => toast('Report dismissed', 'info'), fail)}>
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
