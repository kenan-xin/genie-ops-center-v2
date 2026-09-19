import { useEffect, useRef, useState } from 'react'
import type { ConfigField, ConfigValue } from '@/../product/sections/audit-and-tenant-settings/types'

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
  `h-10 w-full rounded-lg border border-gray-500 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-500 aria-[invalid=true]:border-red-500 dark:border-gray-500 dark:bg-gray-950 dark:text-gray-100 ${focusRing}`

/**
 * Design-only loading state (tokens.md, Buttons): `trigger` flips `loading` for `ms`, then runs `fn`.
 * A press while loading is ignored.
 */
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
export const labelClass = 'text-sm font-semibold text-gray-800 dark:text-gray-200'

/** Fixed design clock so relative times in screenshots are stable. */
export const NOW = new Date('2026-09-16T09:45:00Z')

export function relativeTime(iso: string, now = NOW) {
  const s = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} d ago`
  return fmtDate(iso)
}

export function fmtDate(iso: string, timeZone = 'Asia/Singapore') {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone })
}

export function fmtDateTime(iso: string, timeZone = 'Asia/Singapore') {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone })
}

/** Exact time with seconds and zone, for the detail sheet. */
export function fmtExact(iso: string, timeZone = 'Asia/Singapore') {
  return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short', timeZone })
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
}

/** `role_assignment` to `Role assignment`. */
export function humanize(key: string) {
  const s = key.replace(/[_-]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** The module prefix of an action key: `solutions:status:changed` to `solutions`. */
export function actionModule(action: string) {
  return action.split(':')[0]
}

/** Start of the day in the given zone, as an instant. Good enough for the design clock. */
export function startOfDay(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const secondsIntoDay = get('hour') * 3600 + get('minute') * 60 + get('second')
  return new Date(now.getTime() - secondsIntoDay * 1000)
}

/** True when a metadata value reads like an id or key and belongs in mono. */
export function looksLikeCode(v: unknown) {
  return typeof v === 'string' && (/^[a-z]+_[a-z0-9_-]+$/i.test(v) || /^[a-z-]+:[a-z:-]+$/i.test(v) || /^\d{1,3}(\.\d{1,3}){3}$/.test(v) || /^#[0-9a-f]{6}$/i.test(v))
}

export function formatMetaValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'number') return v.toLocaleString('en-GB')
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.length ? v.map(formatMetaValue).join(', ') : '—'
  return JSON.stringify(v)
}

/**
 * Edit distance with transposition (optimal string alignment), stopped once it passes `max`. The
 * transposition case matters: “remidners” for “reminders” is two plain edits and one swap, and a
 * swap is the typo people make most.
 */
function distance(a: string, b: string, max = 1) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, i) => i)]
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(rows[i - 1][j] + 1, row[j - 1] + 1, rows[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, rows[i - 2][j - 2] + 1)
      row[j] = v
    }
    if (Math.min(...row) > max) return max + 1
    rows.push(row)
  }
  return rows[a.length][b.length]
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean)

/**
 * Typo-tolerant match for the settings search. Every word of the query must match a word of the
 * haystack: the haystack word contains it, or, from four characters, it is one edit or one swap
 * away. So "timout" finds "Idle timeout" and "remidners" finds "Renewal reminders". The haystack is the
 * setting's title, its description, its keywords, and its section name. It never holds a saved value
 * and never a secret.
 */
export function matchesQuery(haystack: string, query: string) {
  const terms = words(query)
  if (terms.length === 0) return false
  const pool = words(haystack)
  return terms.every((t) => pool.some((w) => w.includes(t) || (t.length >= 4 && distance(t, w) <= 1)))
}

/** One validation message per field, mirroring the constraints the zod schema carries (DEC-28). */
export function validateField(field: ConfigField, value: ConfigValue | undefined): string | null {
  switch (field.kind) {
    case 'string': {
      const s = typeof value === 'string' ? value : ''
      if (field.required && !s.trim()) return `${field.title} is required.`
      if (field.maxLength !== undefined && s.length > field.maxLength) return `Keep ${field.title.toLowerCase()} to ${field.maxLength} characters.`
      if (field.pattern && s && !new RegExp(field.pattern).test(s)) return field.patternMessage ?? `${field.title} has the wrong format.`
      return null
    }
    case 'number': {
      if (value === undefined || value === '' || Number.isNaN(Number(value))) return field.required ? `${field.title} is required.` : null
      const n = Number(value)
      if (field.min !== undefined && n < field.min) return `${field.title} must be at least ${field.min.toLocaleString('en-GB')}.`
      if (field.max !== undefined && n > field.max) return `${field.title} must be at most ${field.max.toLocaleString('en-GB')}.`
      return null
    }
    case 'boolean': {
      if (field.required && typeof value !== 'boolean') return 'Choose on or off.'
      return null
    }
    case 'enum': {
      if (field.required && !value) return `Choose a value for ${field.title.toLowerCase()}.`
      return null
    }
    case 'string-list': {
      const list = Array.isArray(value) ? value : []
      if (field.itemLimit !== undefined && list.length > field.itemLimit) return `At most ${field.itemLimit} entries.`
      if (field.pattern) {
        const re = new RegExp(field.pattern)
        const bad = list.findIndex((x) => x.trim() && !re.test(x.trim()))
        if (bad >= 0) return `Entry ${bad + 1}: ${field.patternMessage ?? 'wrong format.'}`
      }
      if (list.some((x) => !x.trim())) return 'Remove empty entries before saving.'
      return null
    }
    default:
      return null
  }
}
