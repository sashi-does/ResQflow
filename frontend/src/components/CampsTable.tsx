import { CAMP_COLORS, fmtNum, shortName } from '../lib/format'
import { useStore } from '../store'

export function CampsTable() {
  const scenario = useStore((s) => s.scenario)
  const camps = useStore((s) => s.camps)
  const select = useStore((s) => s.select)
  const rows = (scenario?.camps ?? [])
    .map((c) => ({ def: c, v: camps[c.id] }))
    .filter((r) => r.v)
    .sort((a, b) => a.v.days_of_cover - b.v.days_of_cover)
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-slate-900 text-[10px] uppercase tracking-wider text-slate-400">
          <tr>
            <th className="px-3 py-2">Camp</th>
            <th className="px-2 py-2 text-right">People</th>
            <th className="px-2 py-2">Cover (days)</th>
            <th className="px-2 py-2 text-right">Incoming water</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map(({ def, v }) => {
            const level = v.cut_off ? 'cut_off' : v.status
            const color = CAMP_COLORS[level]
            const pct = Math.min(100, (v.days_of_cover / 1.5) * 100)
            return (
              <tr key={def.id} className="cursor-pointer hover:bg-slate-800/40" onClick={() => select({ camp_ids: [def.id] })}>
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-100">{shortName(def.name)}</div>
                  <div className="text-[10px] uppercase" style={{ color }}>
                    {v.cut_off ? 'cut off' : v.status}
                    {v.priority_boost ? ' · heavy rain' : ''}
                  </div>
                  {v.unserved_reason && <div className="text-[11px] text-red-300">{v.unserved_reason}</div>}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-300">{fmtNum(def.population)}</td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-24 rounded bg-slate-800">
                      <span className="block h-2 rounded" style={{ width: `${pct}%`, background: color }} />
                    </span>
                    <span className="tabular-nums text-slate-300">{v.days_of_cover.toFixed(2)}</span>
                  </div>
                  <div className="text-[10px] text-slate-500">water {v.water_days.toFixed(2)}</div>
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-300">
                  {v.incoming.water_l ? `${fmtNum(v.incoming.water_l)} L` : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
