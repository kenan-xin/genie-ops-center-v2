import { useEffect, useRef, useState } from 'react'
import type { AccessModule, AccessProps, Grant, PendingChange, Recipient } from '@/../product/sections/access/types'

/** The one focus ring (tokens.md): solid blue-500 (blue-400 in dark) with a 2px offset, on every interactive element. */
export const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-gray-950'
export const btnPrimary =
  `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-lg bg-blue-600 px-3.5 text-sm font-semibold text-white motion-safe:transition-colors hover:bg-blue-600/90 active:bg-blue-600/80 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-600 ${focusRing}`
export const btnSecondary =
  `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800 motion-safe:transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-900 dark:disabled:hover:bg-gray-950 ${focusRing}`
export const btnDanger =
  `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-lg bg-red-600 px-3.5 text-sm font-semibold text-white motion-safe:transition-colors hover:bg-red-600/90 active:bg-red-600/80 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-red-600 ${focusRing}`
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

/* The last-active-administrator rule and self-protection (Spec 2 R-38). The server holds both; the
   screen mirrors them so it can explain a refusal before the save and repeat it after one. */

export const SELF_GUARD = 'You cannot change your own access. Ask another administrator.'
export const LAST_ADMIN_GUARD = 'This would leave no active tenant administrator'

/**
 * The one system role that carries tenant administration. A grant reaches it two ways: through the
 * core administration level, and through "Assign a role directly", which records the same role at
 * `level: custom`. The rule therefore reads the role, never the route the screen took.
 */
export const isTenantAdminRole = (r: { name: string; kind: 'system' | 'custom'; moduleId: string | null }) =>
  r.kind === 'system' && r.moduleId === 'core' && r.name === 'Tenant administrator'

/** Every role id that carries tenant administration, read from the core level and from the role list. */
export function tenantAdminRoleIds(modules: AccessModule[], customRoles: AccessProps['customRoles']): Set<string> {
  const ids = new Set<string>()
  modules.filter((m) => m.isCore).forEach((m) => m.levels.forEach((l) => { if (l.id === 'admin' && l.roleId) ids.add(l.roleId) }))
  customRoles.filter(isTenantAdminRole).forEach((r) => ids.add(r.id))
  return ids
}

/**
 * The people who can administer the tenant right now. It counts people, never grant rows, and it
 * counts by role, so a role picked directly counts like one picked through the level. Only an
 * `active` person counts: a pending person has not signed in yet and a disabled person cannot sign
 * in, so neither can administer the tenant today. A path through an archived group does not count,
 * because an archived group keeps its assignments and grants nothing. Two paths to the same person
 * are still one person.
 */
export function activeTenantAdmins(recipients: Recipient[], grants: Grant[], adminRoleIds: Set<string>): string[] {
  const holders = new Set(grants.filter((g) => adminRoleIds.has(g.roleId)).map((g) => `${g.recipientType}:${g.recipientId}`))
  const archived = new Set(recipients.filter((r) => r.type === 'group' && r.archived).map((r) => r.id))
  return recipients
    .filter((r) => r.type === 'user' && r.status === 'active')
    .filter((r) => holders.has(`user:${r.id}`) || (r.groupIds ?? []).some((g) => !archived.has(g) && holders.has(`group:${g}`)))
    .map((r) => r.id)
}

/** Why a batch is refused, or null. `after` is the grant list the save would leave behind. */
export function refusalFor(recipients: Recipient[], before: Grant[], after: Grant[], changes: PendingChange[], adminRoleIds: Set<string>, currentUserId?: string): string | null {
  // What a revoke takes away is read from the grant row it names, not from the level the screen
  // happened to show, so a directly picked Tenant administrator is guarded like any other.
  const removesAdmin = (c: PendingChange) => {
    if (c.kind !== 'revoke') return false
    const row = c.grantId ? before.find((g) => g.id === c.grantId) : undefined
    if (row) return adminRoleIds.has(row.roleId)
    return adminRoleIds.has(c.roleId ?? '') || (c.moduleId === 'core' && c.level === 'admin')
  }
  if (changes.some((c) => c.recipientId === currentUserId && removesAdmin(c))) return SELF_GUARD
  if (activeTenantAdmins(recipients, before, adminRoleIds).length === 0) return null
  return activeTenantAdmins(recipients, after, adminRoleIds).length === 0 ? `${LAST_ADMIN_GUARD}. Give Tenant administrator to somebody else first.` : null
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
