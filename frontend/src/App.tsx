import { useEffect } from 'react'
import { api } from './api'
import { MapView } from './components/MapView'
import { useStore } from './store'

export default function App() {
  const { health, scenario, error, setHealth, setScenario, setError } = useStore()

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null))
    api
      .scenario()
      .then(setScenario)
      .catch((e: unknown) => setError(String(e)))
  }, [setHealth, setScenario, setError])

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-slate-800 bg-slate-950 px-4 py-2">
        <span className="font-semibold tracking-tight">RahatNet</span>
        <span className="text-sm text-slate-400">{scenario?.name ?? 'Assam Floods'}</span>
        {error && <span className="text-xs text-red-400">{error}</span>}
        <span className="ml-auto text-xs text-slate-400">LLM: {health ? health.llm_provider : 'backend offline'}</span>
      </header>
      <main className="min-h-0 flex-1">
        <MapView />
      </main>
    </div>
  )
}
