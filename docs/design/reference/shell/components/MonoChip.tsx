/** Mono chip (tokens: Pills and chips). JetBrains Mono, uppercase, letter-spaced. For THIS DEVICE, WORKSPACE MEMBER, ADMINISTRATOR. */
export function MonoChip({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-gray-100 px-1.5 py-px font-mono text-xs font-medium uppercase tracking-wide text-gray-700 dark:bg-gray-800 dark:text-gray-300 ${className}`}
    >
      {children}
    </span>
  )
}
