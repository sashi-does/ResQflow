import { useCallback } from 'react'
import { useStore } from '../store'
import { shortName } from './format'

/** Fictional drivers from the seeded demo accounts (backend/app/auth/users.py). */
export const DRIVER_NAMES: Record<string, string> = { T3: 'Bikash Kalita' }

export function truckLabel(id: string): string {
  return DRIVER_NAMES[id] ? `Truck ${id} · ${DRIVER_NAMES[id]}` : `Truck ${id}`
}

/** Human names for ids, so pages never show raw ids. */
export function useNames() {
  const scenario = useStore((s) => s.scenario)
  const camp = useCallback(
    (id: string, short = true) => {
      const n = scenario?.camps.find((c) => c.id === id)?.name ?? id
      return short ? shortName(n) : n
    },
    [scenario],
  )
  const warehouse = useCallback((id: string) => shortName(scenario?.warehouses.find((w) => w.id === id)?.name ?? id), [scenario])
  const node = useCallback((id: string) => shortName(scenario?.nodes.find((n) => n.id === id)?.name ?? id), [scenario])
  return { camp, warehouse, node, truck: truckLabel }
}
