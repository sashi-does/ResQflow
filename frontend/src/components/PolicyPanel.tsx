import { useState } from 'react'
import { api } from '../api'
import { useStore } from '../store'

/** Command's approval policy (doc 10 A4). */
export function PolicyPanel() {
  const policy = useStore((s) => s.policy)
  const toast = useStore((s) => s.toast)
  const [open, setOpen] = useState(false)
  if (!policy) return null
  const save = (patch: Partial<typeof policy>) =>
    api
      .setPolicy({ ...policy, ...patch })
      .then(() => toast('Approval policy updated', 'info'))
      .catch((e: unknown) => toast(String(e), 'error'))
  return (
    <div className="border-b border-slate-800 px-3 py-2 text-xs" data-testid="policy-panel">
      <button className="flex w-full items-center gap-2 text-left text-slate-300" onClick={() => setOpen(!open)}>
        <span className={`h-2 w-2 rounded-full ${policy.auto_approve_critical ? 'bg-emerald-400' : 'bg-slate-500'}`} />
        Policy: auto-approve <b>critical</b> orders ≤ {policy.max_tonnes} t after {policy.delay_min} min
        {policy.auto_approve_critical ? '' : ' (off)'}
        <span className="ml-auto text-slate-500">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded border border-slate-700 bg-slate-950 p-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={policy.auto_approve_critical}
              onChange={(e) => save({ auto_approve_critical: e.target.checked })}
            />
            Auto-approve CRITICAL orders if nobody acts
          </label>
          <label className="flex items-center gap-2">
            up to
            <input
              type="number"
              min={0}
              max={20}
              step={0.5}
              className="w-16 rounded border border-slate-700 bg-slate-900 px-1"
              defaultValue={policy.max_tonnes}
              onBlur={(e) => save({ max_tonnes: Number(e.target.value) })}
            />
            t, after
            <input
              type="number"
              min={0}
              max={240}
              className="w-14 rounded border border-slate-700 bg-slate-900 px-1"
              defaultValue={policy.delay_min}
              onBlur={(e) => save({ delay_min: Number(e.target.value) })}
            />
            sim-min
          </label>
          <p className="text-slate-500">Orders that draw on a warehouse's safety reserve always need a human.</p>
        </div>
      )}
    </div>
  )
}
