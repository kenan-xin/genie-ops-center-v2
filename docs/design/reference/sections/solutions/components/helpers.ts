/** One focus ring for every interactive element (tokens: 2px blue-500 at 60%, 2px offset). */
export const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950'
export const btnPrimary = `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-xl bg-blue-600 px-3.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 motion-safe:transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:bg-gray-800 dark:disabled:text-gray-500 ${focusRing}`
export const btnSecondary = `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-xl border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800 motion-safe:transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-900 ${focusRing}`
export const btnDanger = `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-xl bg-red-600 px-3.5 text-sm font-semibold text-white motion-safe:transition-colors hover:bg-red-700 ${focusRing}`
export const btnGhost = `inline-flex h-8 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-gray-700 motion-safe:transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 ${focusRing}`
export const inputClass = `h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-500 focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 ${focusRing}`
export const labelClass = 'text-sm font-semibold text-gray-800 dark:text-gray-200'

/** Public HTTPS only: private, loopback, and link-local hosts are refused, as the proxy does on every call. */
export function isPublicHttps(url: string) {
  return /^https:\/\/(?!localhost|127\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)[^\s/$.?#].[^\s]*$/i.test(url)
}

/** The deployment's usual external chat API address, prefilled at registration and editable. */
export const DEFAULT_CHAT_API_ENDPOINT = 'https://chat.genie.example/public-api/v2/workflow/chatbot/chats'

const NOW = new Date('2026-09-16T09:45:00Z')

export function relativeTime(iso: string | null, now = NOW) {
  if (!iso) return 'Never'
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

export function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' })
}

export function fmtDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore' })
}

import type { SolutionStatus } from '@/../product/sections/solutions/types'

export const STATUS_META: Record<SolutionStatus, { tone: 'gray' | 'blue' | 'green' | 'red' | 'amber'; label: string }> = {
  draft: { tone: 'gray', label: 'Draft' },
  ready: { tone: 'green', label: 'Ready' },
  maintenance: { tone: 'amber', label: 'Maintenance' },
  down: { tone: 'red', label: 'Down' },
}

/** White or near-black text for a hex background, by relative luminance. */
export function foregroundFor(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const ch = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const l = 0.2126 * ch(n >> 16) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255)
  return l > 0.4 ? '#111827' : '#ffffff'
}

/** WCAG contrast ratio between two hex colors. */
export function contrastRatio(a: string, b: string) {
  const lum = (hex: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
    if (!m) return 0
    const n = parseInt(m[1], 16)
    const ch = (v: number) => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * ch(n >> 16) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255)
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
}
