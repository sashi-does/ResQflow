import type { ReactNode } from 'react'

/** Phone-sized layout for the field roles (looks right in a mobile frame in the video). */
export function PhoneFrame({ children, caption }: { children: ReactNode; caption: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center gap-10 overflow-y-auto bg-slate-950 p-6">
      <div className="relative h-[780px] max-h-full w-[390px] shrink-0 overflow-hidden rounded-[44px] border-[10px] border-slate-800 bg-slate-900 shadow-2xl" data-testid="phone">
        <div className="absolute top-0 left-1/2 z-10 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-slate-800" />
        <div className="h-full overflow-y-auto px-4 pt-8 pb-6">{children}</div>
      </div>
      <aside className="hidden max-w-sm text-sm text-slate-400 lg:block">{caption}</aside>
    </div>
  )
}

export function Card({ title, children, tone }: { title?: string; children: ReactNode; tone?: 'warn' | 'bad' | 'ok' }) {
  const border = tone === 'bad' ? 'border-red-500/50' : tone === 'warn' ? 'border-amber-500/50' : tone === 'ok' ? 'border-emerald-500/50' : 'border-slate-700'
  return (
    <section className={`mt-3 rounded-xl border ${border} bg-slate-950/60 p-3`}>
      {title && <h3 className="mb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{title}</h3>}
      {children}
    </section>
  )
}
