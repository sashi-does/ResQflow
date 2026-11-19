import { Clock, FastForward, FlaskConical, Pause, PenLine, Play, RotateCcw, Waves, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { api } from '../../api'
import { PageGrid, Section, StatCard, StatGrid } from '../../components/app/blocks'
import { OpsMap } from '../../components/app/OpsMap'
import { useKeyboardShortcuts } from '../../hooks'
import { PRESET_BUTTONS } from '../../lib/presets'
import { useStore } from '../../store'

const SPEEDS = [30, 120, 600]

export function OfficerSimulation() {
  const sim = useStore((s) => s.sim)
  const hazards = useStore((s) => s.hazards)
  const health = useStore((s) => s.health)
  const setHealth = useStore((s) => s.setHealth)
  const scenario = useStore((s) => s.scenario)
  const drawing = useStore((s) => s.drawing)
  const drawPoints = useStore((s) => s.drawPoints)
  const setDrawing = useStore((s) => s.setDrawing)
  const toast = useStore((s) => s.toast)
  useKeyboardShortcuts(true) // Space, 1-4, A: demo shortcuts live only on this page
  const fail = (e: unknown) => toast(String(e), 'error')
  const active = new Set(hazards.map((h) => h.preset_id))
  const floods = hazards.filter((h) => h.kind !== 'rain_advisory').length
  const preset = (id: string) => scenario?.presets.find((p) => p.id === id)

  return (
    <PageGrid>
      <StatGrid>
        <StatCard label="Simulated time" value={sim?.sim_time ?? '—'} sub="24 h scenario, starts D1 06:00" icon={Clock} tone="blue" />
        <StatCard label="Clock" value={sim?.ended ? 'Finished' : sim?.running ? 'Running' : 'Paused'} sub={`${sim?.speed ?? 0}× real time`} icon={sim?.running ? Play : Pause} tone={sim?.running ? 'green' : 'amber'} testId="stat-clock" />
        <StatCard label="Active floods" value={floods} sub="roads closed by water" icon={Waves} tone={floods ? 'red' : 'green'} />
        <StatCard label="Faulty-plan demo" value={health?.demo_inject_fault ? 'On' : 'Off'} sub="shows the safety check" icon={Workflow} tone={health?.demo_inject_fault ? 'amber' : 'blue'} />
      </StatGrid>

      <Section title="Scenario" description="Run Demo resets the world and starts the scripted Assam timeline (Kaziranga floods at 07:15)." className="lg:col-span-5" testId="sim-controls">
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={() => api.runDemo().then(() => toast('Demo started: the Assam flood scenario is running', 'ok'), fail)} data-testid="run-demo">
              <FlaskConical /> Run Demo
            </Button>
            {sim?.running ? (
              <Button size="lg" variant="outline" onClick={() => api.pause().catch(fail)} data-testid="pause">
                <Pause /> Pause
              </Button>
            ) : (
              <Button size="lg" variant="outline" onClick={() => api.start().catch(fail)} disabled={sim?.ended} data-testid="play">
                <Play /> Play
              </Button>
            )}
            <Button size="lg" variant="ghost" onClick={() => api.reset(true).then(() => toast('World reset to D1 06:00', 'info'), fail)}>
              <RotateCcw /> Reset
            </Button>
          </div>
          <div>
            <div className="mb-1.5 text-sm font-medium text-slate-700">Speed</div>
            <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Simulation speed">
              {SPEEDS.map((sp) => (
                <button
                  key={sp}
                  onClick={() => api.speed(sp).catch(fail)}
                  aria-pressed={sim?.speed === sp}
                  className={cn('rounded px-3 py-1 text-sm font-medium', sim?.speed === sp ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100')}
                >
                  <FastForward className="mr-1 inline size-3.5" aria-hidden />
                  {sp}×
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">Speed changes how fast time passes, never the result: every run with the same inputs is identical.</p>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <Label htmlFor="fault">Inject one faulty AI plan</Label>
              <p className="text-xs text-slate-500">On the next Run Demo, one coordinator plan is corrupted on purpose so you can watch the Validator stop it.</p>
            </div>
            <Switch
              id="fault"
              checked={!!health?.demo_inject_fault}
              onCheckedChange={(v) =>
                api
                  .injectFault(v)
                  .then(() => api.health())
                  .then((h) => {
                    setHealth(h)
                    toast(v ? 'Faulty-plan demo on: applies on the next Run Demo' : 'Faulty-plan demo off', 'info')
                  })
                  .catch(fail)
              }
            />
          </div>
          <p className="text-xs text-slate-500">Shortcuts on this page: Space play/pause · 1–4 trigger floods · A approve the top order.</p>
        </div>
      </Section>

      <Section title="Floods and events" description="Trigger the scripted floods by hand, recede them, or send the demo field reports." className="lg:col-span-7">
        <div className="grid gap-2 sm:grid-cols-2">
          {PRESET_BUTTONS.map((p) => {
            const pr = preset(p.id)
            const on = active.has(p.id)
            return (
              <button
                key={p.id}
                disabled={on}
                onClick={() => api.trigger(p.id).then(() => toast(`Flood reported: ${p.label}`, 'warn'), fail)}
                className={cn('flex items-start gap-3 rounded-lg border p-3 text-left transition-colors', on ? 'border-red-200 bg-red-50' : 'hover:border-blue-300 hover:bg-blue-50/40')}
                data-testid={`trigger-${p.id}`}
              >
                <Waves className={cn('mt-0.5 size-5 shrink-0', on ? 'text-red-600' : 'text-blue-600')} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">
                    {p.label} <kbd className="ml-1 rounded border px-1 text-[10px] text-slate-500">{p.key}</kbd>
                  </span>
                  <span className="block text-xs text-slate-500">{on ? 'Active: roads closed' : (pr?.label ?? '')}</span>
                </span>
              </button>
            )
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" disabled={floods === 0} onClick={() => api.recedeAll().then(() => toast('Water receding: roads reopened', 'ok'), fail)}>
            Recede all floods
          </Button>
          <Button variant="outline" onClick={() => api.replan().then(() => toast('Re-planning now', 'info'), fail)}>
            Re-plan now
          </Button>
          <Button variant="outline" onClick={() => api.sendDemoReport('en_morigaon').then(() => toast('Demo report sent from Morigaon (English)', 'info'), fail)} data-testid="demo-report-en">
            Morigaon report (English)
          </Button>
          <Button variant="outline" onClick={() => api.sendDemoReport('as_majuli').then(() => toast('Demo report sent from Majuli (Assamese)', 'info'), fail)} data-testid="demo-report-as">
            Majuli report (অসমীয়া)
          </Button>
        </div>
      </Section>

      <Section
        title="Draw a flood"
        description="Outline any flooded area on the map; roads inside it close and trucks re-route."
        action={
          drawing ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={drawPoints.length < 3}
                onClick={() =>
                  api
                    .customFlood('Reported flooding (drawn on map)', drawPoints)
                    .then((h) => toast(h.edge_ids.length ? `Flood added: ${h.edge_ids.length} road segment(s) closed` : 'Flood added: it does not cross any road', 'warn'))
                    .catch(fail)
                    .finally(() => setDrawing(false))
                }
              >
                Finish ({drawPoints.length} points)
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDrawing(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setDrawing(true)}>
              <PenLine /> Draw flood
            </Button>
          )
        }
        className="lg:col-span-12"
      >
        <OpsMap className="h-[420px]" />
      </Section>
    </PageGrid>
  )
}
