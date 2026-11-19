import { useState } from 'react'
import { CAMP_COLORS, TRUCK_COLORS } from '../lib/format'

function Swatch({ color, ring = false }: { color: string; ring?: boolean }) {
  return (
    <span
      className="inline-block h-3 w-3 rounded-full"
      style={ring ? { border: `2px solid ${color}`, background: `${color}66` } : { background: color }}
    />
  )
}

function Line({ color, dashed = false, glow = false }: { color: string; dashed?: boolean; glow?: boolean }) {
  return (
    <svg width="22" height="8" className="shrink-0">
      <line
        x1="1"
        y1="4"
        x2="21"
        y2="4"
        stroke={color}
        strokeWidth={glow ? 3.5 : 2.5}
        strokeDasharray={dashed ? '4 3' : undefined}
        style={glow ? { filter: `drop-shadow(0 0 3px ${color})` } : undefined}
      />
    </svg>
  )
}

export function Legend() {
  const [open, setOpen] = useState(true)
  return (
    <div className="absolute right-3 bottom-3 z-[1000] w-60 rounded-lg border border-slate-700 bg-slate-900/90 text-xs shadow-xl backdrop-blur" data-testid="legend">
      <button className="flex w-full items-center px-3 py-1.5 font-semibold text-slate-300" onClick={() => setOpen(!open)}>
        Legend <span className="ml-auto text-slate-500">{open ? '▾' : '▴'}</span>
      </button>
      {open && (
        <ul className="space-y-1 px-3 pb-2 text-[11px] text-slate-300">
          <li className="flex items-center gap-2">
            <span className="wh-icon !h-3 !w-3" /> Warehouse
          </li>
          <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="w-11 text-slate-500">Camps</span>
            <Swatch color={CAMP_COLORS.ok} ring /> ok
            <Swatch color={CAMP_COLORS.low} ring /> &lt;1 d
            <Swatch color={CAMP_COLORS.critical} ring /> &lt;0.5 d
            <Swatch color={CAMP_COLORS.cut_off} ring /> cut off
          </li>
          <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="w-11 text-slate-500">Trucks</span>
            <Swatch color={TRUCK_COLORS.en_route} /> delivering
            <Swatch color={TRUCK_COLORS.returning} /> returning
            <Swatch color={TRUCK_COLORS.loading} /> loading
            <Swatch color={TRUCK_COLORS.holding} /> holding
          </li>
          <li className="flex items-center gap-2">
            <Line color="#ef4444" dashed /> Road closed (flooded)
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block h-3 w-5 rounded-sm border border-blue-400 bg-blue-500/35" /> Flood zone
          </li>
          <li className="flex items-center gap-2">
            <Line color="#4ade80" glow /> New safe route
            <Line color="#38bdf8" dashed /> ferry
          </li>
        </ul>
      )}
    </div>
  )
}
