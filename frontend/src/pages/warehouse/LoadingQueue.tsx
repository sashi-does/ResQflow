import { CircleCheck, Clock, PackageCheck, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '../../api'
import { Empty, PageGrid, Section, StatCard } from '../../components/app/blocks'
import { Pill } from '../../components/app/status'
import { fmtDuration, fmtItems, fmtKg } from '../../lib/format'
import { useNames } from '../../lib/names'
import { useStore } from '../../store'
import type { Order, TruckView } from '../../types'
import { useMyWarehouse } from './common'

function where(t: TruckView | undefined, simSeconds: number): { text: string; tone: 'amber' | 'blue' | 'green' | 'slate' } {
  if (!t) return { text: '—', tone: 'slate' }
  if (t.status === 'loading') return { text: 'At the bay, loading', tone: 'amber' }
  if (t.leg === 'reposition')
    return { text: `Coming to the warehouse${t.eta_sim_seconds ? ` · ${fmtDuration((t.eta_sim_seconds - simSeconds) / 60)}` : ''}`, tone: 'blue' }
  return { text: 'Left the warehouse', tone: 'green' }
}

export function WarehouseQueue() {
  const { id } = useMyWarehouse()
  const orders = useStore((s) => s.orders)
  const trucks = useStore((s) => s.trucks)
  const simSeconds = useStore((s) => s.sim?.sim_seconds ?? 0)
  const toast = useStore((s) => s.toast)
  const names = useNames()
  const mine = Object.values(orders).filter((o) => o.warehouse_id === id)
  const byTime = (a: Order, b: Order) => a.created_at_sim - b.created_at_sim || a.id.localeCompare(b.id, undefined, { numeric: true })
  const queue = mine.filter((o) => o.status === 'dispatched').sort(byTime)
  const waiting = mine.filter((o) => o.status === 'awaiting_approval').sort(byTime)
  const toLoad = queue.filter((o) => !o.loaded_confirmed)
  return (
    <PageGrid>
      <div className="grid grid-cols-2 gap-4 lg:col-span-12 lg:grid-cols-4">
        <StatCard label="To load" value={toLoad.length} icon={Truck} tone={toLoad.length ? 'amber' : 'green'} testId="stat-to-load" />
        <StatCard label="At the bay now" value={queue.filter((o) => trucks[o.truck_id]?.status === 'loading').length} icon={Clock} tone="amber" />
        <StatCard label="Marked loaded" value={queue.filter((o) => o.loaded_confirmed).length} icon={PackageCheck} tone="green" />
        <StatCard label="Waiting for approval" value={waiting.length} sub="District Officer" icon={Clock} tone="blue" />
      </div>
      <Section title="Loading queue" description="Approved orders for this warehouse, in pickup order." className="lg:col-span-12" testId="loading-queue">
        {queue.length === 0 ? (
          <Empty icon={Truck} title="Nothing to load right now">
            Approved orders appear here as soon as the District Officer (or the approval policy) releases them.
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Truck</TableHead>
                <TableHead>For</TableHead>
                <TableHead>Load</TableHead>
                <TableHead>Where is the truck</TableHead>
                <TableHead className="text-right">Loaded?</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((o) => {
                const w = where(trucks[o.truck_id], simSeconds)
                return (
                  <TableRow key={o.id} data-testid="queue-row">
                    <TableCell className="font-medium">{names.truck(o.truck_id)}</TableCell>
                    <TableCell>{names.camp(o.camp_id)}</TableCell>
                    <TableCell>
                      {fmtItems(o.items)} <span className="text-slate-500">({fmtKg(o.weight_kg)})</span>
                    </TableCell>
                    <TableCell>
                      <Pill tone={w.tone}>{w.text}</Pill>
                    </TableCell>
                    <TableCell className="text-right">
                      {o.loaded_confirmed ? (
                        <Pill tone="green" icon={CircleCheck}>Loaded</Pill>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() =>
                            api
                              .markLoaded(o.id)
                              .then(() => toast(`${names.truck(o.truck_id)} marked loaded`, 'ok'))
                              .catch((e: unknown) => toast(String(e), 'error'))
                          }
                          data-testid="mark-loaded"
                        >
                          Mark loaded
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Section>
      <Section title="Waiting for the District Officer" description="Large or reserve-using orders that are not approved yet. Don’t load these." className="lg:col-span-12">
        {waiting.length === 0 ? (
          <Empty icon={Clock} title="No orders waiting for approval" />
        ) : (
          <ul className="divide-y">
            {waiting.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="font-medium text-slate-900">{names.truck(o.truck_id)}</span>
                <span className="text-slate-600">
                  → {names.camp(o.camp_id)} · {fmtItems(o.items)}
                </span>
                <Pill tone="amber" className="ml-auto">
                  Needs approval
                </Pill>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </PageGrid>
  )
}
