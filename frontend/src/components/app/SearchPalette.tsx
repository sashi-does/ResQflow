import { CornerDownLeft, FileText, MapPin, Search, TentTree, Truck, Warehouse, Waves } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { Session } from '../../auth'
import { pagesFor, pathOf } from '../../lib/nav'
import { truckLabel } from '../../lib/names'
import { navigate } from '../../router'
import { useStore } from '../../store'

interface Hit {
  key: string
  group: string
  icon: LucideIcon
  label: string
  sub?: string
  run: () => void
}

/** ⌘K / Ctrl+K: jump to any page, camp, truck, warehouse, closed road or decision. */
export function SearchPalette({ session }: { session: Session }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const scenario = useStore((s) => s.scenario)
  const camps = useStore((s) => s.camps)
  const trucks = useStore((s) => s.trucks)
  const hazards = useStore((s) => s.hazards)
  const log = useStore((s) => s.log)
  const role = session.user.role

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const has = (...xs: (string | undefined)[]) => !needle || xs.some((x) => x?.toLowerCase().includes(needle))
    const nodes = new Map((scenario?.nodes ?? []).map((n) => [n.id, n]))
    const focusOn = (lat: number, lon: number, pick?: { kind: 'camp' | 'truck' | 'warehouse'; id: string }) => {
      const st = useStore.getState()
      if (role === 'officer') {
        navigate('/officer/operations')
        if (pick) st.setPick(pick)
        st.setFocus(lat, lon)
      }
    }
    const out: Hit[] = []
    for (const p of pagesFor(role)) if (has(p.label, p.title, p.purpose)) out.push({ key: `p${p.slug}`, group: 'Pages', icon: FileText, label: p.label, sub: p.purpose, run: () => navigate(pathOf(p)) })
    for (const c of scenario?.camps ?? []) {
      const v = camps[c.id]
      const n = nodes.get(c.node_id)
      if (has(c.name, c.district) && (role === 'officer' || session.user.scope_id === c.id))
        out.push({
          key: `c${c.id}`,
          group: 'Camps',
          icon: TentTree,
          label: c.name,
          sub: v ? `${c.district} · ${v.cut_off ? 'cut off' : v.status} · water ${v.water_days.toFixed(1)} days` : c.district,
          run: () => (role === 'camp' ? navigate('/camp/my-camp') : n && focusOn(n.lat, n.lon, { kind: 'camp', id: c.id })),
        })
    }
    if (role !== 'camp')
      for (const t of Object.values(trucks)) {
        if (role === 'driver' && session.user.scope_id !== t.id) continue
        if (has(truckLabel(t.id), t.id)) out.push({ key: `t${t.id}`, group: 'Trucks', icon: Truck, label: truckLabel(t.id), sub: t.status.replace('_', ' '), run: () => (role === 'driver' ? navigate('/driver/trip') : role === 'warehouse' ? navigate('/warehouse/queue') : focusOn(t.lat, t.lon, { kind: 'truck', id: t.id })) })
      }
    if (role === 'officer' || role === 'warehouse')
      for (const w of scenario?.warehouses ?? []) {
        const n = nodes.get(w.node_id)
        if (has(w.name)) out.push({ key: `w${w.id}`, group: 'Warehouses', icon: Warehouse, label: `${w.name} warehouse`, run: () => (role === 'warehouse' ? navigate('/warehouse/stock') : n && focusOn(n.lat, n.lon, { kind: 'warehouse', id: w.id })) })
      }
    for (const h of hazards) {
      if (!has(h.label, h.district ?? undefined)) continue
      const e = scenario?.edges.find((x) => x.id === h.edge_ids[0])
      const mid = e?.geometry?.[Math.floor((e.geometry.length - 1) / 2)]
      out.push({ key: `h${h.id}`, group: 'Floods and closures', icon: Waves, label: h.label, sub: `${h.edge_ids.length} road segment${h.edge_ids.length === 1 ? '' : 's'}`, run: () => (mid ? focusOn(mid[0], mid[1]) : navigate(role === 'officer' ? '/officer/operations' : `/${role === 'driver' ? 'driver/trip' : role === 'camp' ? 'camp/my-camp' : 'warehouse/stock'}`)) })
    }
    if (needle.length >= 3 && role === 'officer')
      for (const e of log.filter((x) => x.summary.toLowerCase().includes(needle)).slice(0, 6))
        out.push({ key: `l${e.id}`, group: 'Decisions', icon: MapPin, label: e.summary, sub: e.sim_time, run: () => navigate('/officer/agents') })
    return out.slice(0, 40)
  }, [q, scenario, camps, trucks, hazards, log, role, session.user.scope_id])

  const go = (h: Hit | undefined) => {
    if (!h) return
    setOpen(false)
    setQ('')
    h.run()
  }
  let group = ''
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 hover:border-slate-300"
        data-testid="search-open"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 truncate text-left">Search camps, trucks, roads, decisions…</span>
        <kbd className="hidden rounded border border-slate-200 bg-white px-1.5 text-[10px] font-medium text-slate-500 sm:inline">⌘K</kbd>
      </button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ('') }}>
        <DialogContent className="top-[15%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">Find a page, camp, truck, warehouse, closed road or decision</DialogDescription>
          <div className="flex items-center gap-2 border-b px-4">
            <Search className="size-4 text-slate-400" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setI(0)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(x + 1, hits.length - 1)) }
                if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(x - 1, 0)) }
                if (e.key === 'Enter') go(hits[i])
              }}
              placeholder="Majuli, T3, NH-715, approvals…"
              className="h-12 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              aria-label="Search"
              data-testid="search-input"
            />
          </div>
          <ul className="max-h-[380px] overflow-y-auto py-2" role="listbox">
            {hits.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">No matches.</li>}
            {hits.map((h, k) => {
              const head = h.group !== group
              group = h.group
              return (
                <li key={h.key}>
                  {head && <div className="px-4 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{h.group}</div>}
                  <button
                    role="option"
                    aria-selected={k === i}
                    onMouseEnter={() => setI(k)}
                    onClick={() => go(h)}
                    className={cn('flex w-full items-center gap-3 px-4 py-2 text-left', k === i && 'bg-slate-100')}
                    data-testid="search-result"
                  >
                    <h.icon className="size-4 shrink-0 text-slate-500" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-900">{h.label}</span>
                      {h.sub && <span className="block truncate text-xs text-slate-500">{h.sub}</span>}
                    </span>
                    {k === i && <CornerDownLeft className="size-3.5 text-slate-400" aria-hidden />}
                  </button>
                </li>
              )
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
