import { useState } from 'react'
import { api } from '../api'
import { fmtDuration, fmtItems, fmtKg, shortName } from '../lib/format'
import { awaitingApproval, useStore } from '../store'
import type { Order } from '../types'

function Card({ o }: { o: Order }) {
  const scenario = useStore((s) => s.scenario)
  const toast = useStore((s) => s.toast)
  const [note, setNote] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [busy, setBusy] = useState(false)
  const wh = scenario?.warehouses.find((w) => w.id === o.warehouse_id)
  const camp = scenario?.camps.find((c) => c.id === o.camp_id)

  const decide = (d: 'approve' | 'reject') => {
    setBusy(true)
    api
      .decide(o.id, d, note || undefined)
      .then((res) => {
        if (d === 'approve' && res.status === 'dispatched') toast(`Order approved. ${o.truck_id} dispatched.`, 'ok')
        else if (d === 'approve') toast(`Order ${o.id} could not go: the situation changed. See the feed.`, 'error')
        else toast(`Order ${o.id} rejected. ${o.truck_id} released.`, 'warn')
      })
      .catch((e: unknown) => toast(String(e), 'error'))
      .finally(() => setBusy(false))
  }

  return (
    <li className="approval-card rounded-lg border border-amber-500/40 bg-slate-900 p-3" data-testid="approval-card">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-slate-400">{o.id}</span>
        <span className={`rounded px-1.5 text-[10px] font-semibold uppercase ${o.priority === 'critical' ? 'bg-red-500/20 text-red-300' : 'bg-slate-700 text-slate-300'}`}>
          {o.priority}
        </span>
        <span className="ml-auto text-sm font-semibold tabular-nums text-amber-200">{fmtKg(o.weight_kg)}</span>
      </div>
      <div className="mt-1 text-[15px] font-semibold text-white">
        {shortName(wh?.name ?? o.warehouse_id)} → {shortName(camp?.name ?? o.camp_id)}
      </div>
      <div className="text-xs text-slate-400">
        Truck {o.truck_id} · road ETA {fmtDuration(o.eta_min ?? 0)} · {fmtItems(o.items)}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {o.approval_reasons.map((r) => (
          <span key={r} className="rounded bg-amber-500/15 px-1.5 py-px text-[11px] text-amber-300">
            Needs approval: {r}
          </span>
        ))}
        {o.uses_reserve && (
          <span className="rounded bg-red-500/15 px-1.5 py-px text-[11px] text-red-300">uses safety reserve</span>
        )}
      </div>
      {o.reason && <p className="mt-2 text-xs leading-relaxed text-slate-300">{o.reason}</p>}
      {rejecting && (
        <input
          className="mt-2 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
          placeholder="Optional note (e.g. send by boat instead)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      )}
      <div className="mt-3 flex gap-2">
        <button className="btn-approve flex-1" disabled={busy} onClick={() => decide('approve')}>
          Approve
        </button>
        <button
          className="btn-reject flex-1"
          disabled={busy}
          onClick={() => (rejecting ? decide('reject') : setRejecting(true))}
        >
          {rejecting ? 'Confirm reject' : 'Reject'}
        </button>
      </div>
    </li>
  )
}

export function ApprovalsList() {
  const orders = useStore((s) => s.orders)
  const list = awaitingApproval(orders)
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      {list.length === 0 ? (
        <p className="px-2 py-10 text-center text-sm text-slate-500">
          No orders waiting. Orders over 6 t, or that draw on a warehouse's safety reserve, appear here for the District
          Officer.
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((o) => (
            <Card key={o.id} o={o} />
          ))}
        </ul>
      )}
    </div>
  )
}
