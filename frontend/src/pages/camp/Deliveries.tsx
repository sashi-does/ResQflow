import { CircleCheck, Clock, PackageCheck, Timer, TriangleAlert, Truck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '../../api'
import { Empty, PageGrid, RowsSkeleton, Section, StatCard } from '../../components/app/blocks'
import { FocusMap } from '../../components/app/FocusMap'
import { Pill } from '../../components/app/status'
import { fmtDuration, fmtItems, fmtNum } from '../../lib/format'
import { truckLabel, useNames } from '../../lib/names'
import { useStore } from '../../store'
import type { LatLon, Order, Supplies } from '../../types'
import { useMyCamp } from './common'

const LABEL: Record<keyof Supplies, string> = { water_l: 'Water (L)', food_rations: 'Food (rations)', medical_kits: 'Medical kits' }

function Receipt({ o }: { o: Order }) {
  const receipt = useStore((s) => s.receipts[o.id])
  const toast = useStore((s) => s.toast)
  const names = useNames()
  const [vals, setVals] = useState<Supplies>(o.items)
  const [busy, setBusy] = useState(false)
  const short = receipt && Object.values(receipt.shortfall).some((v) => v > 0)
  return (
    <Card className="py-4" data-testid="delivery-check">
      <CardContent className="space-y-3 px-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-900">{truckLabel(o.truck_id)}</span>
          <span className="text-sm text-slate-500">from {names.warehouse(o.warehouse_id)}</span>
          {receipt ? (
            short ? (
              <Pill tone="amber" className="ml-auto">Short: {fmtItems(receipt.shortfall)}</Pill>
            ) : (
              <Pill tone="green" icon={CircleCheck} className="ml-auto">Received in full</Pill>
            )
          ) : (
            <Pill tone="blue" className="ml-auto">Arrived: please confirm</Pill>
          )}
        </div>
        <div className="text-sm text-slate-600">Sent: {fmtItems(o.items)}</div>
        {!receipt && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(LABEL) as (keyof Supplies)[]).map((k) => (
                <div key={k} className="grid gap-1">
                  <Label htmlFor={`${o.id}-${k}`} className="text-xs">
                    {LABEL[k]}
                  </Label>
                  <Input id={`${o.id}-${k}`} type="number" min={0} value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: Number(e.target.value) })} />
                </div>
              ))}
            </div>
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 sm:w-auto"
              disabled={busy}
              data-testid="confirm-received"
              onClick={() => {
                setBusy(true)
                api
                  .confirmDelivery(o.camp_id, o.id, vals)
                  .then((r) => {
                    const sf = Object.values(r.shortfall).some((v) => v > 0)
                    toast(sf ? `Shortfall reported: ${fmtItems(r.shortfall)}` : 'Delivery confirmed. Thank you.', sf ? 'warn' : 'ok')
                    useStore.setState((st) => ({ receipts: { ...st.receipts, [o.id]: { received: vals, shortfall: r.shortfall } } }))
                  })
                  .catch((e: unknown) => toast(String(e), 'error'))
                  .finally(() => setBusy(false))
              }}
            >
              Confirm received
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function CampDeliveries() {
  const { id, incoming, camp } = useMyCamp()
  const sim = useStore((s) => s.sim)
  const alerts = useStore((s) => s.alerts)
  const scenario = useStore((s) => s.scenario)
  const names = useNames()
  const [delivered, setDelivered] = useState<Order[] | null>(null)
  const stockKey = camp?.stock.water_l ?? 0
  useEffect(() => {
    api
      .ordersAll()
      .then((os) => setDelivered(os.filter((o) => o.camp_id === id && o.status === 'delivered').reverse()))
      .catch(() => setDelivered([]))
  }, [id, stockKey])
  const receipts = useStore((s) => s.receipts)
  const node = scenario?.nodes.find((n) => n.id === scenario.camps.find((c) => c.id === id)?.node_id)
  const here: LatLon | null = node ? [node.lat, node.lon] : null
  const delays = alerts.filter((a) => a.kind === 'delay')
  const unconfirmed = (delivered ?? []).filter((o) => !receipts[o.id]).length
  return (
    <PageGrid>
      <div className="grid grid-cols-2 gap-4 lg:col-span-12 lg:grid-cols-4">
        <StatCard label="Trucks on the way" value={incoming.length} icon={Truck} tone="blue" />
        <StatCard
          label="Next arrival"
          value={(() => {
            const etas = incoming.map((t) => t.eta_sim_seconds).filter((x): x is number => !!x)
            return etas.length && sim ? fmtDuration((Math.min(...etas) - sim.sim_seconds) / 60) : '—'
          })()}
          icon={Timer}
          tone="blue"
        />
        <StatCard label="Delivered" value={delivered?.length ?? '—'} icon={PackageCheck} tone="green" />
        <StatCard label="Waiting for your check" value={unconfirmed} icon={Clock} tone={unconfirmed ? 'amber' : 'green'} />
      </div>
      <Section title="Incoming trucks" description="Live ETAs. If a road floods, the truck is re-routed and the new ETA shows here." className="lg:col-span-7">
        {incoming.length === 0 ? (
          <Empty icon={Truck} title="No trucks on the way right now" />
        ) : (
          <ul className="divide-y">
            {incoming.map((t) => {
              const delay = delays.find((a) => a.truck_id === t.id && a.order_id === t.job?.order_id)
              return (
                <li key={t.id} className="py-3" data-testid="incoming-truck">
                  <div className="flex items-center gap-3 text-sm">
                    <Truck className="size-4 text-blue-600" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900">{truckLabel(t.id)}</div>
                      <div className="text-slate-500">
                        {t.job ? fmtItems(t.job.items) : ''} · from {t.job ? names.node(t.job.from) : ''}
                      </div>
                    </div>
                    <div className="text-right font-semibold text-blue-700 tnum">
                      {t.status === 'loading' ? 'Loading' : t.eta_sim_seconds && sim ? `ETA ${fmtDuration((t.eta_sim_seconds - sim.sim_seconds) / 60)}` : 'On the road'}
                    </div>
                  </div>
                  {delay && (
                    <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="delay-note">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {delay.en}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Section>
      <div className="lg:col-span-5">{here && <FocusMap focus={[here, ...incoming.map((t) => [t.lat, t.lon] as LatLon)]} ring={here} className="h-80" />}</div>
      <Section title="Received deliveries" description={`Confirm what actually arrived. A shortfall is corrected in your stock and flagged to the District Officer. ${fmtNum(delivered?.length ?? 0)} so far.`} className="lg:col-span-12">
        {delivered === null ? (
          <RowsSkeleton />
        ) : delivered.length === 0 ? (
          <Empty icon={PackageCheck} title="No deliveries yet" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {delivered.map((o) => (
              <Receipt key={o.id} o={o} />
            ))}
          </div>
        )}
      </Section>
    </PageGrid>
  )
}
