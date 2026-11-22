import { Droplets, Pill as PillIcon, ShieldAlert, Utensils } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useCallback } from 'react'
import { ActivityList } from '../../components/app/ActivityList'
import { PageGrid, RowsSkeleton, Section, StatCard } from '../../components/app/blocks'
import { Pill } from '../../components/app/status'
import { fmtNum } from '../../lib/format'
import type { LogEntry, Supplies } from '../../types'
import { useMyWarehouse } from './common'

const ITEMS: { key: keyof Supplies; label: string; unit: string; icon: LucideIcon }[] = [
  { key: 'water_l', label: 'Water', unit: 'L', icon: Droplets },
  { key: 'food_rations', label: 'Food', unit: 'rations', icon: Utensils },
  { key: 'medical_kits', label: 'Medical kits', unit: 'kits', icon: PillIcon },
]

export function WarehouseStock() {
  const { wh, def } = useMyWarehouse()
  const name = def?.name ?? ''
  const match = useCallback((e: LogEntry) => !!name && e.summary.includes(name), [name])
  if (!wh || !def) return <RowsSkeleton rows={5} />
  const atReserve = wh.offline ? [] : ITEMS.filter((it) => wh.available[it.key] <= 0)
  return (
    <PageGrid>
      {wh.offline && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 lg:col-span-12" role="alert" data-testid="warehouse-offline">
          <b>Loading stopped:</b> {wh.offline_reason ?? 'the warehouse is offline'}. The agents are planning from the other warehouses until it reopens.
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 lg:col-span-12 lg:grid-cols-4">
        {ITEMS.map((it) => (
          <StatCard key={it.key} label={`${it.label} free to plan`} value={fmtNum(wh.available[it.key])} sub={`${fmtNum(wh.stock[it.key])} ${it.unit} on hand`} icon={it.icon} tone={wh.available[it.key] > 0 ? 'blue' : 'red'} />
        ))}
        {wh.offline ? (
          <StatCard label="Loading" value="Stopped" sub="warehouse offline: stock locked" icon={ShieldAlert} tone="red" />
        ) : (
          <StatCard label="Items at the safety reserve" value={atReserve.length} sub={atReserve.length ? atReserve.map((i) => i.label).join(', ') : 'all above reserve'} icon={ShieldAlert} tone={atReserve.length ? 'red' : 'green'} />
        )}
      </div>
      <Section title="Stock against the safety reserve" description="The red line is the 20% safety reserve. Stock below it is released only with the District Officer’s approval." className="lg:col-span-8" testId="stock-chart">
        <div className="space-y-6">
          {ITEMS.map((it) => {
            const opening = def.stock[it.key]
            const scale = Math.max(opening, wh.stock[it.key], 1)
            const committed = wh.offline ? 0 : Math.max(0, wh.stock[it.key] - wh.available[it.key] - wh.reserve[it.key])
            const locked = wh.offline ? wh.stock[it.key] : 0 // on hand but out of reach while the warehouse is offline
            const pct = (v: number) => `${(100 * v) / scale}%`
            return (
              <div key={it.key}>
                <div className="mb-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                  <span className="font-semibold text-slate-900">{it.label}</span>
                  <span className="text-slate-600 tnum">On hand {fmtNum(wh.stock[it.key])}</span>
                  <span className="text-amber-700 tnum">Committed {fmtNum(committed)}</span>
                  <span className="text-brand-700 tnum">Available {fmtNum(wh.available[it.key])}</span>
                  <span className="text-slate-500 tnum">Reserve {fmtNum(wh.reserve[it.key])}</span>
                </div>
                <div className="relative flex h-6 overflow-hidden rounded-md bg-slate-100" role="img" aria-label={`${it.label}: ${fmtNum(wh.available[it.key])} available, ${fmtNum(committed)} committed, ${fmtNum(wh.reserve[it.key])} in reserve`}>
                  {locked > 0 && <div className="bg-red-300" style={{ width: pct(locked) }} title="On hand, locked while the warehouse is offline" />}
                  <div className="bg-slate-400" style={{ width: pct(wh.reserve[it.key]) }} title="Safety reserve" />
                  <div className="bg-amber-400" style={{ width: pct(committed) }} title="Committed to orders awaiting approval" />
                  <div className="bg-brand-500" style={{ width: pct(wh.available[it.key]) }} title="Available to plan" />
                  <div className="absolute inset-y-0 w-0.5 bg-red-600" style={{ left: pct(opening * 0.2) }} title="Safety reserve line (20%)" />
                </div>
              </div>
            )
          })}
          <div className="flex flex-wrap gap-4 text-xs text-slate-600">
            <span className="flex items-center gap-1.5"><i className="size-3 rounded-sm bg-slate-400" /> Safety reserve</span>
            <span className="flex items-center gap-1.5"><i className="size-3 rounded-sm bg-amber-400" /> Committed (awaiting approval)</span>
            <span className="flex items-center gap-1.5"><i className="size-3 rounded-sm bg-brand-500" /> Available to plan</span>
            <span className="flex items-center gap-1.5"><i className="h-3 w-0.5 bg-red-600" /> 20% reserve line</span>
            {wh.offline && <span className="flex items-center gap-1.5"><i className="size-3 rounded-sm bg-red-300" /> Locked (offline)</span>}
          </div>
        </div>
      </Section>
      <Section title="Restock on the way" description="Ordered by the Supply agent from the regional supplier when free stock runs low." className="lg:col-span-4" testId="restocks">
        {(wh.restocks ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">Nothing on order. The Supply agent re-orders when any item falls below 35% of opening stock.</p>
        ) : (
          <ul className="space-y-2">
            {(wh.restocks ?? []).map((r) => (
              <li key={r.id} className="rounded-md border border-slate-200 p-2.5 text-sm">
                <div className="font-medium text-slate-900">
                  {fmtNum(r.items.water_l)} L water · {fmtNum(r.items.food_rations)} food · {fmtNum(r.items.medical_kits)} kits
                </div>
                <div className="text-xs text-slate-500">
                  {r.supplier} · ordered {r.ordered_at} · arrives {r.arrives_at}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Latest at this warehouse" className="lg:col-span-4">
        <ActivityList match={match} limit={8} empty="No activity yet." />
        <div className="mt-3">
          <Pill tone="slate">Opening stock: {fmtNum(def.stock.water_l)} L water</Pill>
        </div>
      </Section>
    </PageGrid>
  )
}
