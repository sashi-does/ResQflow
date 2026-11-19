import { api } from '../api'
import { FACTS } from '../lib/facts'
import { navigate } from '../router'
import { useStore } from '../store'

const STEPS: { name: string; what: string; ai?: boolean; human?: boolean }[] = [
  { name: 'Monitor', what: 'floods, closures, rain' },
  { name: 'Inventory', what: 'days of water left per camp' },
  { name: 'Routing', what: 'safe roads, re-routes trucks' },
  { name: 'Coordinator', what: 'plans who gets what', ai: true },
  { name: 'Validator', what: 'checks every plan' },
  { name: 'Human approval', what: 'district officer signs off', human: true },
  { name: 'Dispatch', what: 'trucks roll' },
]

const ROLES = [
  { title: 'District Command', who: 'DDMO control room', what: 'Live map, agent feed, approvals, KPIs', path: '/command', icon: '🛰️' },
  { title: 'Camp Coordinator', who: 'Majuli relief camp', what: 'Send field reports in Assamese or English', path: '/camp/C7', icon: '⛺' },
  { title: 'Driver', who: 'Truck T3', what: 'Current job, safe route, re-route alerts', path: '/driver/T3', icon: '🚚' },
  { title: 'Warehouse', who: 'Nagaon warehouse', what: 'Stock vs safety reserve, loading queue', path: '/warehouse/W2', icon: '🏭' },
]

export function Intro() {
  const toast = useStore((s) => s.toast)
  const watch = () => {
    navigate('/command')
    api.runDemo().catch((e: unknown) => toast(String(e), 'error'))
  }
  return (
    <div className="h-full overflow-y-auto bg-slate-950" data-testid="intro">
      <div className="mx-auto max-w-6xl px-8 py-10">
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span className="text-lg font-semibold text-white">RahatNet</span>
          <span>·</span>
          <span>flood-relief logistics agents for Assam</span>
        </div>
        <h1 className="mt-6 max-w-3xl text-5xl leading-tight font-bold tracking-tight text-white">
          When the roads go under, <span className="text-sky-400">the supplies don't stop.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-300">
          A team of AI agents re-plans relief deliveries the moment a flood closes a road, explains every decision, and
          lets the district officer approve the big ones.
        </p>
        <div className="mt-8 flex gap-3">
          <button className="rounded-lg bg-sky-500 px-6 py-3 text-lg font-semibold text-slate-950 hover:bg-sky-400" onClick={watch} data-testid="watch-demo">
            ▶ Watch the live demo
          </button>
          <button className="rounded-lg border border-slate-600 px-6 py-3 text-lg text-slate-200 hover:bg-slate-800" onClick={() => navigate('/command')}>
            Open the dashboard
          </button>
        </div>

        <h2 className="mt-14 text-xs font-semibold tracking-widest text-slate-400 uppercase">The problem</h2>
        <div className="mt-4 grid grid-cols-3 gap-4">
          {FACTS.map((f) => (
            <figure key={f.stat} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <div className="text-4xl font-bold text-amber-300 tabular-nums">{f.stat}</div>
              <p className="mt-2 text-sm leading-relaxed text-slate-200">{f.text}</p>
              <figcaption className="mt-3 text-[11px] text-slate-500">
                Source:{' '}
                <a href={f.url} target="_blank" rel="noreferrer" className="underline hover:text-slate-300">
                  {f.source}
                </a>
              </figcaption>
            </figure>
          ))}
        </div>

        <h2 className="mt-14 text-xs font-semibold tracking-widest text-slate-400 uppercase">How it works</h2>
        <ol className="mt-4 flex items-stretch gap-1">
          {STEPS.map((s, i) => (
            <li key={s.name} className="flex flex-1 items-center gap-1">
              <div
                className={`flex-1 rounded-lg border p-3 ${s.ai ? 'border-emerald-500/60 bg-emerald-500/10' : s.human ? 'border-slate-300/50 bg-slate-100/5' : 'border-slate-800 bg-slate-900'}`}
              >
                <div className="text-sm font-semibold text-white">
                  {s.name}
                  {s.ai && <span className="ml-1 rounded bg-emerald-500/20 px-1 text-[10px] text-emerald-300">AI</span>}
                </div>
                <div className="text-[11px] leading-tight text-slate-400">{s.what}</div>
              </div>
              {i < STEPS.length - 1 && <span className="text-slate-600">→</span>}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-slate-500">
          The AI proposes; code checks every plan and a human approves large orders. Numbers always come from the
          simulation, never from the AI.
        </p>

        <h2 className="mt-14 text-xs font-semibold tracking-widest text-slate-400 uppercase">Four roles, one live picture</h2>
        <div className="mt-4 grid grid-cols-4 gap-4">
          {ROLES.map((r) => (
            <button
              key={r.title}
              onClick={() => navigate(r.path)}
              className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-left hover:border-sky-500/60 hover:bg-slate-800/60"
              data-testid={`role-card-${r.path.split('/')[1]}`}
            >
              <div className="text-2xl">{r.icon}</div>
              <div className="mt-2 font-semibold text-white">{r.title}</div>
              <div className="text-xs text-slate-400">{r.who}</div>
              <div className="mt-2 text-sm text-slate-300">{r.what}</div>
            </button>
          ))}
        </div>
        <p className="mt-12 text-[11px] text-slate-600">
          Simulation of a flood day in Assam. Locations are real; stocks, camps and timings are a scenario. Map tiles ©
          Esri, OpenStreetMap contributors.
        </p>
      </div>
    </div>
  )
}
