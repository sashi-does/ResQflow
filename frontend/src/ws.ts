import { useEffect } from 'react'
import { useStore } from './store'
import type { WsMessage } from './types'

/** Connects to /ws, applies every message to the store, reconnects with exponential backoff.
 *  On (re)connect the server sends a fresh snapshot, which replaces client state. */
export function useLiveSocket(): void {
  useEffect(() => {
    let ws: WebSocket | null = null
    let retry = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let closed = false
    const { applyMessage, setConnected } = useStore.getState()

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws`)
      ws.onopen = () => {
        retry = 0
        setConnected(true)
      }
      ws.onmessage = (ev: MessageEvent<string>) => {
        try {
          applyMessage(JSON.parse(ev.data) as WsMessage)
        } catch (err) {
          console.warn('bad ws message', err)
        }
      }
      ws.onclose = () => {
        setConnected(false)
        if (closed) return
        const delay = Math.min(8000, 500 * 2 ** retry++)
        timer = setTimeout(connect, delay)
      }
      ws.onerror = () => ws?.close()
    }
    // deferred so React StrictMode's mount/unmount/mount in dev doesn't open and drop a socket
    timer = setTimeout(connect, 0)
    return () => {
      closed = true
      clearTimeout(timer)
      ws?.close()
    }
  }, [])
}
