/** RahatNet mark: a river line under a route arrow, in the brand teal. */
export function Logo({ className = 'size-8', inverted = false }: { className?: string; inverted?: boolean }) {
  const bg = inverted ? '#ffffff' : '#0f766e'
  const fg = inverted ? '#0f766e' : '#ffffff'
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" fill={bg} />
      <path d="M6 20.5c2.5 0 2.5-1.8 5-1.8s2.5 1.8 5 1.8 2.5-1.8 5-1.8 2.5 1.8 5 1.8" stroke={fg} strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M8 13h13m-3.5-3.5L21 13l-3.5 3.5" stroke={fg} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
