import { CloudRain, MapPinOff, Siren, TentTree, Truck, Waves } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { fmtNum, shortName } from './format'
import { truckLabel } from './names'
import { useStore } from '../store'

export type IncidentFilter = 'all' | 'roads' | 'camps' | 'trucks'

export interface Incident {
  key: string
  type: Exclude<IncidentFilter, 'all'>
  icon: LucideIcon
  title: string
  place: string
  status: { tone: 'red' | 'amber' | 'blue' | 'slate'; word: string }
  since: number | null
  meta?: string
  severity: number
  go: () => void
}

export function age(mins: number | null): string {
  if (mins == null) return ''
  if (mins < 60) return `${Math.max(0, Math.round(mins))}m`
  return `${Math.floor(mins / 60)}h${Math.round(mins % 60) ? ` ${Math.round(mins % 60)}m` : ''}`
}

/** Everything that needs attention right now, worst first: floods and closures, camps at risk, trucks stuck. */
export function useIncidents(): Incident[] {
  const hazards = useStore((s) => s.hazards)
  const camps = useStore((s) => s.camps)
  const trucks = useStore((s) => s.trucks)
  const scenario = useStore((s) => s.scenario)
  const sim = useStore((s) => s.sim)
  return useMemo(() => {
    const now = sim?.sim_seconds ?? 0
    const nodes = new Map((scenario?.nodes ?? []).map((n) => [n.id, n]))
    const st = () => useStore.getState()
    const out: Incident[] = []
    for (const h of hazards) {
      const edges = h.edge_ids.map((id) => scenario?.edges.find((e) => e.id === id)).filter((e) => !!e)
      const roads = [...new Set(edges.map((e) => e.road.split(' (')[0]))]
      const mid = edges[0]?.geometry[Math.floor((edges[0].geometry.length - 1) / 2)]
      const affected = Object.values(trucks).filter((t) => (t.route_roads ?? []).some((r) => h.edge_ids.includes(r.edge_id))).length
      const rain = h.kind === 'rain_advisory'
      const report = h.kind === 'driver_report'
      out.push({
        key: `h${h.id}`,
        type: 'roads',
        icon: rain ? CloudRain : report ? Siren : Waves,
        title: rain ? `Heavy rain: ${h.district}` : h.label,
        place: rain ? `${fmtNum(h.rain_24h_mm ?? 0)} mm in 24 h` : roads.join(', ') || `${h.edge_ids.length} road segments`,
        status: report && !h.verified ? { tone: 'amber', word: 'Unverified' } : rain ? { tone: 'amber', word: 'Advisory' } : { tone: 'red', word: 'Road closed' },
        since: h.created_at_sim != null ? (now - h.created_at_sim) / 60 : null,
        meta: affected ? `${affected} truck${affected > 1 ? 's' : ''} routed around it` : undefined,
        severity: rain ? 2 : report ? 3 : 5,
        go: () => mid && st().setFocus(mid[0], mid[1], 9.5),
      })
    }
    for (const def of scenario?.camps ?? []) {
      const c = camps[def.id]
      if (!c || !(c.cut_off || c.status === 'critical')) continue
      const n = nodes.get(def.node_id)
      out.push({
        key: `c${def.id}`,
        type: 'camps',
        icon: c.cut_off ? MapPinOff : TentTree,
        title: `${shortName(def.name)} camp ${c.cut_off ? 'cut off' : 'critical'}`,
        place: `${fmtNum(c.population ?? def.population)} people · water ${c.water_days.toFixed(1)} days`,
        status: c.cut_off ? { tone: 'red', word: 'Cut off' } : { tone: 'red', word: 'Critical' },
        since: null,
        meta: c.cut_off ? 'needs a boat or air drop' : c.incoming && (c.incoming.water_l > 0 || c.incoming.food_rations > 0) ? 'supplies on the way' : 'no truck assigned yet',
        severity: c.cut_off ? 6 : 4,
        go: () => {
          st().setPick({ kind: 'camp', id: def.id })
          if (n) st().setFocus(n.lat, n.lon)
        },
      })
    }
    for (const t of Object.values(trucks)) {
      if (t.status !== 'holding') continue
      out.push({
        key: `t${t.id}`,
        type: 'trucks',
        icon: Truck,
        title: `${truckLabel(t.id)} holding`,
        place: 'no safe road onward',
        status: { tone: 'amber', word: 'Holding' },
        since: null,
        severity: 3,
        go: () => {
          st().setPick({ kind: 'truck', id: t.id })
          st().setFocus(t.lat, t.lon)
        },
      })
    }
    return out.sort((a, b) => b.severity - a.severity || (a.since ?? 1e9) - (b.since ?? 1e9))
  }, [hazards, camps, trucks, scenario, sim?.sim_seconds])
}

