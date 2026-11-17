import { useEffect } from 'react'
import { api } from './api'
import { PRESET_BUTTONS } from './lib/presets'
import { awaitingApproval, useStore } from './store'

/** Space = play/pause, 1-4 = trigger floods, A = approve the top approval card. */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return
      const s = useStore.getState()
      const fail = (e: unknown) => s.toast(String(e), 'error')
      if (ev.code === 'Space') {
        ev.preventDefault()
        if (s.sim?.running) api.pause().catch(fail)
        else api.start().catch(fail)
        return
      }
      const preset = PRESET_BUTTONS.find((p) => p.key === ev.key)
      if (preset) {
        api.trigger(preset.id).then(() => s.toast(`Flood reported: ${preset.label}`, 'warn'), fail)
        return
      }
      if (ev.key === 'a' || ev.key === 'A') {
        const top = awaitingApproval(s.orders)[0]
        if (!top) return
        api
          .decide(top.id, 'approve')
          .then((o) =>
            o.status === 'dispatched'
              ? s.toast(`Order approved. ${o.truck_id} dispatched.`, 'ok')
              : s.toast(`Order ${o.id} could not go: the situation changed.`, 'error'),
          )
          .catch(fail)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
