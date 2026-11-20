import { ArrowRight, ShieldCheck, TentTree, Truck, Warehouse } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Logo } from '../components/app/Logo'
import { FACTS } from '../lib/facts'
import { PHOTOS, type Photo } from '../lib/photos'
import { navigate } from '../router'

const STEPS: { name: string; what: string; tag?: 'AI' | 'Person' }[] = [
  { name: 'Monitor', what: 'Floods, road closures and rain warnings' },
  { name: 'Inventory', what: 'Days of water and food left in every camp' },
  { name: 'Routing', what: 'Safe roads; re-routes trucks already on the road' },
  { name: 'Coordinator', what: 'Plans which warehouse sends what, where', tag: 'AI' },
  { name: 'Validator', what: 'Checks every plan against stock, trucks and roads' },
  { name: 'District Officer', what: 'Approves large orders before they leave', tag: 'Person' },
  { name: 'Dispatch', what: 'Trucks roll; every step is logged' },
]

const ROLES = [
  { title: 'District Officer', icon: ShieldCheck, problem: 'No single live picture; decisions made over phone calls.', gets: 'One live picture, approvals, proof the plan works.' },
  { title: 'Camp Coordinator', icon: TentTree, problem: 'Camps run out before anyone notices.', gets: 'Reports in Assamese or English, read by AI.' },
  { title: 'Truck Driver', icon: Truck, problem: 'Drivers find out about a flooded road when they reach it.', gets: 'The new safe route before the water.' },
  { title: 'Warehouse Manager', icon: Warehouse, problem: 'Over-dispatch drains the emergency reserve.', gets: 'Stock against the reserve, a clear loading queue.' },
]

function Credit({ p, className = '' }: { p: Photo; className?: string }) {
  return (
    <span className={className}>
      {p.caption}. Photo:{' '}
      <a href={p.page} target="_blank" rel="noreferrer" className="underline underline-offset-2">
        {p.author}
      </a>
      ,{' '}
      <a href={p.licenseUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
        {p.license}
      </a>
    </span>
  )
}

function Figure({ p, className = '' }: { p: Photo; className?: string }) {
  return (
    <figure className={className}>
      <img src={p.src} alt={p.alt} loading="lazy" className="aspect-[4/3] w-full rounded-lg object-cover" />
      <figcaption className="mt-2 text-xs text-slate-500">
        <Credit p={p} />
      </figcaption>
    </figure>
  )
}

export function Intro() {
  useEffect(() => {
    document.title = 'RahatNet · Flood relief coordination for Assam'
  }, [])
  const signIn = () => navigate('/login')
  return (
    <div className="h-full overflow-y-auto bg-white" data-testid="intro">
      {/* hero */}
      <section className="relative isolate overflow-hidden bg-ink text-white">
        <img src={PHOTOS.aerial.src} alt={PHOTOS.aerial.alt} className="absolute inset-0 -z-10 h-full w-full object-cover opacity-60" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink via-ink/85 to-ink/20" />
        <header className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-5 sm:px-8">
          <Logo className="size-8" inverted />
          <span className="text-lg font-semibold tracking-tight">RahatNet</span>
          <nav className="ml-8 hidden gap-6 text-sm text-white/80 md:flex">
            <a href="#problem" className="hover:text-white">The problem</a>
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#roles" className="hover:text-white">Who uses it</a>
          </nav>
          <Button variant="outline" className="ml-auto border-white/40 bg-transparent text-white hover:bg-white hover:text-ink" onClick={signIn} data-testid="intro-signin">
            Sign in
          </Button>
        </header>
        <div className="mx-auto max-w-6xl px-4 pt-16 pb-24 sm:px-8 sm:pt-24 sm:pb-32">
          <p className="text-sm font-medium tracking-wide text-brand-300 uppercase">Flood relief coordination · Assam</p>
          <h1 className="mt-4 max-w-2xl text-4xl leading-[1.1] font-semibold tracking-tight sm:text-6xl">When the roads go under, the supplies don’t stop.</h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80">
            RahatNet re-plans relief deliveries the moment a flood closes a road. Every decision is explained in plain English, and a
            district officer approves the big ones.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button size="lg" className="bg-brand-500 text-ink hover:bg-brand-400" onClick={signIn} data-testid="watch-demo">
              Try the live demo <ArrowRight />
            </Button>
            <Button size="lg" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" asChild>
              <a href="#how">How it works</a>
            </Button>
          </div>
        </div>
        <p className="mx-auto max-w-6xl px-4 pb-4 text-[11px] text-white/60 sm:px-8">
          <Credit p={PHOTOS.aerial} />
        </p>
      </section>

      {/* facts */}
      <section id="problem" className="border-b">
        <div className="mx-auto grid max-w-6xl gap-px bg-slate-200 sm:grid-cols-3">
          {FACTS.map((f) => (
            <figure key={f.stat} className="bg-white px-4 py-8 sm:px-8">
              <div className="text-4xl font-semibold tracking-tight text-slate-900 tnum">{f.stat}</div>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{f.text}</p>
              <figcaption className="mt-3 text-xs text-slate-500">
                <a href={f.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-slate-600">
                  {f.source}
                </a>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* story */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-8 lg:grid-cols-2">
        <Figure p={PHOTOS.road} />
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">A plan made at 6 am is wrong by 7.</h2>
          <p className="mt-4 leading-relaxed text-slate-600">
            In a flood, roads close one by one, camps fill up and stock runs low in a different place every hour. A plan fixed in the
            morning sends trucks into water and leaves camps waiting.
          </p>
          <ul className="mt-6 space-y-4 text-slate-700">
            <li className="border-l-2 border-brand-600 pl-4">
              <span className="font-medium text-slate-900">Re-routes trucks already on the road</span> the moment a road floods, and tells the driver.
            </li>
            <li className="border-l-2 border-brand-600 pl-4">
              <span className="font-medium text-slate-900">Re-plans who gets what</span> from live stock, camp reports and road conditions.
            </li>
            <li className="border-l-2 border-brand-600 pl-4">
              <span className="font-medium text-slate-900">Keeps people in charge:</span> code checks every AI plan, and large orders wait for the district officer.
            </li>
          </ul>
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-8">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">How it works</h2>
          <p className="mt-3 max-w-2xl text-slate-600">
            Seven steps, each logged in plain English. The AI proposes; code checks; a person approves. Numbers always come from code, never from the AI.
          </p>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {STEPS.map((s, i) => (
              <li key={s.name} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500 tnum">
                  {String(i + 1).padStart(2, '0')}
                  {s.tag && (
                    <span className={s.tag === 'AI' ? 'rounded bg-brand-50 px-1.5 text-brand-800' : 'rounded bg-slate-100 px-1.5 text-slate-700'}>{s.tag}</span>
                  )}
                </div>
                <div className="mt-2 font-medium text-slate-900">{s.name}</div>
                <div className="mt-1 text-sm leading-snug text-slate-500">{s.what}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* roles */}
      <section id="roles" className="mx-auto max-w-6xl px-4 py-20 sm:px-8">
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Four people, one live picture</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((r) => (
            <button key={r.title} onClick={signIn} className="group rounded-lg border border-slate-200 p-5 text-left transition-colors hover:border-brand-600" data-testid="role-card">
              <r.icon className="size-5 text-brand-700" aria-hidden />
              <div className="mt-4 font-medium text-slate-900">{r.title}</div>
              <p className="mt-2 text-sm text-slate-500">{r.problem}</p>
              <p className="mt-3 text-sm text-slate-800">{r.gets}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-700">
                Sign in as {r.title.toLowerCase()} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          ))}
        </div>
        <div className="mt-16 grid gap-6 md:grid-cols-2">
          <Figure p={PHOTOS.boat} />
          <Figure p={PHOTOS.ferry} />
        </div>
      </section>

      <footer className="border-t bg-slate-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-8 text-sm text-slate-500 sm:px-8">
          <Logo className="size-6" />
          <span>RahatNet · hackathon demo. The flood day is simulated; users are fictional. Locations are real.</span>
          <span className="ml-auto text-xs">Map tiles © Esri, OpenStreetMap contributors. Photos from Wikimedia Commons, credited above.</span>
        </div>
      </footer>
    </div>
  )
}
