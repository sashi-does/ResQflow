import { ArrowRight, ShieldCheck, TentTree, Truck, Warehouse } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Logo } from '../components/app/Logo'
import { FACTS } from '../lib/facts'
import { navigate } from '../router'

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
  { title: 'District Officer', problem: 'No single live picture; decisions made over phone calls.', icon: ShieldCheck },
  { title: 'Camp Coordinator', problem: 'Camps run out before anyone notices; reports lost in translation.', icon: TentTree },
  { title: 'Truck Driver', problem: 'Drivers drive into flooded roads; nobody tells them the plan changed.', icon: Truck },
  { title: 'Warehouse Manager', problem: 'Blind stock; over-dispatch drains the emergency reserve.', icon: Warehouse },
]

export function Intro() {
  useEffect(() => {
    document.title = 'RahatNet · Flood relief coordination'
  }, [])
  const signIn = () => navigate('/login')
  return (
    <div className="h-full overflow-y-auto bg-white" data-testid="intro">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-8">
          <Logo />
          <span className="text-lg font-bold tracking-tight">RahatNet</span>
          <span className="hidden text-sm text-slate-500 sm:inline">· flood-relief coordination for Assam</span>
          <Button className="ml-auto" onClick={signIn} data-testid="intro-signin">
            Sign in
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
        <h1 className="max-w-3xl text-4xl leading-tight font-bold tracking-tight text-slate-900 sm:text-5xl">
          When the roads go under, <span className="text-blue-600">the supplies don’t stop.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">
          A team of AI agents re-plans relief deliveries the moment a flood closes a road, explains every decision, and lets the
          district officer approve the big ones.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" onClick={signIn} data-testid="watch-demo">
            Try it with a demo account <ArrowRight />
          </Button>
        </div>

        <h2 className="mt-14 text-sm font-semibold tracking-wide text-slate-500 uppercase">The problem</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {FACTS.map((f) => (
            <figure key={f.stat} className="rounded-xl border bg-slate-50 p-5">
              <div className="text-4xl font-bold text-slate-900 tnum">{f.stat}</div>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{f.text}</p>
              <figcaption className="mt-3 text-xs text-slate-500">
                Source:{' '}
                <a href={f.url} target="_blank" rel="noreferrer" className="underline hover:text-slate-800">
                  {f.source}
                </a>
              </figcaption>
            </figure>
          ))}
        </div>

        <h2 className="mt-14 text-sm font-semibold tracking-wide text-slate-500 uppercase">Four people, one live picture</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((r) => (
            <button key={r.title} onClick={signIn} className="rounded-xl border p-5 text-left transition-shadow hover:shadow-md" data-testid="role-card">
              <r.icon className="size-6 text-blue-600" aria-hidden />
              <div className="mt-3 font-semibold text-slate-900">{r.title}</div>
              <div className="mt-1 text-sm text-slate-600">{r.problem}</div>
            </button>
          ))}
        </div>

        <h2 className="mt-14 text-sm font-semibold tracking-wide text-slate-500 uppercase">How it works</h2>
        <ol className="mt-4 grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {STEPS.map((s) => (
            <li key={s.name} className={`rounded-lg border p-3 ${s.ai ? 'border-blue-200 bg-blue-50' : s.human ? 'border-emerald-200 bg-emerald-50' : 'bg-white'}`}>
              <div className="text-sm font-semibold text-slate-900">
                {s.name}
                {s.ai && <span className="ml-1 rounded bg-blue-600 px-1 text-[10px] text-white">AI</span>}
              </div>
              <div className="text-xs text-slate-600">{s.what}</div>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-sm text-slate-500">
          The AI proposes; code checks every plan and a person approves large orders. Numbers always come from code, never from the AI.
        </p>
        <p className="mt-12 text-xs text-slate-500">
          Simulation of a flood day in Assam. Locations are real; stocks, camps, timings and users are fictional. Map tiles © Esri,
          OpenStreetMap contributors.
        </p>
      </main>
    </div>
  )
}
