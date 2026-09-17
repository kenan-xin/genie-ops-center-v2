import type { ConfigField, ConfigValue } from '@/../product/sections/audit-and-tenant-settings/types'

/** The one focus ring (tokens.md): 2px blue-500 at 60% with a 2px offset, on every interactive element. */
export const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950'
export const btnPrimary =
  `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-xl bg-blue-600 px-3.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 motion-safe:transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:bg-gray-800 dark:disabled:text-gray-500 ${focusRing}`
export const btnSecondary =
  `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-xl border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800 motion-safe:transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-900 ${focusRing}`
export const btnDanger =
  `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-xl bg-red-600 px-3.5 text-sm font-semibold text-white shadow-sm shadow-red-600/20 motion-safe:transition-colors hover:bg-red-700 ${focusRing}`
/** Text button: 44px tall on phones for the touch target, 32px from sm. */
export const btnGhost =
  `inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-gray-700 motion-safe:transition-colors hover:bg-gray-100 sm:h-8 dark:text-gray-300 dark:hover:bg-gray-800 ${focusRing}`
export const inputClass =
  `h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-500 aria-[invalid=true]:border-red-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 ${focusRing}`
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
