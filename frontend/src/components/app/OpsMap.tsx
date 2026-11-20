import { cn } from '@/lib/utils'
import { Legend } from '../Legend'
import { MapView } from '../MapView'
import { useStore } from '../../store'

/** The live map, dark basemap inside a light card, legend always visible (doc 11 §2). */
export function OpsMap({ className, legend = true, compact = false }: { className?: string; legend?: boolean; compact?: boolean }) {
  const scenario = useStore((s) => s.scenario)
  return (
    <div className={cn('relative isolate z-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100', className)} data-testid="ops-map">
      <MapView />
      {legend && <Legend defaultOpen={!compact} />}
      {!scenario && <div className="absolute inset-0 z-[1001] flex items-center justify-center text-sm text-slate-500">Loading map…</div>}
    </div>
  )
}
