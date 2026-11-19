import { Droplets, PackagePlus, Pill as PillIcon, Utensils } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '../../api'
import { ActivityList } from '../../components/app/ActivityList'
import { PageGrid, Section, StatCard } from '../../components/app/blocks'
import { fmtNum } from '../../lib/format'
import { useStore } from '../../store'
import type { LogEntry, Supplies } from '../../types'
import { useMyWarehouse } from './common'

export function WarehouseReceive() {
  const { id, wh, def } = useMyWarehouse()
  const toast = useStore((s) => s.toast)
  const [vals, setVals] = useState<Supplies>({ water_l: 20000, food_rations: 0, medical_kits: 0 })
  const [from, setFrom] = useState('Guwahati State Hub')
  const [busy, setBusy] = useState(false)
  const name = def?.name ?? ''
  const received = useCallback((e: LogEntry) => e.kind === 'stock.adjusted' && !!name && e.summary.includes(name), [name])
  const set = (k: keyof Supplies) => (e: React.ChangeEvent<HTMLInputElement>) => setVals({ ...vals, [k]: Math.max(0, Number(e.target.value)) })
  const receivedCount = useStore((s) => s.log.filter(received).length)
  const empty = !vals.water_l && !vals.food_rations && !vals.medical_kits
  return (
    <PageGrid>
      <div className="grid grid-cols-2 gap-4 lg:col-span-12 lg:grid-cols-4">
        <StatCard label="Water on hand" value={wh ? fmtNum(wh.stock.water_l) : '—'} sub="litres" icon={Droplets} tone="blue" />
        <StatCard label="Food on hand" value={wh ? fmtNum(wh.stock.food_rations) : '—'} sub="rations" icon={Utensils} tone="blue" />
        <StatCard label="Medical kits on hand" value={wh ? fmtNum(wh.stock.medical_kits) : '—'} icon={PillIcon} tone="blue" />
        <StatCard label="Consignments logged" value={receivedCount} icon={PackagePlus} tone="green" />
      </div>
      <Section title="Log an incoming consignment" description="Availability updates immediately and the AI coordinator re-plans with the new stock." className="lg:col-span-6" testId="receive-form">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            setBusy(true)
            api
              .adjustStock(id, vals, `Received from ${from}`)
              .then(() => toast('Stock received. The coordinator will re-plan.', 'ok'))
              .catch((err: unknown) => toast(String(err), 'error'))
              .finally(() => setBusy(false))
          }}
        >
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="rw">Water (L)</Label>
              <Input id="rw" type="number" min={0} step={1000} value={vals.water_l} onChange={set('water_l')} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rf">Food (rations)</Label>
              <Input id="rf" type="number" min={0} step={100} value={vals.food_rations} onChange={set('food_rations')} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rm">Medical kits</Label>
              <Input id="rm" type="number" min={0} step={10} value={vals.medical_kits} onChange={set('medical_kits')} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="from">Received from</Label>
            <Input id="from" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <Button type="submit" disabled={busy || empty} data-testid="adjust-stock">
            <PackagePlus /> Record consignment
          </Button>
        </form>
      </Section>
      <Section title="Consignments received" className="lg:col-span-6">
        <ActivityList match={received} limit={10} empty="No consignments logged yet." />
      </Section>
    </PageGrid>
  )
}
