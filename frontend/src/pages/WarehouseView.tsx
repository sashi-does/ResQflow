import { useCallback, useState } from 'react'
import { api } from '../api'
import { Activity, FocusMap, Panel, RolePage } from '../components/RoleLayout'
import { TRUCK_COLORS, TRUCK_STATUS_LABEL, fmtItems, fmtNum, shortName } from '../lib/format'
import { useStore } from '../store'
import type { LogEntry, Supplies } from '../types'

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
  const myOrders = Object.values(orders).filter((o) => o.warehouse_id === warehouseId)
  const orderIds = new Set(myOrders.map((o) => o.id))
  const name = def ? shortName(def.name) : warehouseId
  const match = useCallback(
    (e: LogEntry) => e.refs.order_ids.some((id) => orderIds.has(id)) || e.summary.includes(name),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name, [...orderIds].join(',')],
  )
  const node = scenario?.nodes.find((n) => n.id === def?.node_id)
  if (!def || !wh || !node) return <div className="flex flex-1 items-center justify-center text-slate-400">Loading…</div>
  const queue = myOrders.filter((o) => o.status === 'awaiting_approval' || o.status === 'dispatched')
  const here = Object.values(trucks).filter((t) => t.at_warehouse === warehouseId)
  const campName = (id: string) => shortName(scenario?.camps.find((c) => c.id === id)?.name ?? id)

  return (
    <RolePage
      icon="🏭"
      role="Warehouse Manager"
      title={`${def.name} warehouse`}
      meta={`${def.id} · ${here.length} truck${here.length === 1 ? '' : 's'} on site · ${queue.length} order${queue.length === 1 ? '' : 's'} in queue`}
      about="Stock against the 20% safety reserve, the loading queue and stock adjustments. An adjustment updates both the agentic and the static run, and the coordinator re-plans."
    >
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 p-6 lg:grid-cols-12">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-12">
          {ROWS.map((r) => {
            const initial = def.stock[r.key]
            const pct = Math.min(100, (100 * wh.stock[r.key]) / Math.max(1, initial))
            const belowReserve = wh.stock[r.key] <= wh.reserve[r.key]
            return (
              <div key={r.key} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="flex items-center text-xs font-medium text-slate-400">
                  {r.label}
                  {belowReserve && <span className="ml-auto rounded bg-red-500/20 px-1.5 text-red-300">at reserve</span>}
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: r.color }}>
                  {fmtNum(wh.stock[r.key])}
                </div>
                <div className="relative mt-2 h-2.5 rounded bg-slate-800">
                  <span className="block h-2.5 rounded" style={{ width: `${pct}%`, background: r.color }} />
                  <span className="absolute -top-1 h-4.5 w-0.5 bg-red-400" style={{ left: '20%' }} title="safety reserve (20%)" />
                </div>
                <div className="mt-1.5 flex text-xs text-slate-500">
                  <span>free to plan {fmtNum(wh.available[r.key])}</span>
                  <span className="ml-auto">reserve {fmtNum(wh.reserve[r.key])}</span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex flex-col gap-4 lg:col-span-8">
          <Panel title={`Loading queue (${queue.length})`}>
            {queue.length === 0 ? (
              <div className="text-sm text-slate-500">Nothing queued.</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="pb-2 font-medium">Order</th>
                    <th className="pb-2 font-medium">Camp</th>
                    <th className="pb-2 font-medium">Items</th>
                    <th className="pb-2 font-medium">Truck</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((o) => {
                    const t = trucks[o.truck_id]
                    const status = o.status === 'awaiting_approval' ? 'waiting for approval' : t?.status === 'loading' ? 'loading now' : t ? TRUCK_STATUS_LABEL[t.status] : o.status
                    return (
                      <tr key={o.id} className="border-t border-slate-800">
                        <td className="py-2 font-mono text-slate-300">{o.id}</td>
                        <td className="py-2 text-white">{campName(o.camp_id)}</td>
                        <td className="py-2 text-slate-300">{fmtItems(o.items)}</td>
                        <td className="py-2 text-slate-300">{o.truck_id}</td>
                        <td className={`py-2 ${o.status === 'awaiting_approval' ? 'text-amber-300' : 'text-sky-300'}`}>{status}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel title={`Trucks on site (${here.length})`}>
            {here.length === 0 ? (
              <div className="text-sm text-slate-500">No trucks here right now.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {here.map((t) => (
                  <span key={t.id} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm">
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: TRUCK_COLORS[t.status] }} />
                    {t.id} · <span className="text-slate-400">{TRUCK_STATUS_LABEL[t.status]}</span>
                  </span>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Activity for this warehouse">
            <Activity match={match} empty="No agent activity for this warehouse yet." />
          </Panel>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-4">
          <Panel title="Stock adjustment">
            <div className="grid grid-cols-3 gap-2">
              {ROWS.map((r) => (
                <label key={r.key} className="text-xs text-slate-400">
                  {r.label}
                  <input
                    type="number"
                    value={delta[r.key]}
                    onChange={(e) => setDelta({ ...delta, [r.key]: Number(e.target.value) })}
                    className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                  />
                </label>
              ))}
            </div>
            <label className="mt-3 block text-xs text-slate-400">
              Note
              <input
                className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button
              className="btn-primary mt-3 w-full py-2"
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
          </Panel>
          <FocusMap focus={[[node.lat, node.lon]]} ring={[node.lat, node.lon]} className="h-80" />
        </div>
      </div>
    </RolePage>
  )
}
