import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { api } from '../../api'
import { useSession } from '../../auth'
import { useStore } from '../../store'

/** Full-screen "Route changed" overlay on every driver page until the driver acknowledges (doc 11 §3.3). */
export function RerouteAlert() {
  const id = useSession()?.user.scope_id ?? ''
  const alert = useStore((s) => s.trucks[id]?.pending_reroute)
  const toast = useStore((s) => s.toast)
  const [busy, setBusy] = useState(false)
  if (!alert) return null
  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-red-700 p-6 text-white" role="alertdialog" aria-modal="true" aria-labelledby="reroute-title" data-testid="reroute-alert">
      <div className="w-full max-w-md text-center">
        <TriangleAlert className="mx-auto size-16" aria-hidden />
        <h2 id="reroute-title" className="mt-4 text-3xl font-bold">
          Route changed
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-white/95">{alert.message.replace(/^Route changed\. /, '')}</p>
        <p className="mt-3 text-sm text-white/80">Sent by the Routing agent at {alert.at}</p>
        <button
          className="mt-8 w-full rounded-xl bg-white py-4 text-xl font-bold text-red-800 hover:bg-red-50 focus-visible:ring-4 focus-visible:ring-white/60 focus-visible:outline-none"
          disabled={busy}
          data-testid="ack"
          onClick={() => {
            setBusy(true)
            api
              .ack(id)
              .then(() => toast('Acknowledged. The District Officer has been told.', 'ok'))
              .catch((e: unknown) => toast(String(e), 'error'))
              .finally(() => setBusy(false))
          }}
        >
          Acknowledge
        </button>
      </div>
    </div>
  )
}
