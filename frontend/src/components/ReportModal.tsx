import { AGENT_COLORS, AGENT_LABEL, fmtNum } from '../lib/format'
import { fmtKpi as fmt } from '../lib/kpiFormat'
import { useStore } from '../store'

/** After-action report (doc 10 E). Every number here comes from the simulation; the AI (if any) wrote only the prose. */
export function ReportModal() {
  const report = useStore((s) => s.report)
  const open = useStore((s) => s.reportOpen)
  const setReport = useStore((s) => s.setReport)
  if (!report || !open) return null
  return (
    <div className="fixed inset-0 z-[4000] flex items-start justify-center overflow-y-auto bg-slate-950/80 p-6 print:static print:bg-white print:p-0" data-testid="report">
      <article className="print-report w-full max-w-4xl rounded-xl border border-slate-700 bg-slate-900 p-8 text-slate-200 shadow-2xl print:max-w-none print:border-0 print:bg-white print:p-0 print:text-black print:shadow-none">
        <header className="flex items-start gap-4">
          <div>
            <div className="text-xs tracking-widest text-slate-400 uppercase print:text-gray-500">RahatNet · After-action report</div>
            <h1 className="mt-1 text-2xl font-bold text-white print:text-black">{report.title}</h1>
            <div className="text-sm text-slate-400 print:text-gray-600">Generated at sim time {report.generated_at_sim}</div>
          </div>
          <div className="ml-auto flex gap-2 print:hidden">
            <button className="btn-primary" onClick={() => window.print()} data-testid="download-pdf">
              Download PDF
            </button>
            <button className="btn-chip" onClick={() => setReport(report, false)}>
              Close
            </button>
          </div>
        </header>

        <section className="mt-6">
          <h2 className="text-sm font-semibold tracking-wider text-slate-400 uppercase print:text-gray-600">Summary</h2>
          <p className="mt-2 leading-relaxed" data-testid="report-summary">
            {report.narrative.summary}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 print:text-gray-500">
            {report.narrative_source === 'llm' ? `Narrative by ${report.narrative_model}; ` : ''}
            {report.narrative_note || 'every number is filled in from the simulation, not written by the AI.'}
          </p>
        </section>

        <section className="mt-6">
          <h2 className="text-sm font-semibold tracking-wider text-slate-400 uppercase print:text-gray-600">Agentic vs Static (same floods, plan fixed at 06:00)</h2>
          <table className="mt-2 w-full text-sm" data-testid="report-kpis">
            <thead className="text-left text-xs text-slate-400 print:text-gray-600">
              <tr>
                <th className="py-1">KPI</th>
                <th className="py-1 text-right">RahatNet</th>
                <th className="py-1 text-right">Static plan</th>
                <th className="py-1 text-right">Δ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 print:divide-gray-300">
              {report.kpi_rows.map((r) => (
                <tr key={r.key}>
                  <td className="py-1.5">{r.label}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums" data-testid={`report-${r.key}`}>
                    {fmt(r.key, r.agentic)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(r.key, r.static)}</td>
                  <td className={`py-1.5 text-right tabular-nums ${r.better === true ? 'text-emerald-400 print:text-green-700' : r.better === false ? 'text-red-400 print:text-red-700' : ''}`}>
                    {r.delta_pct == null ? '—' : `${r.delta_pct > 0 ? '+' : ''}${r.delta_pct.toFixed(0)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="mt-6 grid grid-cols-2 gap-6 print:grid-cols-1">
          <section>
            <h2 className="text-sm font-semibold tracking-wider text-slate-400 uppercase print:text-gray-600">Cut off & escalated</h2>
            {report.cut_off.length === 0 && report.escalations.length === 0 && <p className="mt-2 text-sm text-slate-500">Nothing escalated.</p>}
            <ul className="mt-2 space-y-1 text-sm">
              {report.cut_off.map((c) => (
                <li key={c.camp}>
                  <b>{c.camp}</b> ({fmtNum(c.population)} people) · {c.reason}
                  {c.since ? ` · since ${c.since}` : ''}
                </li>
              ))}
              {report.escalations
                .filter((e) => !e.what.endsWith('cut off'))
                .map((e, i) => (
                  <li key={i}>
                    {e.what}: <i>{e.status.replace('_', ' ')}</i>
                    {e.why ? ` (${e.why})` : ''}
                  </li>
                ))}
            </ul>
          </section>
          <section>
            <h2 className="text-sm font-semibold tracking-wider text-slate-400 uppercase print:text-gray-600">Recommendations</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
              {report.narrative.recommendations.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ol>
          </section>
        </div>

        <section className="mt-6">
          <h2 className="text-sm font-semibold tracking-wider text-slate-400 uppercase print:text-gray-600">Timeline of key decisions</h2>
          <ol className="mt-2 space-y-1 text-xs">
            {report.timeline.map((e, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-16 shrink-0 font-mono text-slate-500">{e.sim_time}</span>
                <span className="w-20 shrink-0 font-semibold" style={{ color: AGENT_COLORS[e.agent] }}>
                  {AGENT_LABEL[e.agent]}
                </span>
                <span>{e.summary}</span>
              </li>
            ))}
          </ol>
        </section>
      </article>
    </div>
  )
}
