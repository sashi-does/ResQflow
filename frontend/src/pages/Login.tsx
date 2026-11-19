import { ArrowRight, Loader2, ShieldCheck, TentTree, Truck, Warehouse } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, type DemoUser } from '../api'
import { setSession, type Role } from '../auth'
import { Logo } from '../components/app/Logo'
import { HOME } from '../lib/nav'
import { navigate } from '../router'

const ROLE_CARD: Record<Role, { icon: LucideIcon; label: string; color: string }> = {
  officer: { icon: ShieldCheck, label: 'District Officer', color: 'bg-blue-50 text-blue-700' },
  camp: { icon: TentTree, label: 'Camp Coordinator', color: 'bg-emerald-50 text-emerald-700' },
  driver: { icon: Truck, label: 'Truck Driver', color: 'bg-amber-50 text-amber-700' },
  warehouse: { icon: Warehouse, label: 'Warehouse Manager', color: 'bg-violet-50 text-violet-700' },
}
const ORDER: Role[] = ['officer', 'camp', 'driver', 'warehouse']
const PRIMARY_CAMP = 'camp.majuli'

export function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [demo, setDemo] = useState<DemoUser[]>([])

  useEffect(() => {
    document.title = 'Sign in · RahatNet'
    api.demoUsers().then(setDemo).catch(() => setDemo([]))
  }, [])

  const login = (u: string, p: string) => {
    setBusy(u)
    setError(null)
    api
      .login(u, p)
      .then((s) => {
        setSession(s)
        navigate(HOME[s.user.role], true)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(null))
  }

  const cards = ORDER.map((role) => {
    const users = demo.filter((d) => d.role === role)
    const main = users.find((u) => u.username === PRIMARY_CAMP) ?? users[0]
    return { role, main, others: users.filter((u) => u !== main) }
  }).filter((c) => c.main)

  return (
    <div className="min-h-full bg-slate-50 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-blue-700 to-blue-900 p-12 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <Logo className="size-10" />
          <span className="text-2xl font-bold tracking-tight">RahatNet</span>
        </div>
        <div className="mt-auto max-w-md">
          <p className="text-3xl leading-tight font-semibold">When the roads go under, the supplies don’t stop.</p>
          <p className="mt-4 text-blue-100">
            AI agents re-plan flood-relief deliveries in Assam the moment a road floods. Every decision is explained, and people
            approve the big ones.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-blue-50">
            <li>• One live picture for the District Officer</li>
            <li>• Camp reports in Assamese or English, understood by AI</li>
            <li>• Drivers re-routed before they reach the water</li>
          </ul>
        </div>
      </aside>

      <main className="mx-auto flex w-full max-w-2xl flex-col justify-center px-4 py-10 sm:px-8">
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <Logo className="size-9" />
          <div>
            <div className="text-xl font-bold tracking-tight">RahatNet</div>
            <div className="text-sm text-slate-500">When the roads go under, the supplies don’t stop.</div>
          </div>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">Use your RahatNet account, or pick a demo account below.</p>

        <form
          className="mt-6 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            login(username, password)
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="username">Username</Label>
            <Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" disabled={!!busy} data-testid="login-submit">
            {busy === username && busy ? <Loader2 className="animate-spin" /> : null} Sign in
          </Button>
        </form>
        {error && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert" data-testid="login-error">
            {error === 'wrong username or password' ? 'Wrong username or password.' : error}
          </p>
        )}

        <div className="mt-10">
          <div className="flex items-baseline gap-2">
            <h2 className="text-base font-semibold text-slate-900">Demo accounts</h2>
            <span className="text-sm text-slate-500">One click signs you in. Password for all: demo1234</span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {cards.map(({ role, main, others }) => {
              const rc = ROLE_CARD[role]
              return (
                <Card key={role} className="gap-0 py-0 transition-shadow hover:shadow-md">
                  <CardContent className="p-0">
                    <button
                      className="flex w-full items-start gap-3 rounded-xl p-4 text-left focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
                      onClick={() => login(main.username, 'demo1234')}
                      disabled={!!busy}
                      data-testid={`demo-${main.username}`}
                    >
                      <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${rc.color}`}>
                        <rc.icon className="size-5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900">{rc.label}</span>
                        <span className="block text-sm text-slate-600">
                          {main.name} · {main.scope_label}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">{main.blurb}</span>
                      </span>
                      {busy === main.username ? (
                        <Loader2 className="size-4 animate-spin text-slate-400" />
                      ) : (
                        <ArrowRight className="size-4 text-slate-400" aria-hidden />
                      )}
                    </button>
                    {others.map((o) => (
                      <button
                        key={o.username}
                        className="w-full border-t px-4 py-2 text-left text-xs text-blue-700 hover:bg-slate-50"
                        onClick={() => login(o.username, 'demo1234')}
                        disabled={!!busy}
                        data-testid={`demo-${o.username}`}
                      >
                        or sign in as {o.name} · {o.scope_label}
                      </button>
                    ))}
                  </CardContent>
                </Card>
              )
            })}
          </div>
          <p className="mt-4 text-xs text-slate-500">Hackathon demo. All users are fictional; the flood scenario is simulated.</p>
          <p className="mt-1 text-xs">
            <a
              href="/"
              className="text-blue-700 hover:underline"
              onClick={(e) => {
                e.preventDefault()
                navigate('/')
              }}
            >
              ← About RahatNet
            </a>
          </p>
        </div>
      </main>
    </div>
  )
}
