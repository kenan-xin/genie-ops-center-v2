import { useEffect, useRef, useState } from 'react'

/** The one focus ring (tokens.md): solid blue-500 (blue-400 in dark) with a 2px offset, on every interactive element. */
export const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-gray-950'
export const btnPrimary =
  `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-lg bg-blue-600 px-3.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 motion-safe:transition-colors hover:bg-blue-600/90 active:bg-blue-600/80 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-600 ${focusRing}`
export const btnSecondary =
  `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800 motion-safe:transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-900 dark:disabled:hover:bg-gray-950 ${focusRing}`
export const btnDanger =
  `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-lg bg-red-600 px-3.5 text-sm font-semibold text-white shadow-sm shadow-red-600/20 motion-safe:transition-colors hover:bg-red-600/90 active:bg-red-600/80 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-red-600 ${focusRing}`
/** Text button: 44px tall on phones for the touch target, 32px from sm. */
export const btnGhost =
  `inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-gray-700 motion-safe:transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent sm:h-8 dark:text-gray-300 dark:hover:bg-gray-900 ${focusRing}`
export const inputClass =
  `h-10 w-full rounded-lg border border-gray-500 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-500 dark:border-gray-500 dark:bg-gray-950 dark:text-gray-100 ${focusRing}`
export const labelClass = 'text-sm font-semibold text-gray-800 dark:text-gray-200'
export const linkClass = `rounded font-medium text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`

/** Fixed design clock so relative times in screenshots are stable. */
export const NOW = new Date('2026-09-16T09:45:00Z')

export function fmtDate(iso: string, timeZone = 'Asia/Singapore') {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone })
}

export function relativeTime(iso: string, now = NOW) {
  const s = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000)
  const m = Math.floor(s / 60)
  if (m < 60) return `${Math.max(1, m)} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} d ago`
  return fmtDate(iso)
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
}

/** Design-only loading state (tokens.md, Buttons): flips `loading` for `ms`, then runs `fn`. A press while loading is ignored. */
export function useDelayed(fn: () => void, ms = 900): [boolean, () => void] {
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const trigger = () => {
    if (loading) return
    setLoading(true)
    timer.current = setTimeout(() => {
      setLoading(false)
      fn()
    }, ms)
  }
  return [loading, trigger]
}

/** Enter and Space open a clickable row (tokens.md, Tables). Keys from the row's own buttons are ignored. */
export const rowKeyDown = (open: () => void) => (e: React.KeyboardEvent) => {
  if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
  e.preventDefault()
  open()
}
