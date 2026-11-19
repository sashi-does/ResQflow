import { useEffect, useState } from 'react'
import { api } from './api'
import { Copilot } from './components/Copilot'
import { Toasts } from './components/Toasts'
import { Tour } from './components/Tour'
import { TopBar } from './components/TopBar'
import { useKeyboardShortcuts } from './hooks'
import { Command } from './pages/Command'
import { Intro } from './pages/Intro'
import { CampView } from './pages/CampView'
import { DriverView } from './pages/DriverView'
import { WarehouseView } from './pages/WarehouseView'
import { parseRoute, usePath } from './router'
import { useStore } from './store'
import { useLiveSocket } from './ws'

export default function App() {
  const setHealth = useStore((s) => s.setHealth)
  const setScenario = useStore((s) => s.setScenario)
  const setError = useStore((s) => s.setError)
  const route = parseRoute(usePath())
  const [touring, setTouring] = useState(false)
  const [copilot, setCopilot] = useState(false)

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
      <TopBar
        onTour={route.page === 'command' ? () => setTouring(true) : undefined}
        onCopilot={route.page === 'command' ? () => setCopilot((v) => !v) : undefined}
      />
      {route.page === 'command' && <Command />}
      {route.page === 'camp' && <CampView campId={route.id} />}
      {route.page === 'driver' && <DriverView truckId={route.id} />}
      {route.page === 'warehouse' && <WarehouseView warehouseId={route.id} />}
      {touring && <Tour onClose={() => setTouring(false)} />}
      {copilot && route.page === 'command' && <Copilot onClose={() => setCopilot(false)} />}
      <Toasts />
    </div>
  )
}
