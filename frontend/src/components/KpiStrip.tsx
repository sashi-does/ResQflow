import { fmtDuration, fmtKg, fmtNum } from '../lib/format'
import { useStore } from '../store'
import type { KPIs } from '../types'

interface Spec {
  key: keyof KPIs
  label: string
  lowerIsBetter: boolean
  fmt: (v: number) => string
}

const SPECS: Spec[] = [
  { key: 'people_hours_without_water', label: 'People-hours without water', lowerIsBetter: true, fmt: (v) => fmtNum(v) },
  { key: 'deliveries_on_time_pct', label: 'On-time deliveries', lowerIsBetter: false, fmt: (v) => `${v.toFixed(0)}%` },
  { key: 'truck_hours_stuck', label: 'Truck-hours stuck', lowerIsBetter: true, fmt: (v) => v.toFixed(1) },
  { key: 'avg_delivery_min', label: 'Avg delivery time', lowerIsBetter: true, fmt: (v) => (v ? fmtDuration(v) : '—') },
  { key: 'supplies_delivered_kg', label: 'Supplies delivered', lowerIsBetter: false, fmt: (v) => fmtKg(v) },
]

const TIP = 'Static = same floods, same trucks, plan fixed at 06:00, no re-routing (trucks wait at flooded roads).'

function Delta({ spec, a, b }: { spec: Spec; a: number; b: number }) {
  if (!b && !a) return <span className="text-[11px] text-slate-500">—</span>
  if (!b) return <span className="text-[11px] text-slate-500">new</span>
  const pct = (100 * (a - b)) / b
  if (Math.abs(pct) < 0.5) return <span className="text-[11px] text-slate-400">±0%</span>
  const better = spec.lowerIsBetter ? pct < 0 : pct > 0
  return (
    <span
      className={`rounded px-1.5 py-px text-[11px] font-semibold tabular-nums ${better ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}
    >
      {pct < 0 ? '▼' : '▲'} {Math.abs(pct).toFixed(0)}%
    </span>
  )
}

const MIN_DELIVERIES = 3
const ENOUGH_DATA_AT_S = 6 * 3600 // D1 12:00

export function KpiStrip() {
  const kpis = useStore((s) => s.kpis)
  const simSeconds = useStore((s) => s.sim?.sim_seconds ?? 0)
  const enoughData =
    !!kpis &&
    ((kpis.agentic.deliveries_total >= MIN_DELIVERIES && kpis.baseline.deliveries_total >= MIN_DELIVERIES) ||
      simSeconds >= ENOUGH_DATA_AT_S)
  return (
    <footer
      className="flex h-[84px] shrink-0 items-stretch border-t border-slate-800 bg-slate-950"
      data-testid="kpi-strip"
      title={TIP}
    >
      <div className="flex w-44 shrink-0 flex-col justify-center border-r border-slate-800 px-4">
        <span className="text-[13px] font-semibold text-white">Agentic vs Static</span>
        <span className="text-[11px] leading-tight text-slate-400">so far · same floods · static plan fixed at 06:00</span>
      </div>
      {SPECS.map((spec) => {
        const a = kpis?.agentic[spec.key] ?? 0
        const b = kpis?.baseline[spec.key] ?? 0
        const onTime = spec.key === 'deliveries_on_time_pct'
        const fmtA = onTime && !kpis?.agentic.deliveries_total ? () => '—' : spec.fmt
        const fmtB = onTime && !kpis?.baseline.deliveries_total ? () => '—' : spec.fmt
        return (
          <div key={spec.key} className="flex min-w-0 flex-1 flex-col justify-center border-r border-slate-800/60 px-4">
            <span className="truncate text-[11px] uppercase tracking-wider text-slate-400">{spec.label}</span>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-xl font-semibold tabular-nums text-white" data-testid={`kpi-${spec.key}`}>
                {fmtA(a)}
              </span>
              {enoughData ? (
                <Delta spec={spec} a={a} b={b} />
              ) : (
                <span className="text-[11px] italic text-slate-500" data-testid="kpi-collecting">
                  collecting data…
                </span>
              )}
            </div>
            <span className="text-[11px] tabular-nums text-slate-500">Static {fmtB(b)}</span>
          </div>
        )
      })}
    </footer>
  )
}
