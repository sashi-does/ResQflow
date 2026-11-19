import { api } from '../api'
import { navigate } from '../router'
import { RoleSwitcher } from './RoleSwitcher'
import { useStore } from '../store'

const SPEEDS = [30, 120, 600]

export function TopBar({ onTour, onCopilot }: { onTour?: () => void; onCopilot?: () => void }) {
  const setReport = useStore((s) => s.setReport)
  const hasReport = useStore((s) => !!s.report)
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
      <button className="text-[15px] font-semibold tracking-tight text-white" onClick={() => navigate('/')}>
        RahatNet
      </button>
      <span className="text-slate-600">▸</span>
      <span className="text-sm whitespace-nowrap text-slate-300">{scenario?.name ?? 'Assam Floods'}</span>
      <span className="ml-2 rounded bg-slate-800 px-2 py-0.5 font-mono text-sm tabular-nums text-sky-300" data-testid="sim-time">
        {sim?.sim_time ?? '—'}
      </span>
      {sim?.ended && <span className="text-xs whitespace-nowrap text-amber-300">ended</span>}
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
        <RoleSwitcher />
        {onCopilot && (
          <button className="rounded-md border border-emerald-500/60 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10" onClick={onCopilot} data-testid="copilot-button">
            ✦ Ask RahatNet
          </button>
        )}
        {onCopilot && (
          <button
            className="btn-chip"
            data-testid="end-report"
            disabled={!connected}
            onClick={() =>
              (hasReport && sim?.ended ? Promise.resolve(useStore.getState().report) : api.report())
                .then((r) => r && setReport(r))
                .catch((e: unknown) => toast(String(e), 'error'))
            }
          >
            {sim?.ended ? 'Report' : 'End & report'}
          </button>
        )}
        {onTour && (
          <button className="btn-chip" onClick={onTour} data-testid="tour-button">
            Tour
          </button>
        )}
        <span
          className="flex items-center gap-1.5 text-xs whitespace-nowrap text-slate-300"
          title={offline ? 'No API key: the Coordinator uses the deterministic heuristic planner' : `${provider} · ${health?.llm_model ?? ''}`}
          data-testid="ai-badge"
        >
          <span className={`h-2 w-2 rounded-full ${offline ? 'bg-amber-400' : 'bg-emerald-400'}`} />
          AI: {offline ? 'offline' : (health?.llm_model ?? provider)}
        </span>
        <button className="btn-primary" data-testid="run-demo" disabled={!connected} onClick={() => run(api.runDemo())}>
          Run Demo
        </button>
      </div>
    </header>
  )
}
