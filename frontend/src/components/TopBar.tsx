import { api } from '../api'
import { useStore } from '../store'

const SPEEDS = [30, 120, 600]

export function TopBar() {
  const sim = useStore((s) => s.sim)
  const health = useStore((s) => s.health)
  const scenario = useStore((s) => s.scenario)
  const connected = useStore((s) => s.connected)
  const toast = useStore((s) => s.toast)

  const run = (p: Promise<unknown>) => p.catch((e: unknown) => toast(String(e), 'error'))
  const provider = health?.llm_provider ?? '…'
  const offline = provider === 'mock'

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-950 px-4">
      <span className="text-[15px] font-semibold tracking-tight text-white">RahatNet</span>
      <span className="text-slate-600">▸</span>
      <span className="text-sm text-slate-300">{scenario?.name ?? 'Assam Floods'}</span>
      <span className="ml-2 rounded bg-slate-800 px-2 py-0.5 font-mono text-sm tabular-nums text-sky-300" data-testid="sim-time">
        {sim?.sim_time ?? '—'}
      </span>
      {sim?.ended && <span className="text-xs text-amber-300">scenario complete</span>}
      <div className="ml-2 flex items-center gap-1">
        <button
          className="btn-icon"
          title="Play (Space)"
          aria-label="play"
          disabled={!connected || sim?.running || sim?.ended}
          onClick={() => run(api.start())}
        >
          ▶
        </button>
        <button
          className="btn-icon"
          title="Pause (Space)"
          aria-label="pause"
          disabled={!connected || !sim?.running}
          onClick={() => run(api.pause())}
        >
          ⏸
        </button>
      </div>
      <div className="flex overflow-hidden rounded border border-slate-700" role="group" aria-label="speed">
        {SPEEDS.map((sp) => (
          <button
            key={sp}
            className={`px-2 py-0.5 text-xs tabular-nums ${sim?.speed === sp ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
            onClick={() => run(api.speed(sp))}
          >
            {sp}x
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-3">
        <span className="flex items-center gap-1.5 text-xs text-slate-300" title={health?.llm_model}>
          <span className={`h-2 w-2 rounded-full ${offline ? 'bg-amber-400' : 'bg-emerald-400'}`} />
          Coordinator: {offline ? 'offline mode (heuristic)' : `${provider} · ${health?.llm_model ?? ''}`}
        </span>
        <button className="btn-primary" data-testid="run-demo" disabled={!connected} onClick={() => run(api.runDemo())}>
          Run Demo
        </button>
      </div>
    </header>
  )
}
