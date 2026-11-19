import { useMemo } from 'react'
import { useSession } from '../../auth'
import { useStore } from '../../store'

/** The coordinator's own camp (from the login scope) with its static definition. */
export function useMyCamp() {
  const session = useSession()
  const id = session?.user.scope_id ?? ''
  const camp = useStore((s) => s.camps[id])
  const def = useStore((s) => s.scenario?.camps.find((c) => c.id === id))
  const trucks = useStore((s) => s.trucks)
  const incoming = useMemo(() => Object.values(trucks).filter((t) => t.job?.camp_id === id && t.job.status === 'dispatched'), [trucks, id])
  const pop = camp?.population ?? def?.population ?? 0
  const burn = { water_l: pop * 3, food_rations: pop, medical_kits: pop / 100 }
  return { id, camp, def, incoming, pop, burn }
}
