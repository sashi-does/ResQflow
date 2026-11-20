import { Siren } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Pill } from '../app/status'
import { age, useIncidents, type IncidentFilter } from '../../lib/incidents'

const FILTERS: { id: IncidentFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'roads', label: 'Roads' },
  { id: 'camps', label: 'Camps' },
  { id: 'trucks', label: 'Trucks' },
]

export function Incidents({ filter, onFilter }: { filter: IncidentFilter; onFilter: (f: IncidentFilter) => void }) {
  const all = useIncidents()
  const list = filter === 'all' ? all : all.filter((i) => i.type === filter)
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="incidents">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <Siren className="size-4 text-red-600" aria-hidden />
        <h2 className="text-sm font-semibold text-slate-900">Active incidents</h2>
        <span className="ml-auto rounded-full bg-red-50 px-2 text-xs font-semibold text-red-700 tnum" data-testid="incident-count">
          {all.length}
        </span>
      </div>
      <div className="flex gap-1 border-b border-slate-200 px-3 py-2" role="tablist" aria-label="Filter incidents">
        {FILTERS.map((f) => {
          const n = f.id === 'all' ? all.length : all.filter((i) => i.type === f.id).length
          return (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => onFilter(f.id)}
              className={cn('rounded-md px-2 py-1 text-xs font-medium', filter === f.id ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100')}
            >
              {f.label} <span className="tnum opacity-70">{n}</span>
            </button>
          )
        })}
      </div>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {list.length === 0 && <li className="px-2 py-8 text-center text-sm text-slate-500">Nothing here right now.</li>}
        {list.map((i) => (
          <li key={i.key}>
            <button onClick={i.go} className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:border-brand-400" data-testid="incident">
              <div className="flex items-start gap-2.5">
                <span className={cn('grid size-8 shrink-0 place-items-center rounded-md', i.status.tone === 'red' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800')}>
                  <i.icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <span className="text-sm leading-snug font-semibold text-slate-900">{i.title}</span>
                    {i.since != null && <span className="ml-auto shrink-0 text-[11px] text-slate-500 tnum">{age(i.since)}</span>}
                  </div>
                  <div className="truncate text-xs text-slate-500">{i.place}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <Pill tone={i.status.tone}>{i.status.word}</Pill>
                    {i.meta && <span className="truncate text-[11px] text-slate-500">{i.meta}</span>}
                  </div>
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
