import { useSession } from '../../auth'
import { useStore } from '../../store'

export function useMyWarehouse() {
  const id = useSession()?.user.scope_id ?? ''
  const wh = useStore((s) => s.warehouses[id])
  const def = useStore((s) => s.scenario?.warehouses.find((w) => w.id === id))
  return { id, wh, def }
}
