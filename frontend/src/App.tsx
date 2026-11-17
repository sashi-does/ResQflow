import { useEffect, useState } from 'react'
import { MapView } from './components/MapView'

interface Health {
  ok: boolean
  llm_provider: string
  weather_mode: string
  version: string
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json() as Promise<Health>)
      .then(setHealth)
      .catch(() => setHealth(null))
  }, [])

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-slate-800 bg-slate-950 px-4 py-2">
        <span className="font-semibold tracking-tight">RahatNet</span>
        <span className="text-sm text-slate-400">Assam Floods</span>
        <span className="ml-auto text-xs text-slate-400">
          LLM: {health ? health.llm_provider : 'backend offline'}
        </span>
      </header>
      <main className="min-h-0 flex-1">
        <MapView />
      </main>
    </div>
  )
}
