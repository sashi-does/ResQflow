import { navigate, parseRoute, usePath } from '../router'
import { useStore } from '../store'
import { shortName } from '../lib/format'

export function RoleSwitcher() {
  const path = usePath()
  const scenario = useStore((s) => s.scenario)
  const route = parseRoute(path)
  const value = route.page === 'command' || route.page === 'intro' ? `/${route.page === 'intro' ? '' : 'command'}` : path
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-400">
      View as
      <select
        className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-xs text-slate-100"
        value={value}
        onChange={(e) => navigate(e.target.value)}
        data-testid="role-switcher"
      >
        <option value="/">Intro</option>
        <option value="/command">District Command</option>
        <optgroup label="Camp Coordinator">
          {scenario?.camps.map((c) => (
            <option key={c.id} value={`/camp/${c.id}`}>
              Camp · {shortName(c.name)}
            </option>
          ))}
        </optgroup>
        <optgroup label="Driver">
          {scenario?.trucks.map((t) => (
            <option key={t.id} value={`/driver/${t.id}`}>
              Driver · {t.id}
            </option>
          ))}
        </optgroup>
        <optgroup label="Warehouse">
          {scenario?.warehouses.map((w) => (
            <option key={w.id} value={`/warehouse/${w.id}`}>
              Warehouse · {shortName(w.name)}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  )
}
