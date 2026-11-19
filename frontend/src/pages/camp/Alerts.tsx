import { Bell, PackageCheck, TriangleAlert, Truck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { CampAlert } from '../../api'
import { Empty, PageGrid, StatCard } from '../../components/app/blocks'
import { Pill } from '../../components/app/status'
import { useStore } from '../../store'

const KIND: Record<CampAlert['kind'], { icon: LucideIcon; word: string; tone: 'blue' | 'amber' | 'green' }> = {
  dispatch: { icon: Truck, word: 'On the way', tone: 'blue' },
  delay: { icon: TriangleAlert, word: 'Delayed', tone: 'amber' },
  arrival: { icon: PackageCheck, word: 'Arrived', tone: 'green' },
}

export function CampAlerts() {
  const alerts = useStore((s) => s.alerts)
  const count = (k: CampAlert['kind']) => alerts.filter((a) => a.kind === k).length
  return (
    <PageGrid>
      <div className="grid grid-cols-2 gap-4 lg:col-span-12 lg:grid-cols-4">
        <StatCard label="Messages" value={alerts.length} icon={Bell} tone="blue" />
        <StatCard label="Dispatched" value={count('dispatch')} icon={Truck} tone="blue" />
        <StatCard label="Delays" value={count('delay')} icon={TriangleAlert} tone={count('delay') ? 'amber' : 'green'} />
        <StatCard label="Arrivals" value={count('arrival')} icon={PackageCheck} tone="green" />
      </div>
      <div className="space-y-3 lg:col-span-12">
        {alerts.length === 0 ? (
          <Card>
            <CardContent>
              <Empty icon={Bell} title="No messages yet">
                You’ll get a message here, in Assamese and English, when a truck is sent, delayed or arrives.
              </Empty>
            </CardContent>
          </Card>
        ) : (
          alerts.map((a) => {
            const k = KIND[a.kind]
            return (
              <Card key={a.id} className="py-4" data-testid="camp-alert">
                <CardContent className="flex gap-3 px-4">
                  <k.icon className="mt-0.5 size-5 shrink-0 text-slate-500" aria-hidden />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Pill tone={k.tone}>{k.word}</Pill>
                      <span className="text-xs text-slate-500 tnum">{a.sim_time}</span>
                    </div>
                    <p className="text-base text-slate-900" lang="as">
                      {a.as}
                    </p>
                    <p className="text-sm text-slate-600" lang="en">
                      {a.en}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </PageGrid>
  )
}
