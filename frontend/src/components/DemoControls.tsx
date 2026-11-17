import { api } from '../api'
import { PRESET_BUTTONS } from '../lib/presets'
import { useStore } from '../store'

export function DemoControls() {
  const hazards = useStore((s) => s.hazards)
  const toast = useStore((s) => s.toast)
  const connected = useStore((s) => s.connected)
  const active = new Set(hazards.map((h) => h.preset_id))
  const floods = hazards.filter((h) => h.kind !== 'rain_advisory').length

  const trigger = (id: string, label: string) =>
    api
      .trigger(id)
      .then(() => toast(`Flood reported: ${label}`, 'warn'))
      .catch((e: unknown) => toast(String(e), 'error'))

  return (
    <div className="absolute bottom-3 left-3 z-[1000] rounded-lg border border-slate-700 bg-slate-900/90 p-2 shadow-xl backdrop-blur">
      <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Demo controls</div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="px-1 text-xs text-slate-400">Trigger flood:</span>
        {PRESET_BUTTONS.map((p) => (
          <button
            key={p.id}
            className={`btn-chip ${active.has(p.id) ? 'border-red-500/70 bg-red-500/20 text-red-200' : ''}`}
            disabled={!connected || active.has(p.id)}
            title={`Shortcut ${p.key}`}
            onClick={() => trigger(p.id, p.label)}
          >
            {p.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-slate-700" />
        <button
          className="btn-chip"
          disabled={!connected || floods === 0}
          onClick={() =>
            api
              .recedeAll()
              .then(() => toast('Water receding: roads reopened', 'ok'))
              .catch((e: unknown) => toast(String(e), 'error'))
          }
        >
          Recede all
        </button>
        <button
          className="btn-chip"
          disabled={!connected}
          onClick={() => api.replan().catch((e: unknown) => toast(String(e), 'error'))}
        >
          Replan
        </button>
      </div>
    </div>
  )
}
