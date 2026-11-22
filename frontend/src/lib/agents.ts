import type { AgentName } from '../types'

/** What each agent does and what it hands to the next stage. The order is the real data flow in the backend. */
export const AGENTS: Record<AgentName, { name: string; does: string; ai?: boolean }> = {
  field_intake: { name: 'Field Intake', does: 'Reads camp reports into numbers', ai: true },
  monitor: { name: 'Monitor', does: 'Floods, closures, rain' },
  inventory: { name: 'Inventory', does: 'Days of cover per camp' },
  routing: { name: 'Routing', does: 'Safe roads; re-routes trucks' },
  coordinator: { name: 'Coordinator', does: 'Plans who gets what', ai: true },
  validator: { name: 'Validator', does: 'Checks every plan' },
  dispatcher: { name: 'Dispatcher', does: 'Sends trucks; asks approval' },
  supply: { name: 'Supply', does: 'Re-orders stock from suppliers' },
  human: { name: 'People', does: 'Approve, confirm, acknowledge' },
  system: { name: 'System', does: 'Scenario events' },
}

