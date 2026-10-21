import { useEffect, useRef } from 'react'
/** One focus ring for every interactive element (tokens: 2px solid blue-500, blue-400 in dark, 2px offset). */
export const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-gray-950'
export const btnPrimary = `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-lg bg-blue-600 px-3.5 text-sm font-semibold text-white motion-safe:transition-colors hover:bg-blue-600/90 active:bg-blue-600/80 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600 ${focusRing}`
export const btnSecondary = `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800 motion-safe:transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-900 dark:disabled:hover:bg-gray-950 ${focusRing}`
export const btnDanger = `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-lg bg-red-600 px-3.5 text-sm font-semibold text-white motion-safe:transition-colors hover:bg-red-600/90 active:bg-red-600/80 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-600 ${focusRing}`
export const btnGhost = `inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-gray-700 motion-safe:transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:text-gray-300 dark:hover:bg-gray-900 ${focusRing}`
export const inputClass = `h-10 w-full rounded-lg border border-gray-500 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-500 focus:border-blue-500 dark:border-gray-500 dark:bg-gray-950 dark:text-gray-100 ${focusRing}`
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

export const STATUS_META: Record<SolutionStatus, { tone: 'gray' | 'blue' | 'emerald' | 'red' | 'amber'; label: string }> = {
  draft: { tone: 'gray', label: 'Draft' },
  ready: { tone: 'emerald', label: 'Ready' },
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

/** A solution's accent color at an alpha, for the tinted surface and the glow on its own card. */
export function accentAlpha(hex: string, alpha: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return `rgba(15, 23, 42, ${alpha})`
  const n = parseInt(m[1], 16)
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
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

/* Modal keyboard behavior (tokens.md, Overlays). The same hook sits in each section's `helpers.ts`,
   and the five become one primitive in `packages/ui` after the export. */

/**
 * Every overlay open right now, innermost last. Only the last one owns Escape and Tab, so a confirm
 * dialog opened inside a slide-over does not close both, and the sheet behind it does not compete
 * for the keyboard.
 */
const stack: { panel: HTMLElement | null }[] = []

/** What the outermost overlay stopped from scrolling, so it can give the scrolling back. */
let locked: { el: HTMLElement; overflow: string }[] = []

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** `body` plus every scrolling ancestor of the panel, which is where the shell actually scrolls. */
function scrollers(panel: HTMLElement | null): HTMLElement[] {
  const found: HTMLElement[] = [document.body]
  for (let el = panel?.parentElement; el; el = el.parentElement) {
    const style = getComputedStyle(el)
    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) found.push(el)
  }
  return found
}

/**
 * Focus containment for a hand-built overlay: focus moves into the panel, Tab and Shift+Tab cycle
 * inside it, the page behind it does not scroll, Escape closes, and focus returns to the control
 * that opened it. Put the returned ref on the panel, not on the scrim, so the scrim stays out of
 * the tab order. Production builds this on the approved Base UI dialog, which carries the same four
 * behaviors; this hook is the preview's stand-in for it, not a primitive to copy.
 */
export function useModalFocus<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null)
  const close = useRef(onClose)
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => { close.current = onClose })
  // While the overlay is closed, follow the focus, so the control that opened it is known. Reading
  // `document.activeElement` when the panel opens is too late: a panel with an `autoFocus` control
  // has already taken focus by then, and the opener would be lost.
  useEffect(() => {
    if (open) return
    const remember = () => {
      const el = document.activeElement as HTMLElement | null
      if (!el) return
      // A panel applies its own `autoFocus` during the commit, before this listener is removed, so
      // focus inside an overlay counts only when the *nearest* overlay around it is the one already
      // open. Containment is not enough: a confirm dialog is a DOM descendant of the sheet that
      // raised it, and its own Cancel button would otherwise be recorded as the opener.
      const within = el.closest('[role=dialog], [role=alertdialog]')
      if (within && within !== stack[stack.length - 1]?.panel) return
      opener.current = el
    }
    remember()
    document.addEventListener('focusin', remember)
    return () => document.removeEventListener('focusin', remember)
  }, [open])
  useEffect(() => {
    if (!open) return
    const panel = ref.current
    // A panel that only exists while it is open never ran the listener above, so read the opener
    // here instead. Focus already inside an overlay is never the opener of this one, unless it sits
    // in the overlay this one was opened from, which is how a nested confirm gets its opener back.
    const active = document.activeElement as HTMLElement | null
    const around = active?.closest('[role=dialog], [role=alertdialog]') ?? null
    if (!opener.current && active && (!around || around === stack[stack.length - 1]?.panel)) opener.current = active
    const entry = { panel }
    const items = () => Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    if (panel && !panel.contains(document.activeElement)) (items()[0] ?? panel).focus()
    const onKey = (e: KeyboardEvent) => {
      // Only the innermost overlay answers the keyboard. Without this every open overlay handles the
      // same Escape, so one press closes a confirm and the sheet that raised it.
      if (stack[stack.length - 1] !== entry) return
      if (e.key === 'Escape') { e.stopPropagation(); return close.current() }
      if (e.key !== 'Tab' || !panel) return
      const list = items()
      const here = document.activeElement as HTMLElement | null
      if (list.length === 0) { e.preventDefault(); return panel.focus() }
      if (!panel.contains(here)) { e.preventDefault(); return list[0].focus() }
      if (e.shiftKey && here === list[0]) { e.preventDefault(); list[list.length - 1].focus() }
      else if (!e.shiftKey && here === list[list.length - 1]) { e.preventDefault(); list[0].focus() }
    }
    document.addEventListener('keydown', onKey)
    // The shell scrolls in its own container, so stopping `body` alone leaves the page moving behind
    // the overlay. The outermost overlay stops `body` and every scrolling ancestor of the panel.
    if (stack.length === 0) locked = scrollers(panel).map((el) => {
      const overflow = el.style.overflow
      el.style.overflow = 'hidden'
      return { el, overflow }
    })
    stack.push(entry)
    return () => {
      document.removeEventListener('keydown', onKey)
      const at = stack.indexOf(entry)
      if (at >= 0) stack.splice(at, 1)
      if (stack.length === 0) {
        locked.forEach(({ el, overflow }) => { el.style.overflow = overflow })
        locked = []
      }
      // The opener can be re-created by the same commit that removes the panel, and focusing a node
      // that is being replaced does nothing, so try again on the next frame.
      let tries = 6
      const restore = () => {
        const back = opener.current
        if (!back || tries-- <= 0) return
        // An overlay is still open. Hand focus back only when the opener belongs to it, which is the
        // nested case. A panel that closed because another one opened leaves that one alone.
        const above = stack[stack.length - 1]
        if (above && !above.panel?.contains(back)) return
        if (back.isConnected) back.focus()
        if (document.activeElement !== back) requestAnimationFrame(restore)
      }
      restore()
    }
  }, [open])
  return ref
}
