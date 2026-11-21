import { Bell, CheckCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { Session } from '../../auth'
import { buildNotices, type Tone } from '../../lib/notifications'
import { navigate } from '../../router'
import { useStore } from '../../store'

const DOT: Record<Tone, string> = { red: 'bg-red-500', amber: 'bg-amber-500', green: 'bg-emerald-500', blue: 'bg-brand-500', slate: 'bg-slate-400' }

function seenKey(s: Session) {
  return `resqflow.seen.${s.user.username}`
}

function readSeen(s: Session): number {
  try {
    return Number(localStorage.getItem(seenKey(s)) ?? 0)
  } catch {
    return 0
  }
}

/** Bell with an unread count; the panel lists what needs this person's attention, newest first. */
export function Notifications({ session }: { session: Session }) {
  const log = useStore((s) => s.log)
  const alerts = useStore((s) => s.alerts)
  const notices = useMemo(() => buildNotices(session.user.role, log, alerts), [session.user.role, log, alerts])
  const [seen, setSeen] = useState(() => readSeen(session))
  const [open, setOpen] = useState(false)
  const top = notices[0]?.seq ?? 0
  const mark = seen > top ? 0 : seen // the log restarts at 1 after a reset: a stale high-water mark means nothing seen
  const unread = notices.filter((n) => n.seq > mark).length
  const markAll = () => {
    setSeen(top)
    try {
      localStorage.setItem(seenKey(session), String(top))
    } catch {
      /* per-viewer convenience only */
    }
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-slate-600" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} data-testid="notif-bell">
          <Bell />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] leading-4 font-semibold text-white tnum" data-testid="notif-count">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0" data-testid="notif-panel">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="text-sm font-semibold text-slate-900">Notifications</div>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAll} disabled={!unread}>
            <CheckCheck /> Mark all read
          </Button>
        </div>
        {notices.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">Nothing yet. You’ll be told here when something needs you.</p>
        ) : (
          <ul className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
            {notices.map((n) => (
              <li key={n.key}>
                <button
                  className={cn('flex w-full gap-3 px-4 py-2.5 text-left hover:bg-slate-50', n.seq > mark && 'bg-brand-50/40')}
                  onClick={() => {
                    setOpen(false)
                    navigate(n.to)
                  }}
                  data-testid="notif-item"
                >
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', DOT[n.tone])} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-slate-900">{n.title}</span>
                      <span className="ml-auto text-slate-500 tnum">{n.at}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-slate-600">{n.text}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
