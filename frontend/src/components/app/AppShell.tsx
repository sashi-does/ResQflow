import { Info, LogOut, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ROLE_LABEL, type Session } from '../../auth'
import { logout } from '../../lib/logout'
import { pagesFor, pathOf, type PageDef } from '../../lib/nav'
import { navigate, usePath } from '../../router'
import { useStore } from '../../store'
import { Logo } from './Logo'

const COLLAPSE_KEY = 'rahatnet.sidebar.collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function Nav({ session, collapsed, onNavigate }: { session: Session; collapsed: boolean; onNavigate?: () => void }) {
  const path = usePath()
  const pages = pagesFor(session.user.role)
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Pages">
      {pages.map((p) => {
        const to = pathOf(p)
        const active = path === to
        const link = (
          <a
            key={p.slug}
            href={to}
            data-testid={`nav-${p.slug}`}
            aria-current={active ? 'page' : undefined}
            aria-label={collapsed ? p.label : undefined}
            onClick={(e) => {
              e.preventDefault()
              navigate(to)
              onNavigate?.()
            }}
            className={cn(
              'relative flex h-9 items-center gap-3 rounded-md text-sm font-medium',
              collapsed ? 'justify-center px-0' : 'px-3',
              active ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )}
          >
            {active && <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-brand-600" aria-hidden />}
            <p.icon className="size-4 shrink-0" aria-hidden />
            {!collapsed && <span className="flex-1 truncate">{p.label}</span>}
            {!collapsed && p.demo && <span className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">Demo</span>}
          </a>
        )
        return (
          <div key={p.slug} className={cn(p.demo && 'mt-3 border-t border-slate-100 pt-3')}>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{p.label}</TooltipContent>
              </Tooltip>
            ) : (
              link
            )}
          </div>
        )
      })}
    </nav>
  )
}

function UserMenu({ session, collapsed }: { session: Session; collapsed: boolean }) {
  const u = session.user
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn('flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-slate-100', collapsed && 'justify-center')}
          data-testid="user-menu"
          aria-label={collapsed ? `${u.name}, ${u.title}` : undefined}
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-slate-200 text-xs font-semibold text-slate-700">{initials(u.name)}</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">{u.name}</span>
              <span className="block truncate text-xs text-slate-500">{ROLE_LABEL[u.role]}</span>
            </span>
          )}
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

function SidebarBody({ session, collapsed, onNavigate }: { session: Session; collapsed: boolean; onNavigate?: () => void }) {
  const area = session.user.title.split(', ').slice(1).join(', ') || 'All districts'
  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-14 shrink-0 items-center gap-2.5 border-b border-slate-100', collapsed ? 'justify-center' : 'px-4')}>
        <Logo className="size-7" />
        {!collapsed && <span className="text-[15px] font-semibold tracking-tight text-slate-900">RahatNet</span>}
      </div>
      {!collapsed && (
        <div className="px-4 pt-4 pb-2" data-testid="role-badge">
          <div className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{ROLE_LABEL[session.user.role]}</div>
          <div className="truncate text-sm text-slate-700">{area}</div>
        </div>
      )}
      <div className={cn('min-h-0 flex-1 overflow-y-auto py-2', collapsed ? 'px-2' : 'px-3')}>
        <Nav session={session} collapsed={collapsed} onNavigate={onNavigate} />
      </div>
      <div className={cn('border-t border-slate-100', collapsed ? 'p-2' : 'p-3')}>
        <UserMenu session={session} collapsed={collapsed} />
      </div>
    </div>
  )
}

export function WhyPopover({ page }: { page: PageDef }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" data-testid="why-button" className="shrink-0 text-slate-500 hover:text-slate-900" aria-label="Why this page">
          <Info /> <span className="hidden sm:inline">Why this page</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 text-sm" data-testid="why-popover">
        <dl className="space-y-3">
          <div>
            <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Problem</dt>
            <dd className="mt-0.5 text-slate-700">{page.why.problem}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">What this page does</dt>
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

/** Scenario clock: one compact chip (live dot · sim time · Simulation). */
function Clock() {
  const sim = useStore((s) => s.sim)
  const connected = useStore((s) => s.connected)
  return (
    <div
      className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pr-1 pl-3 text-sm"
      title={connected ? 'Live: connected to the simulation' : 'Reconnecting…'}
    >
      <span className={cn('size-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-amber-500')} aria-hidden />
      <span className="sr-only">{connected ? 'Live' : 'Reconnecting'}</span>
      <span className="hidden text-slate-500 md:inline">Assam Floods</span>
      <span className="font-semibold text-slate-900 tnum" data-testid="sim-time">
        {sim?.sim_time ?? '—'}
      </span>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-slate-600 uppercase">Simulation</span>
    </div>
  )
}

export function AppShell({ session, page, children }: { session: Session; page: PageDef; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const mainRef = useRef<HTMLElement>(null)
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 }) // each page opens at the top
  }, [page.slug])
  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
    } catch {
      /* per-viewer convenience only */
    }
  }
  const everConnected = useStore((s) => s.everConnected)
  const connected = useStore((s) => s.connected)
  return (
    <div className="flex h-full bg-slate-50">
      <aside
        className={cn('hidden shrink-0 border-r border-slate-200 bg-white transition-[width] duration-200 lg:block', collapsed ? 'w-16' : 'w-60')}
        aria-label="Sidebar"
        data-collapsed={collapsed}
      >
        <SidebarBody session={session} collapsed={collapsed} />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">RahatNet pages for your role</SheetDescription>
          <SidebarBody session={session} collapsed={false} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:px-4">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden text-slate-500 lg:inline-flex"
            onClick={toggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            data-testid="sidebar-toggle"
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
          <div className="ml-auto">
            <Clock />
          </div>
        </div>
        {everConnected && !connected && (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-800" data-testid="connection-banner">
            Connection lost. Reconnecting to the live server…
          </div>
        )}
        <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1600px] p-4 sm:p-6">
            <div className="mb-5 flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <h1 className="text-[22px] font-semibold tracking-tight text-slate-900" data-testid="page-title">
                  {page.title}
                </h1>
                <p className="mt-1 text-sm text-slate-500" data-testid="page-purpose">
                  {page.purpose}
                </p>
              </div>
              <WhyPopover page={page} />
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
