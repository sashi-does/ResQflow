import type { Role } from '../auth'
import type { CampAlert } from '../api'
import type { LogEntry } from '../types'

export type Tone = 'red' | 'amber' | 'green' | 'blue' | 'slate'

export interface Notice {
  key: string
  seq: number // for unread tracking (log id, or 1e6 + alert number)
  tone: Tone
  title: string
  text: string
  at: string
  to: string
}

type Rule = { tone: Tone; title: string; to: Partial<Record<Role, string>> }

/** Which decision-log events are worth a notification, for whom, and where clicking takes them. */
const RULES: Record<string, Rule> = {
  'approval.requested': { tone: 'amber', title: 'Approval needed', to: { officer: '/officer/approvals', warehouse: '/warehouse/queue' } },
  'field_report.pending': { tone: 'amber', title: 'Field report to confirm', to: { officer: '/officer/field-reports', camp: '/camp/report' } },
  'field_report.unparsed': { tone: 'amber', title: 'Field report needs a person', to: { officer: '/officer/field-reports', camp: '/camp/report' } },
  'field_report.confirmed': { tone: 'green', title: 'Report confirmed', to: { camp: '/camp/report' } },
  'hazard.added': { tone: 'red', title: 'Road closed', to: { officer: '/officer/operations', driver: '/driver/trip', camp: '/camp/my-camp' } },
  'hazard.unverified': { tone: 'amber', title: 'Road report to verify', to: { officer: '/officer/field-reports' } },
  'hazard.removed': { tone: 'green', title: 'Road reopened', to: { officer: '/officer/operations', driver: '/driver/trip' } },
  'truck.rerouted': { tone: 'blue', title: 'Truck re-routed', to: { officer: '/officer/operations', driver: '/driver/trip', warehouse: '/warehouse/queue' } },
  'truck.holding': { tone: 'red', title: 'Truck holding: no safe road', to: { officer: '/officer/operations', driver: '/driver/trip' } },
  'truck.in_flood': { tone: 'red', title: 'Truck in floodwater', to: { officer: '/officer/operations', driver: '/driver/trip' } },
  'camp.critical': { tone: 'red', title: 'Camp critical', to: { officer: '/officer/operations', camp: '/camp/my-camp' } },
  'camp.cut_off': { tone: 'red', title: 'Camp cut off', to: { officer: '/officer/operations', camp: '/camp/my-camp' } },
  'camp.population': { tone: 'amber', title: 'More people arrived', to: { officer: '/officer/operations', camp: '/camp/my-camp' } },
  'stock.arrived': { tone: 'green', title: 'Stock arrived', to: { officer: '/officer/operations', warehouse: '/warehouse/stock' } },
  'plan.rejected': { tone: 'amber', title: 'Validator stopped a plan', to: { officer: '/officer/agents' } },
  'plan.fallback': { tone: 'amber', title: 'AI unavailable: rules planned', to: { officer: '/officer/agents' } },
  'order.recalled': { tone: 'amber', title: 'Order recalled', to: { officer: '/officer/operations', warehouse: '/warehouse/queue' } },
  'order.dispatched': { tone: 'blue', title: 'Truck to load', to: { warehouse: '/warehouse/queue' } },
  'delivery.shortfall': { tone: 'red', title: 'Delivery short', to: { officer: '/officer/operations', warehouse: '/warehouse/stock' } },
  'driver.ack': { tone: 'slate', title: 'Driver acknowledged', to: { officer: '/officer/agents' } },
  'report.ready': { tone: 'green', title: 'After-action report ready', to: { officer: '/officer/reports' } },
}

const ALERT_TONE: Record<CampAlert['kind'], Tone> = { dispatch: 'blue', delay: 'amber', arrival: 'green', broadcast: 'amber' }
const ALERT_TITLE: Record<CampAlert['kind'], string> = {
  dispatch: 'Supplies on the way',
  delay: 'Delivery delayed',
  arrival: 'Supplies arrived',
  broadcast: 'Message from the District Officer',
}

export function buildNotices(role: Role, log: LogEntry[], alerts: CampAlert[], max = 40): Notice[] {
  const out: Notice[] = []
  for (const e of log) {
    const r = RULES[e.kind]
    const to = r?.to[role]
    if (!r || !to) continue
    if (role === 'camp' && e.kind === 'order.dispatched') continue // camps get their own alerts
    out.push({ key: `l${e.id}`, seq: e.id, tone: r.tone, title: r.title, text: e.summary, at: e.sim_time, to })
    if (out.length >= max) break
  }
  if (role === 'camp') {
    for (const a of alerts.slice(0, max)) {
      const n = Number(a.id.replace(/\D/g, '')) || 0
      out.push({ key: `a${a.id}`, seq: 1_000_000 + n, tone: ALERT_TONE[a.kind], title: ALERT_TITLE[a.kind], text: a.en, at: a.sim_time, to: '/camp/alerts' })
    }
  }
  return out.sort((a, b) => b.seq - a.seq).slice(0, max)
}
