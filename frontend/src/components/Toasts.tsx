import { useStore } from '../store'

const TONE = {
  ok: 'border-emerald-500/60 text-emerald-200',
  warn: 'border-amber-500/60 text-amber-200',
  error: 'border-red-500/60 text-red-200',
  info: 'border-sky-500/60 text-sky-200',
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  return (
    <div className="pointer-events-none fixed top-14 left-1/2 z-[2000] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto rounded-md border bg-slate-900/95 px-4 py-2 text-sm shadow-lg ${TONE[t.tone]}`}
        >
          {t.text}
        </button>
      ))}
    </div>
  )
}
