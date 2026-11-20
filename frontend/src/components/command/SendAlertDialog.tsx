import { Megaphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { api } from '../../api'
import { shortName } from '../../lib/format'
import { useStore } from '../../store'

const TEMPLATES = [
  'Boats are on standby. Keep the most vulnerable people ready to move.',
  'Road closed nearby: your next delivery may be late. Ration drinking water.',
  'Heavy rain expected in the next 24 hours. Move stock off the ground.',
  'Medical team on the way. Report anyone with fever or diarrhoea.',
]

export interface AlertDraft {
  camps: string[] | 'all' | 'risk'
  message?: string
}

/** Command → camps: a short message that shows on each camp's Alerts page (and is logged with the officer's name). */
export function SendAlertDialog({ draft, onClose }: { draft: AlertDraft | null; onClose: () => void }) {
  const scenario = useStore((s) => s.scenario)
  const camps = useStore((s) => s.camps)
  const toast = useStore((s) => s.toast)
  const [msg, setMsg] = useState('')
  const [target, setTarget] = useState<AlertDraft['camps']>('all')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!draft) return
    const t = setTimeout(() => {
      setMsg(draft.message ?? '')
      setTarget(draft.camps)
    }, 0)
    return () => clearTimeout(t)
  }, [draft])
  const atRisk = Object.values(camps).filter((c) => c.cut_off || c.status === 'critical').map((c) => c.id)
  const ids = target === 'all' ? undefined : target === 'risk' ? atRisk : target
  const count = ids ? ids.length : (scenario?.camps.length ?? 0)
  const send = () => {
    setBusy(true)
    api
      .broadcastAlert(msg.trim(), ids)
      .then((r) => {
        toast(`Alert sent to ${r.sent} camp${r.sent === 1 ? '' : 's'}`, 'ok')
        onClose()
      })
      .catch((e: unknown) => toast(String(e), 'error'))
      .finally(() => setBusy(false))
  }
  const chip = (on: boolean) => cn('rounded-full border px-3 py-1 text-xs font-medium', on ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50')
  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="send-alert">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="size-4 text-brand-700" aria-hidden /> Send an alert to camps
          </DialogTitle>
          <DialogDescription>It appears on each camp coordinator’s Alerts page and in their notifications, with your name in the decision log.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">To</Label>
            <div className="flex flex-wrap gap-1.5">
              <button className={chip(target === 'all')} onClick={() => setTarget('all')}>
                All camps
              </button>
              <button className={chip(target === 'risk')} onClick={() => setTarget('risk')} disabled={!atRisk.length}>
                At risk ({atRisk.length})
              </button>
              {scenario?.camps.map((c) => {
                const on = Array.isArray(target) && target.includes(c.id)
                return (
                  <button
                    key={c.id}
                    className={chip(on)}
                    onClick={() => setTarget(on ? (target as string[]).filter((x) => x !== c.id) : [...(Array.isArray(target) ? target : []), c.id])}
                  >
                    {shortName(c.name)}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <Label htmlFor="alert-msg" className="mb-2 block">
              Message
            </Label>
            <Textarea id="alert-msg" value={msg} maxLength={280} rows={3} onChange={(e) => setMsg(e.target.value)} placeholder="Write a short, clear instruction…" data-testid="alert-message" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TEMPLATES.map((t) => (
                <button key={t} className="rounded-md bg-slate-100 px-2 py-1 text-left text-[11px] text-slate-700 hover:bg-slate-200" onClick={() => setMsg(t)}>
                  {t.split('.')[0]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={send} disabled={busy || !msg.trim() || count === 0} data-testid="alert-send">
            <Megaphone /> Send to {count} camp{count === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
