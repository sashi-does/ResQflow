import { awaitingApproval, useStore } from '../store'
import type { Tab } from '../store'
import { AgentFeed } from './AgentFeed'
import { AgentsView } from './AgentsView'
import { ApprovalsList } from './ApprovalsList'
import { CampsTable } from './CampsTable'

export function RightPanel() {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const orders = useStore((s) => s.orders)
  const reports = useStore((s) => s.fieldReports)
  const hazards = useStore((s) => s.hazards)
  const pending =
    awaitingApproval(orders).length +
    Object.values(reports).filter((r) => r.status === 'pending_confirmation' || r.status === 'unparsed').length +
    hazards.filter((h) => h.verified === false).length
  const tabs: { id: Tab; label: string }[] = [
    { id: 'feed', label: 'Agent Feed' },
    { id: 'agents', label: 'Agents' },
    { id: 'approvals', label: 'Approvals' },
    { id: 'camps', label: 'Camps' },
  ]
  return (
    <aside className="flex min-h-0 w-[34%] min-w-[380px] max-w-[520px] flex-col border-l border-slate-800 bg-slate-900">
      <nav className="flex shrink-0 border-b border-slate-800" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            data-testid={`tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`relative flex-1 px-3 py-2.5 text-sm ${tab === t.id ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {t.label}
            {t.id === 'approvals' && pending > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-slate-950">
                {pending}
              </span>
            )}
            {tab === t.id && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded bg-sky-400" />}
          </button>
        ))}
      </nav>
      {tab === 'feed' && <AgentFeed />}
      {tab === 'agents' && <AgentsView />}
      {tab === 'approvals' && <ApprovalsList />}
      {tab === 'camps' && <CampsTable />}
    </aside>
  )
}
