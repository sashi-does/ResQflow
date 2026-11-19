import { useEffect } from 'react'
import { api } from './api'
import { ConnectionBanner } from './components/ConnectionBanner'
import { DemoControls } from './components/DemoControls'
import { KpiStrip } from './components/KpiStrip'
import { Legend } from './components/Legend'
import { MapView } from './components/MapView'
import { RightPanel } from './components/RightPanel'
import { Toasts } from './components/Toasts'
import { TopBar } from './components/TopBar'
import { useKeyboardShortcuts } from './hooks'
import { useStore } from './store'
import { useLiveSocket } from './ws'

export default function App() {
  const setHealth = useStore((s) => s.setHealth)
  const setScenario = useStore((s) => s.setScenario)
  const setError = useStore((s) => s.setError)
  const scenario = useStore((s) => s.scenario)
  const error = useStore((s) => s.error)

  useLiveSocket()
  useKeyboardShortcuts()

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null))
    api
      .scenario()
      .then(setScenario)
      .catch((e: unknown) => setError(String(e)))
  }, [setHealth, setScenario, setError])

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
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
      <Toasts />
    </div>
  )
}
