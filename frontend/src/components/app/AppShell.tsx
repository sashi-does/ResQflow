import { Info, LogOut, Menu, Wifi, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { ROLE_LABEL, type Session } from '../../auth'
import { logout } from '../../lib/logout'
import { pagesFor, pathOf, type PageDef } from '../../lib/nav'
import { navigate, usePath } from '../../router'
import { useStore } from '../../store'
import { Logo } from './Logo'

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}


function Nav({ session, onNavigate }: { session: Session; onNavigate?: () => void }) {
  const path = usePath()
  return (
    <nav className="flex flex-col gap-1" aria-label="Pages">
      {pagesFor(session.user.role).map((p) => {
        const to = pathOf(p)
        const active = path === to
        return (
          <a
            key={p.slug}
            href={to}
            data-testid={`nav-${p.slug}`}
            aria-current={active ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault()
              navigate(to)
              onNavigate?.()
            }}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
              active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              p.demo && 'mt-4',
            )}
          >
            <p.icon className="size-4 shrink-0" aria-hidden />
            <span className="flex-1">{p.label}</span>
            {p.demo && <span className="rounded bg-violet-50 px-1.5 text-[10px] font-semibold text-violet-700 uppercase">Demo tools</span>}
          </a>
        )
      })}
    </nav>
  )
}

function UserMenu({ session }: { session: Session }) {
  const u = session.user
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-slate-100" data-testid="user-menu">
          <Avatar className="size-9">
            <AvatarFallback className="bg-blue-100 text-sm font-semibold text-blue-700">{initials(u.name)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-900">{u.name}</span>
            <span className="block truncate text-xs text-slate-500">{u.title}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-60">
        <DropdownMenuLabel>
          {u.name}
          <div className="text-xs font-normal text-muted-foreground">{u.title}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout} data-testid="logout">
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SidebarBody({ session, onNavigate }: { session: Session; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-2.5 px-1">
        <Logo />
        <div>
          <div className="text-base font-bold tracking-tight text-slate-900">RahatNet</div>
          <div className="text-[11px] text-slate-500">Flood relief coordination</div>
        </div>
      </div>
      <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2" data-testid="role-badge">
        <div className="text-[11px] font-semibold tracking-wide text-blue-700 uppercase">{ROLE_LABEL[session.user.role]}</div>
        <div className="truncate text-sm text-slate-700">{session.user.title.split(', ').slice(1).join(', ') || 'All districts'}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Nav session={session} onNavigate={onNavigate} />
      </div>
      <UserMenu session={session} />
    </div>
  )
}

export function WhyPopover({ page }: { page: PageDef }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" data-testid="why-button" className="shrink-0" aria-label="Why this page">
          <Info className="text-blue-600" /> <span className="hidden sm:inline">Why this page</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 text-sm" data-testid="why-popover">
        <dl className="space-y-3">
          <div>
            <dt className="text-xs font-semibold tracking-wide text-red-600 uppercase">Problem</dt>
            <dd className="mt-0.5 text-slate-700">{page.why.problem}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-blue-600 uppercase">What this page does</dt>
            <dd className="mt-0.5 text-slate-700">{page.why.does}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Who uses it</dt>
            <dd className="mt-0.5 text-slate-700">{page.why.who}</dd>
          </div>
        </dl>
      </PopoverContent>
    </Popover>
  )
}

function Clock() {
  const sim = useStore((s) => s.sim)
  const connected = useStore((s) => s.connected)
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="hidden text-slate-500 sm:inline">Assam Floods ·</span>
      <span className="font-semibold text-slate-900 tnum" data-testid="sim-time">
        {sim?.sim_time ?? '—'}
      </span>
      <span
        className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-violet-700"
        title="The flood scenario is simulated for this demo"
      >
        SIMULATION
      </span>
      <span className={cn('flex items-center', connected ? 'text-emerald-600' : 'text-amber-600')} title={connected ? 'Live' : 'Reconnecting…'}>
        {connected ? <Wifi className="size-4" aria-label="Live" /> : <WifiOff className="size-4" aria-label="Reconnecting" />}
      </span>
    </div>
  )
}

export function AppShell({ session, page, children }: { session: Session; page: PageDef; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 }) // each page opens at the top
  }, [page.slug])
  const everConnected = useStore((s) => s.everConnected)
  const connected = useStore((s) => s.connected)
  return (
    <div className="flex h-full bg-slate-50">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block" aria-label="Sidebar">
        <SidebarBody session={session} />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">RahatNet pages for your role</SheetDescription>
          <SidebarBody session={session} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu />
            </Button>
            <div className="ml-auto">
              <Clock />
            </div>
          </div>
          <div className="mt-1 flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900" data-testid="page-title">
                {page.title}
              </h1>
              <p className="mt-0.5 text-sm text-slate-500" data-testid="page-purpose">
                {page.purpose}
              </p>
            </div>
            <WhyPopover page={page} />
          </div>
        </header>
        {everConnected && !connected && (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-800" data-testid="connection-banner">
            Connection lost. Reconnecting to the live server…
          </div>
        )}
        <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
