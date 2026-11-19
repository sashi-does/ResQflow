export function Logo({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#2563eb" />
      <path d="M16 6c-3.6 4.6-6 8.1-6 11a6 6 0 0 0 12 0c0-2.9-2.4-6.4-6-11Z" fill="#fff" />
      <path d="M12.5 18.5h7" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m17 16 2.5 2.5L17 21" stroke="#2563eb" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
