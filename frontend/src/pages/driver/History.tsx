import { CircleCheck, Clock, Package, Truck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api, type Trip } from '../../api'
import { useSession } from '../../auth'
import { Empty, PageGrid, RowsSkeleton, Section, StatCard } from '../../components/app/blocks'
import { Pill } from '../../components/app/status'
import { fmtDuration, fmtItems, fmtKg, shortName } from '../../lib/format'
import { useStore } from '../../store'

export function DriverHistory() {
  const id = useSession()?.user.scope_id ?? ''
  const status = useStore((s) => s.trucks[id]?.status)
  const [trips, setTrips] = useState<Trip[] | null>(null)
  useEffect(() => {
    api.history(id).then(setTrips).catch(() => setTrips([]))
  }, [id, status])
  const list = trips ?? []
  return (
    <PageGrid>
      <div className="grid grid-cols-2 gap-4 lg:col-span-12 lg:grid-cols-4">
        <StatCard label="Trips completed" value={trips ? list.length : '—'} icon={Truck} tone="blue" />
        <StatCard label="On time" value={trips ? list.filter((t) => t.on_time).length : '—'} icon={CircleCheck} tone="green" />
        <StatCard label="Delivered" value={trips ? fmtKg(list.reduce((a, t) => a + t.weight_kg, 0)) : '—'} icon={Package} tone="blue" />
        <StatCard label="Average trip" value={list.length ? fmtDuration(list.reduce((a, t) => a + t.minutes, 0) / list.length) : '—'} icon={Clock} tone="blue" />
      </div>
      <Section title="Completed trips" className="lg:col-span-12">
        {trips === null ? (
          <RowsSkeleton />
        ) : list.length === 0 ? (
          <Empty icon={Truck} title="No completed trips yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Delivered</TableHead>
                <TableHead>From → To</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead className="text-right">Trip time</TableHead>
                <TableHead className="text-right">On time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((t) => (
                <TableRow key={t.order_id}>
                  <TableCell className="tnum">{t.delivered}</TableCell>
                  <TableCell>
                    {shortName(t.warehouse)} → {shortName(t.camp)}
                  </TableCell>
                  <TableCell>{fmtItems(t.items)}</TableCell>
                  <TableCell className="text-right tnum">{fmtDuration(t.minutes)}</TableCell>
                  <TableCell className="text-right">{t.on_time ? <Pill tone="green">On time</Pill> : <Pill tone="amber">Late</Pill>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </PageGrid>
  )
}
