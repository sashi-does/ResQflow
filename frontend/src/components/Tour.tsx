import { useState } from 'react'

const STEPS = [
  { target: 'map', title: 'The live map', text: 'Warehouses (squares), relief camps (circles, coloured by days of water left) and trucks moving on real highways.' },
  { target: 'demo-controls', title: 'Make it flood', text: 'Trigger a flood on a real stretch (e.g. NH-715 at Kaziranga) and watch the agents react within seconds.' },
  { target: 'feed', title: 'Agent feed', text: 'Every decision, in plain English, with the reasoning one click away. Click an entry to highlight it on the map.' },
  { target: 'tab-approvals', title: 'Human approval', text: 'Big orders wait for the district officer. Critical ones auto-approve under a policy if nobody is free.' },
  { target: 'kpi-strip', title: 'Did it help?', text: 'The same floods run against a static plan. These are the differences, measured by the simulation.' },
]

export function Tour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0)
  const step = STEPS[i]
  const el = document.querySelector(`[data-tour="${step.target}"], [data-testid="${step.target}"]`)
  const rect = el ? el.getBoundingClientRect() : null
  const top = rect ? Math.min(window.innerHeight - 190, Math.max(60, rect.top + 12)) : 120
  const left = rect ? Math.min(window.innerWidth - 340, Math.max(12, rect.left + 12)) : 120
  return (
    <div className="fixed inset-0 z-[3000]" data-testid="tour">
      <div className="absolute inset-0 bg-slate-950/50" onClick={onClose} />
      {rect && (
        <div
          className="pointer-events-none absolute rounded-lg border-2 border-sky-400 shadow-[0_0_0_9999px_rgba(2,6,23,0.35)]"
          style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }}
        />
      )}
      <div className="absolute w-80 rounded-lg border border-sky-500/60 bg-slate-900 p-4 shadow-2xl" style={{ top, left }}>
        <div className="text-[11px] text-sky-300">
          Step {i + 1} of {STEPS.length}
        </div>
        <div className="mt-1 font-semibold text-white">{step.title}</div>
        <p className="mt-1 text-sm text-slate-300">{step.text}</p>
        <div className="mt-3 flex gap-2">
          <button className="btn-chip" onClick={onClose}>
            Skip
          </button>
          <span className="flex-1" />
          {i > 0 && (
            <button className="btn-chip" onClick={() => setI(i - 1)}>
              Back
            </button>
          )}
          <button className="btn-primary" onClick={() => (i + 1 < STEPS.length ? setI(i + 1) : onClose())}>
            {i + 1 < STEPS.length ? 'Next' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  )
}
