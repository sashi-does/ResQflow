import { useState } from 'react'
import { api } from '../api'
import { Card, PhoneFrame } from '../components/PhoneFrame'
import { fmtItems, fmtNum, shortName } from '../lib/format'
import { useStore } from '../store'
import type { Supplies } from '../types'

const ROWS: { key: keyof Supplies; label: string; color: string }[] = [
  { key: 'water_l', label: 'Water (L)', color: '#38bdf8' },
  { key: 'food_rations', label: 'Food (rations)', color: '#fbbf24' },
  { key: 'medical_kits', label: 'Medical kits', color: '#f472b6' },
]

export function WarehouseView({ warehouseId }: { warehouseId: string }) {
  const scenario = useStore((s) => s.scenario)
  const wh = useStore((s) => s.warehouses[warehouseId])
  const trucks = useStore((s) => s.trucks)
  const orders = useStore((s) => s.orders)
  const toast = useStore((s) => s.toast)
  const def = scenario?.warehouses.find((w) => w.id === warehouseId)
  const [delta, setDelta] = useState<Supplies>({ water_l: 20000, food_rations: 0, medical_kits: 0 })
  const [note, setNote] = useState('Received from the State Hub')
  if (!def || !wh) return <PhoneFrame caption="">Loading…</PhoneFrame>
  const queue = Object.values(orders).filter((o) => o.warehouse_id === warehouseId && (o.status === 'awaiting_approval' || o.status === 'dispatched'))
  const here = Object.values(trucks).filter((t) => t.at_warehouse === warehouseId)

  return (
    <PhoneFrame
      caption={
        <>
          <p className="text-base font-semibold text-slate-200">Warehouse Manager</p>
          <p className="mt-2">
            Stock against the 20% safety reserve, the loading queue, and stock adjustments. An adjustment updates availability for
            both the agentic and the static run, and the coordinator re-plans.
          </p>
        </>
      }
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">🏭</span>
        <div>
          <div className="font-semibold text-white">{def.name} warehouse</div>
          <div className="text-[11px] text-slate-400">{def.id}</div>
        </div>
      </div>
      <Card title="Stock (line = safety reserve)">
        {ROWS.map((r) => {
          const initial = def.stock[r.key]
          const pct = Math.min(100, (100 * wh.stock[r.key]) / Math.max(1, initial))
          return (
            <div key={r.key} className="mt-2 text-xs">
              <div className="flex text-slate-300">
                {r.label}
                <span className="ml-auto tabular-nums">
                  {fmtNum(wh.stock[r.key])} · free {fmtNum(wh.available[r.key])}
                </span>
              </div>
              <div className="relative mt-1 h-2.5 rounded bg-slate-800">
                <span className="block h-2.5 rounded" style={{ width: `${pct}%`, background: r.color }} />
                <span className="absolute top-[-3px] h-4 w-0.5 bg-red-400" style={{ left: '20%' }} title="safety reserve (20%)" />
              </div>
            </div>
          )
        })}
      </Card>
      <Card title="Loading queue">
        {queue.length === 0 && <div className="text-xs text-slate-500">Nothing queued.</div>}
        {queue.map((o) => {
          const t = trucks[o.truck_id]
          return (
            <div key={o.id} className="mt-1 text-xs text-slate-200">
              {o.id} → {shortName(scenario?.camps.find((c) => c.id === o.camp_id)?.name ?? o.camp_id)} · {fmtItems(o.items)}
              <div className="text-[11px] text-slate-400">
                Truck {o.truck_id} · {o.status === 'awaiting_approval' ? 'waiting for approval' : t?.status === 'loading' ? 'loading now' : t?.status}
              </div>
            </div>
          )
        })}
        <div className="mt-2 text-[11px] text-slate-400">Trucks here: {here.map((t) => t.id).join(', ') || 'none'}</div>
      </Card>
      <Card title="Stock adjustment">
        <div className="grid grid-cols-3 gap-1">
          {ROWS.map((r) => (
            <label key={r.key} className="text-[10px] text-slate-400">
              {r.label}
              <input
                type="number"
                value={delta[r.key]}
                onChange={(e) => setDelta({ ...delta, [r.key]: Number(e.target.value) })}
                className="w-full rounded border border-slate-700 bg-slate-900 px-1 text-slate-100"
              />
            </label>
          ))}
        </div>
        <input
          className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          className="btn-primary mt-2 w-full"
          data-testid="adjust-stock"
          onClick={() =>
            api
              .adjustStock(warehouseId, delta, note)
              .then(() => toast('Stock updated. The coordinator will re-plan.', 'ok'))
              .catch((e: unknown) => toast(String(e), 'error'))
          }
        >
          Record adjustment
        </button>
      </Card>
    </PhoneFrame>
  )
}
