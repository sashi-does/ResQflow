import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/** The "what's the situation" cards every page starts with. Numbers are neutral; colour only when the status means
 *  something (red = act now, amber = watch). Icons are optional and small, never decorative tiles. */
export function StatCard({
  label,
  value,
  sub,
  tone,
  testId,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon?: LucideIcon
  tone?: 'red' | 'amber' | 'green' | 'blue'
  testId?: string
}) {
  const color = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : 'text-slate-900'
  return (
    <Card className="gap-0 py-4" data-testid={testId}>
      <CardContent className="px-5">
        <div className="text-[13px] font-medium text-slate-500">{label}</div>
        <div className={cn('mt-1.5 text-[26px] leading-8 font-semibold tracking-tight tnum', color)}>{value}</div>
        {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
      </CardContent>
    </Card>
  )
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 lg:col-span-12 lg:grid-cols-4">{children}</div>
}

export function Section({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
  testId,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
  testId?: string
}) {
  return (
    <Card className={cn('gap-4', className)} data-testid={testId}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  )
}

export function Empty({ icon: Icon = Inbox, title, children }: { icon?: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center" data-testid="empty">
      <Icon className="size-8 text-slate-300" aria-hidden />
      <div className="mt-2 text-sm font-medium text-slate-700">{title}</div>
      {children && <div className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</div>}
    </div>
  )
}

export function RowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" data-testid="skeleton">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  )
}

/** 12-column page grid with 24px gaps. */
export function PageGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">{children}</div>
}
