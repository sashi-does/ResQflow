import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { CAMP_COLORS, TRUCK_COLORS } from '../lib/format'

function Dot({ color }: { color: string }) {
  return <span className="inline-block size-2.5 rounded-full ring-2 ring-white" style={{ background: color }} />
}

function Line({ color, dashed = false, width = 2.5 }: { color: string; dashed?: boolean; width?: number }) {
  return (
    <svg width="22" height="8" className="shrink-0" aria-hidden>
      <line x1="1" y1="4" x2="21" y2="4" stroke={color} strokeWidth={width} strokeDasharray={dashed ? '4 3' : undefined} />
    </svg>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">{title}</div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1">{children}</div>
    </div>
  )
}

function Item({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return <div className={`flex items-center gap-1.5 whitespace-nowrap ${wide ? 'col-span-2' : ''}`}>{children}</div>
}

/** Map legend, always visible on any map (doc 11). Collapsible to a single row. */
export function Legend({ defaultOpen = true }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="absolute right-3 bottom-6 z-[1000] w-56 rounded-lg border border-slate-200 bg-white/95 text-xs text-slate-700 shadow-sm backdrop-blur" data-testid="legend">
      <button className="flex w-full items-center px-3 py-2 font-medium text-slate-900" onClick={() => setOpen(!open)} aria-expanded={open}>
        Legend <ChevronDown className={`ml-auto size-3.5 text-slate-500 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden />
      </button>
      {open && (
        <div className="space-y-2 border-t border-slate-100 px-3 py-2">
          <Group title="Camps">
            <Item><Dot color={CAMP_COLORS.ok} /> OK</Item>
            <Item><Dot color={CAMP_COLORS.low} /> Low</Item>
            <Item><Dot color={CAMP_COLORS.critical} /> Critical</Item>
            <Item><Dot color={CAMP_COLORS.cut_off} /> Cut off</Item>
          </Group>
          <Group title="Trucks">
            <Item><Dot color={TRUCK_COLORS.en_route} /> Delivering</Item>
            <Item><Dot color={TRUCK_COLORS.loading} /> Loading</Item>
            <Item><Dot color={TRUCK_COLORS.holding} /> Holding</Item>
            <Item><span className="wh-icon !size-3" /> Warehouse</Item>
          </Group>
          <Group title="Roads">
            <Item wide><Line color="#0d9488" width={3} /> Active route</Item>
            <Item wide><Line color="#dc2626" dashed /> Closed by flood</Item>
            <Item><span className="inline-block h-3 w-5 rounded-sm border border-blue-600 bg-blue-500/25" /> Flood</Item>
            <Item><Line color="#0284c7" dashed width={2} /> Ferry</Item>
          </Group>
        </div>
      )}
    </div>
  )
}
