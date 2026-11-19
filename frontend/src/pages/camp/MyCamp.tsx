import { ArrowRight, CircleAlert, Droplets, HeartPulse, Pill as PillIcon, TriangleAlert, Truck, Users, Utensils } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Empty, PageGrid, RowsSkeleton, Section, StatCard } from '../../components/app/blocks'
import { CampStatus } from '../../components/app/status'
import { LEVEL_BAR, LEVEL_TEXT, levelOfDays } from '../../lib/levels'
import { fmtDuration, fmtItems, fmtNum } from '../../lib/format'
import { truckLabel } from '../../lib/names'
import { navigate } from '../../router'
import { useStore } from '../../store'
import type { Supplies } from '../../types'
import { useMyCamp } from './common'

const ITEMS: { key: keyof Supplies; label: string; unit: string; icon: LucideIcon }[] = [
  { key: 'water_l', label: 'Water', unit: 'L', icon: Droplets },
  { key: 'food_rations', label: 'Food', unit: 'rations', icon: Utensils },
  { key: 'medical_kits', label: 'Medical', unit: 'kits', icon: PillIcon },
]

function hoursText(days: number): string {
  const h = days * 24
  return h < 1 ? 'less than an hour' : `~${Math.round(h)} h`
}

export function CampMyCamp() {
  const { camp, def, incoming, pop, burn } = useMyCamp()
  const sim = useStore((s) => s.sim)
  if (!camp || !def) return <RowsSkeleton rows={5} />
  const level = camp.cut_off ? 'cut_off' : camp.status
  const water = camp.water_days
  const banner =
    camp.cut_off
      ? { tone: 'bg-slate-100 text-slate-800 border-slate-300', icon: CircleAlert, text: `Cut off: ${camp.unserved_reason ?? 'no safe road to the camp right now.'} The District Officer has been alerted.` }
      : camp.status === 'critical'
        ? { tone: 'bg-red-50 text-red-800 border-red-200', icon: CircleAlert, text: `Critical: water runs out in ${hoursText(water)}.` }
        : camp.status === 'low'
          ? { tone: 'bg-amber-50 text-amber-900 border-amber-200', icon: TriangleAlert, text: `Low: less than a day of supplies. Water lasts ${hoursText(water)}.` }
          : { tone: 'bg-emerald-50 text-emerald-800 border-emerald-200', icon: CircleAlert, text: 'OK: more than a day of supplies.' }
  return (
    <PageGrid>
      <div className={cn('flex items-start gap-3 rounded-xl border p-4 lg:col-span-12', banner.tone)} data-testid="camp-banner" role="status">
        <banner.icon className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{banner.text}</div>
          <div className="text-sm opacity-80">
            {def.name} · {def.district} · as of {sim?.sim_time}
          </div>
        </div>
        <CampStatus level={level} testId="camp-status" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:col-span-12 lg:grid-cols-4">
        <StatCard label="People in camp" value={fmtNum(pop)} sub={`${def.district} district`} icon={Users} tone="blue" />
        {ITEMS.map((it) => {
          const days = burn[it.key] ? camp.stock[it.key] / burn[it.key] : 0
          const lv = levelOfDays(days)
          return (
            <Card key={it.key} className="gap-2 py-4" data-testid={`gauge-${it.key}`}>
              <CardContent className="px-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <it.icon className="size-4" aria-hidden /> {it.label} left
                </div>
                <div className={cn('mt-1 text-3xl font-semibold tnum', LEVEL_TEXT[lv])}>
                  {days.toFixed(1)} <span className="text-base font-medium">days</span>
                </div>
                <div className="mt-2 h-2.5 rounded-full bg-slate-100" role="meter" aria-valuemin={0} aria-valuemax={2} aria-valuenow={Number(days.toFixed(2))} aria-label={`${it.label} days of cover`}>
                  <div className={cn('h-2.5 rounded-full', LEVEL_BAR[lv])} style={{ width: `${Math.min(100, (days / 2) * 100)}%` }} />
                </div>
                <div className="mt-1.5 text-xs text-muted-foreground">
                  {fmtNum(camp.stock[it.key])} {it.unit} · uses {fmtNum(burn[it.key])}/day
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Section
        title="Help on the way"
        description={incoming.length ? `${incoming.length} truck${incoming.length > 1 ? 's' : ''} coming to your camp` : undefined}
        action={
          <Button variant="link" size="sm" onClick={() => navigate('/camp/deliveries')}>
            Deliveries <ArrowRight />
          </Button>
        }
        className="lg:col-span-7"
      >
        {incoming.length === 0 ? (
          <Empty icon={Truck} title="No trucks on the way right now">
            The district plans deliveries automatically from your stock levels and reports.
          </Empty>
        ) : (
          <ul className="divide-y">
            {incoming.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                <Truck className="size-4 text-blue-600" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900">{truckLabel(t.id)}</div>
                  <div className="text-slate-500">{t.job ? fmtItems(t.job.items) : ''}</div>
                </div>
                <div className="text-right font-semibold text-blue-700 tnum">
                  {t.status === 'loading' ? 'Loading' : t.eta_sim_seconds && sim ? `ETA ${fmtDuration((t.eta_sim_seconds - sim.sim_seconds) / 60)}` : 'On the road'}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Flagged to the District Officer" description="From your field reports" className="lg:col-span-5">
        {(camp.urgent_needs ?? []).length + (camp.health_flags ?? []).length === 0 ? (
          <Empty icon={HeartPulse} title="Nothing flagged">
            Send a report to tell the district about urgent needs or health problems.
          </Empty>
        ) : (
          <ul className="space-y-2 text-sm">
            {(camp.urgent_needs ?? []).map((n) => (
              <li key={n} className="flex items-center gap-2 text-amber-900">
                <TriangleAlert className="size-4" aria-hidden /> Need: {n}
              </li>
            ))}
            {(camp.health_flags ?? []).map((n) => (
              <li key={n} className="flex items-center gap-2 text-red-800">
                <HeartPulse className="size-4" aria-hidden /> Health: {n}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </PageGrid>
  )
}
