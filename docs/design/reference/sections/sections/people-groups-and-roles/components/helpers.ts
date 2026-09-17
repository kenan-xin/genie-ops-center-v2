import type { KeyboardEvent } from 'react'
import type { Person, Role, RoleAssignment } from '@/../product/sections/people-groups-and-roles/types'

/** One focus ring for every interactive element (tokens: Focus ring). */
export const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-gray-950'

export const btnPrimary = `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-xl bg-blue-600 px-3.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 motion-safe:transition-colors hover:bg-blue-600/90 active:bg-blue-600/80 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600 ${focusRing}`
export const btnSecondary = `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-xl border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800 motion-safe:transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-900 ${focusRing}`
export const btnDanger = `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-xl bg-red-600 px-3.5 text-sm font-semibold text-white motion-safe:transition-colors hover:bg-red-600/90 active:bg-red-600/80 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-600 ${focusRing}`
export const btnGhost = `inline-flex h-8 items-center whitespace-nowrap gap-1.5 rounded-xl px-2 text-sm font-medium text-gray-700 motion-safe:transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-900 ${focusRing}`
export const inputClass = `h-10 w-full rounded-xl border border-gray-500 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-500 focus:border-blue-500 dark:border-gray-500 dark:bg-gray-950 dark:text-gray-100 ${focusRing}`

/** Enter and Space open a clickable row (tokens: Tables). Ignores keys from the row's own buttons. */
export const rowKeyDown = (open: () => void) => (e: KeyboardEvent) => {
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
export const LAST_ADMIN_GUARD = 'This is the last tenant administrator'

export type AccessState = { people: Person[]; roles: Role[]; roleAssignments: RoleAssignment[] }

export type AccessAction =
  | { type: 'disablePerson' | 'removePerson'; personId: string }
  | { type: 'removeAssignment'; assignmentId: string }
  | { type: 'deleteGroup' | 'removeAllMembers'; groupId: string }
  | { type: 'removeMember'; groupId: string; personId: string }

const activeAdminHolders = (people: Person[], assignments: RoleAssignment[], adminRoleId: string) =>
  people.filter((x) => x.status !== 'disabled' && assignments.some((a) => a.roleId === adminRoleId && ((a.principalType === 'user' && a.principalId === x.id) || (a.principalType === 'group' && x.groupIds.includes(a.principalId))))).length

/** True when the action leaves zero active holders of Tenant administrator (direct or via group). */
export function wouldRemoveLastTenantAdmin(s: AccessState, action: AccessAction): boolean {
  const admin = s.roles.find(isTenantAdminRole)
  if (!admin) return false
  const strip = (x: Person, groupId: string) => ({ ...x, groupIds: x.groupIds.filter((g) => g !== groupId) })
  let people = s.people
  let assignments = s.roleAssignments
  switch (action.type) {
    case 'disablePerson':
    case 'removePerson':
      people = people.filter((x) => x.id !== action.personId)
      break
    case 'removeAssignment':
      assignments = assignments.filter((a) => a.id !== action.assignmentId)
      break
    case 'deleteGroup':
      assignments = assignments.filter((a) => !(a.principalType === 'group' && a.principalId === action.groupId))
      people = people.map((x) => strip(x, action.groupId))
      break
    case 'removeAllMembers':
      people = people.map((x) => strip(x, action.groupId))
      break
    case 'removeMember':
      people = people.map((x) => (x.id === action.personId ? strip(x, action.groupId) : x))
      break
  }
  return activeAdminHolders(s.people, s.roleAssignments, admin.id) > 0 && activeAdminHolders(people, assignments, admin.id) === 0
}

/** Why an action is blocked, or null. Self-protection first, then the last-administrator rule. */
export function guardReason(s: AccessState, currentUserId: string | undefined, action: AccessAction): string | null {
  const target = action.type === 'removeAssignment' ? s.roleAssignments.find((a) => a.id === action.assignmentId) : null
  const self = action.type === 'disablePerson' || action.type === 'removePerson' ? action.personId === currentUserId : target?.principalType === 'user' && target.principalId === currentUserId
  if (self) return SELF_GUARD
  return wouldRemoveLastTenantAdmin(s, action) ? LAST_ADMIN_GUARD : null
}

export type Guard = (action: AccessAction) => string | null
