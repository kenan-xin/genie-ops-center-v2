import { useEffect, useRef } from 'react'
// Aliased, because the modal hook below listens for the DOM `KeyboardEvent` of the same name.
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Group, Person, Role, RoleAssignment } from '@/../product/sections/people-groups-and-roles/types'

/** One focus ring for every interactive element (tokens: Focus ring). */
export const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-gray-950'

export const btnPrimary = `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-lg bg-blue-600 px-3.5 text-sm font-semibold text-white motion-safe:transition-colors hover:bg-blue-600/90 active:bg-blue-600/80 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600 ${focusRing}`
export const btnSecondary = `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800 motion-safe:transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-900 ${focusRing}`
export const btnDanger = `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-lg bg-red-600 px-3.5 text-sm font-semibold text-white motion-safe:transition-colors hover:bg-red-600/90 active:bg-red-600/80 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-600 ${focusRing}`
export const btnGhost = `inline-flex h-8 items-center whitespace-nowrap gap-1.5 rounded-lg px-2 text-sm font-medium text-gray-700 motion-safe:transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-900 ${focusRing}`
export const inputClass = `h-10 w-full rounded-lg border border-gray-500 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-500 focus:border-blue-500 dark:border-gray-500 dark:bg-gray-950 dark:text-gray-100 ${focusRing}`

/** Enter and Space open a clickable row (tokens: Tables). Ignores keys from the row's own buttons. */
export const rowKeyDown = (open: () => void) => (e: ReactKeyboardEvent) => {
  if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
  e.preventDefault()
  open()
}
export const labelClass = 'text-sm font-semibold text-gray-800 dark:text-gray-200'
export const linkClass = `rounded font-medium text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`

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

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
}

/* Self-protection and the last-administrator rule. The server enforces both; the UI explains first. */

export const isTenantAdminRole = (r: Role) => r.kind === 'system' && r.moduleId === 'core' && r.name === 'Tenant administrator'

export const SELF_GUARD = 'You cannot change your own access. Ask another administrator.'
export const LAST_ADMIN_GUARD = 'This would leave no active tenant administrator'

export type AccessState = { people: Person[]; roles: Role[]; roleAssignments: RoleAssignment[]; groups: Group[] }

/** Every write R-38 lists, including archiving a directory group, which stops that group granting. */
export type AccessAction =
  | { type: 'disablePerson' | 'removePerson'; personId: string }
  | { type: 'removeAssignment'; assignmentId: string }
  | { type: 'deleteGroup' | 'removeAllMembers' | 'archiveGroup'; groupId: string }
  | { type: 'removeMember'; groupId: string; personId: string }

/**
 * The people who can administer the tenant right now (Spec 2 R-38). It counts people, never
 * assignment rows. Only an `active` person counts: a pending person has not signed in yet (R-56) and
 * a disabled person cannot sign in, so neither can administer the tenant today. A path through an
 * archived group does not count, because an archived group keeps its assignments and grants nothing.
 * Two paths to the same person are still one person.
 */
export function activeTenantAdmins(s: AccessState): string[] {
  const admin = s.roles.find(isTenantAdminRole)
  if (!admin) return []
  const archived = new Set(s.groups.filter((g) => g.archived).map((g) => g.id))
  return s.people
    .filter((x) => x.status === 'active')
    .filter((x) => s.roleAssignments.some((a) => a.roleId === admin.id && (
      (a.principalType === 'user' && a.principalId === x.id) ||
      (a.principalType === 'group' && !archived.has(a.principalId) && x.groupIds.includes(a.principalId))
    )))
    .map((x) => x.id)
}

/** The state the action would leave, so the same count runs before it and after it. */
function afterAction(s: AccessState, action: AccessAction): AccessState {
  const strip = (x: Person, groupId: string) => ({ ...x, groupIds: x.groupIds.filter((g) => g !== groupId) })
  switch (action.type) {
    case 'disablePerson':
      return { ...s, people: s.people.map((x) => (x.id === action.personId ? { ...x, status: 'disabled' as const } : x)) }
    case 'removePerson':
      return { ...s, people: s.people.filter((x) => x.id !== action.personId) }
    case 'removeAssignment':
      return { ...s, roleAssignments: s.roleAssignments.filter((a) => a.id !== action.assignmentId) }
    case 'archiveGroup':
      return { ...s, groups: s.groups.map((g) => (g.id === action.groupId ? { ...g, archived: true } : g)) }
    case 'deleteGroup':
      return {
        ...s,
        groups: s.groups.filter((g) => g.id !== action.groupId),
        roleAssignments: s.roleAssignments.filter((a) => !(a.principalType === 'group' && a.principalId === action.groupId)),
        people: s.people.map((x) => strip(x, action.groupId)),
      }
    case 'removeAllMembers':
      return { ...s, people: s.people.map((x) => strip(x, action.groupId)) }
    case 'removeMember':
      return { ...s, people: s.people.map((x) => (x.id === action.personId ? strip(x, action.groupId) : x)) }
  }
}

/** True when the action leaves zero active holders of Tenant administrator (direct or via group). */
export function wouldRemoveLastTenantAdmin(s: AccessState, action: AccessAction): boolean {
  return activeTenantAdmins(s).length > 0 && activeTenantAdmins(afterAction(s, action)).length === 0
}

/** Why an action is blocked, or null. Self-protection first, then the last-administrator rule. */
export function guardReason(s: AccessState, currentUserId: string | undefined, action: AccessAction): string | null {
  const target = action.type === 'removeAssignment' ? s.roleAssignments.find((a) => a.id === action.assignmentId) : null
  const self = action.type === 'disablePerson' || action.type === 'removePerson' ? action.personId === currentUserId : target?.principalType === 'user' && target.principalId === currentUserId
  if (self) return SELF_GUARD
  return wouldRemoveLastTenantAdmin(s, action) ? LAST_ADMIN_GUARD : null
}

export type Guard = (action: AccessAction) => string | null

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
