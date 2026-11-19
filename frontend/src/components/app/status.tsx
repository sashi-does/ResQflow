import { CircleAlert, CircleCheck, CircleSlash, Clock, Loader, MapPinOff, PauseCircle, Truck, TriangleAlert, Undo2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CampLevel, OrderStatus, TruckStatus } from '../../types'

/** One colour, one word, one icon per status, everywhere (doc 11 §2). */
type Tone = 'red' | 'amber' | 'green' | 'blue' | 'slate'

const TONE: Record<Tone, string> = {
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  slate: 'bg-slate-100 text-slate-700 ring-slate-500/20',
}

export function Pill({ tone, icon: Icon, children, className, testId }: { tone: Tone; icon?: LucideIcon; children: React.ReactNode; className?: string; testId?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap', TONE[tone], className)} data-testid={testId}>
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {children}
    </span>
  )
}

const CAMP_STATUS: Record<CampLevel | 'cut_off', { tone: Tone; word: string; icon: LucideIcon }> = {
  critical: { tone: 'red', word: 'Critical', icon: CircleAlert },
  low: { tone: 'amber', word: 'Low', icon: TriangleAlert },
  ok: { tone: 'green', word: 'OK', icon: CircleCheck },
  cut_off: { tone: 'slate', word: 'Cut off', icon: MapPinOff },
}

export function CampStatus({ level, testId }: { level: CampLevel | 'cut_off'; testId?: string }) {
  const s = CAMP_STATUS[level]
  return (
    <Pill tone={s.tone} icon={s.icon} testId={testId}>
      {s.word}
    </Pill>
  )
}

const TRUCK: Record<TruckStatus, { tone: Tone; word: string; icon: LucideIcon }> = {
  idle: { tone: 'slate', word: 'Idle', icon: PauseCircle },
  loading: { tone: 'amber', word: 'Loading', icon: Loader },
  unloading: { tone: 'amber', word: 'Unloading', icon: Loader },
  en_route: { tone: 'green', word: 'En route', icon: Truck },
  returning: { tone: 'blue', word: 'Returning', icon: Undo2 },
  holding: { tone: 'red', word: 'Holding', icon: CircleSlash },
}

export function TruckStatusPill({ status }: { status: TruckStatus }) {
  const s = TRUCK[status]
  return (
    <Pill tone={s.tone} icon={s.icon}>
      {s.word}
    </Pill>
  )
}

const ORDER: Record<OrderStatus, { tone: Tone; word: string; icon: LucideIcon }> = {
  proposed: { tone: 'slate', word: 'Proposed', icon: Clock },
  awaiting_approval: { tone: 'amber', word: 'Needs approval', icon: Clock },
  dispatched: { tone: 'blue', word: 'On the way', icon: Truck },
  delivered: { tone: 'green', word: 'Delivered', icon: CircleCheck },
  rejected: { tone: 'slate', word: 'Rejected', icon: CircleSlash },
  failed: { tone: 'red', word: 'Failed', icon: CircleAlert },
}

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  const s = ORDER[status]
  return (
    <Pill tone={s.tone} icon={s.icon}>
      {s.word}
    </Pill>
  )
}
