import { useEffect, useState } from 'react'
import { api } from './api'
import { Toasts } from './components/Toasts'
import { Tour } from './components/Tour'
import { TopBar } from './components/TopBar'
import { useKeyboardShortcuts } from './hooks'
import { Command } from './pages/Command'
import { Intro } from './pages/Intro'
import { Placeholder } from './pages/Placeholder'
import { parseRoute, usePath } from './router'
import { useStore } from './store'
import { useLiveSocket } from './ws'

export default function App() {
  const setHealth = useStore((s) => s.setHealth)
  const setScenario = useStore((s) => s.setScenario)
  const setError = useStore((s) => s.setError)
  const route = parseRoute(usePath())
  const [touring, setTouring] = useState(false)

  useLiveSocket()
  useKeyboardShortcuts(route.page === 'command')

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null))
    api
      .scenario()
      .then(setScenario)
      .catch((e: unknown) => setError(String(e)))
  }, [setHealth, setScenario, setError])

  useEffect(() => {
    document.title =
      route.page === 'intro' ? 'RahatNet — Flood Relief Agent Swarm' : `RahatNet · ${route.page[0].toUpperCase()}${route.page.slice(1)}`
  }, [route.page])

  if (route.page === 'intro') {
    return (
      <>
        <Intro />
        <Toasts />
      </>
    )
  }
  return (
    <div className="flex h-full flex-col">
      <TopBar onTour={route.page === 'command' ? () => setTouring(true) : undefined} />
      {route.page === 'command' && <Command />}
      {route.page === 'camp' && <Placeholder title={`Camp ${route.id}`} />}
      {route.page === 'driver' && <Placeholder title={`Driver ${route.id}`} />}
      {route.page === 'warehouse' && <Placeholder title={`Warehouse ${route.id}`} />}
      {touring && <Tour onClose={() => setTouring(false)} />}
      <Toasts />
    </div>
  )
}
