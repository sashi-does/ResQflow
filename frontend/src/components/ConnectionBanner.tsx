import { useStore } from '../store'

export function ConnectionBanner() {
  const connected = useStore((s) => s.connected)
  const ever = useStore((s) => s.everConnected)
  if (connected) return null
  return (
    <div className="absolute top-3 left-1/2 z-[1001] -translate-x-1/2 rounded-md border border-red-500/50 bg-red-950/90 px-4 py-1.5 text-sm text-red-200 shadow-lg">
      {ever ? 'Connection to the simulation lost. Reconnecting…' : 'Connecting to the simulation…'}
    </div>
  )
}
