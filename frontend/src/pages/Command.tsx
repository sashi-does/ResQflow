import { ConnectionBanner } from '../components/ConnectionBanner'
import { DemoControls } from '../components/DemoControls'
import { KpiStrip } from '../components/KpiStrip'
import { Legend } from '../components/Legend'
import { MapView } from '../components/MapView'
import { RightPanel } from '../components/RightPanel'
import { useStore } from '../store'

export function Command() {
  const scenario = useStore((s) => s.scenario)
  const error = useStore((s) => s.error)
  return (
    <>
      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1" data-tour="map">
          <MapView />
          {scenario && <DemoControls />}
          {scenario && <Legend />}
          <ConnectionBanner />
          {!scenario && (
            <div className="absolute inset-0 z-[1002] flex items-center justify-center bg-slate-950/80 text-sm text-slate-400">
              {error ? `Could not load the scenario: ${error}` : 'Loading the Assam scenario…'}
            </div>
          )}
        </main>
        <RightPanel />
      </div>
      <KpiStrip />
    </>
  )
}
