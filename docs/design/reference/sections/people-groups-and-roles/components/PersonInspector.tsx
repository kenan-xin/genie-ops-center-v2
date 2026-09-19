import { useState } from 'react'
import { Building2, KeyRound, Mail, Plus, UsersRound, X } from 'lucide-react'
import type { Group, ModuleInfo, Person, PersonSession, Role, RoleAssignment, ScopeRecord } from '@/../product/sections/people-groups-and-roles/types'
import { btnGhost, btnSecondary, fmtDateTime, focusRing, relativeTime, type Guard } from './helpers'
import { Avatar, CloseButton, ConfirmDialog, HelpNote, Pill, SlideOver, StatusPill, Tabs } from './ui'

export type PersonTab = 'profile' | 'groups' | 'roles' | 'sessions'
type Confirm = 'remove' | 'disable' | 'signOutAll'

export interface PersonInspectorProps {
  person: Person | null
  onClose: () => void
  groups: Group[]
  roles: Role[]
  roleAssignments: RoleAssignment[]
  sessions: PersonSession[]
  modules: ModuleInfo[]
  scopeRecords: ScopeRecord[]
  people: Person[]
  onDisablePerson?: (personId: string) => void
  onEnablePerson?: (personId: string) => void
  onRemovePerson?: (personId: string) => void
  onRevokeSession?: (sessionId: string) => void
  onRevokeAllSessions?: (personId: string) => void
  onAddToLocalGroup?: (personId: string, groupId: string) => void
  onRemoveFromLocalGroup?: (personId: string, groupId: string) => void
  /** Opens core Access with this person preselected. This screen never writes an assignment (`DEC-39`). */
  onManageAccess?: (personId: string) => void
  /** Why an action is blocked (self-protection or the last-administrator rule), or null. */
  guard?: Guard
  onResendSetPassword?: (personId: string) => void
  /** DEC-31: resend set-password is rate limited per deployment. When set, the button is disabled with the pause note. */
  resendRateLimited?: { retryAfterMinutes: number }
  onOpenGroup?: (groupId: string) => void
  /** Design OS preview: open on a tab or with a confirm dialog already open. */
  initialTab?: PersonTab
  initialDialog?: 'remove' | 'disable'
}

export function PersonInspector(p: PersonInspectorProps) {
  const { person, onClose } = p
  const [tab, setTab] = useState<PersonTab>(p.initialTab ?? 'profile')
  const [confirm, setConfirm] = useState<Confirm | null>(p.initialDialog ?? null)
  const [pickGroup, setPickGroup] = useState(false)
  const [resent, setResent] = useState<string | null>(null)

  if (!person) return null
  const guard: Guard = p.guard ?? (() => null)
  const disableGuard = guard({ type: 'disablePerson', personId: person.id })
  const removeGuard = guard({ type: 'removePerson', personId: person.id })
  const local = person.accountType === 'local'
  const sentAt = resent ?? person.setPasswordSentAt ?? null
  const myGroups = p.groups.filter((g) => person.groupIds.includes(g.id))
  const idpGroups = myGroups.filter((g) => g.source === 'idp')
  const localGroups = myGroups.filter((g) => g.source === 'local')
  const joinable = p.groups.filter((g) => g.source === 'local' && !g.archived && !person.groupIds.includes(g.id))
  const sessions = p.sessions.filter((s) => s.personId === person.id)

  // Effective assignments: direct ones plus those carried by the person's groups.
  const effective = p.roleAssignments
    .filter((a) => (a.principalType === 'user' && a.principalId === person.id) || (a.principalType === 'group' && person.groupIds.includes(a.principalId)))
    .map((a) => ({
      a,
      role: p.roles.find((r) => r.id === a.roleId),
      via: a.principalType === 'group' ? p.groups.find((g) => g.id === a.principalId) : null,
      scope: a.scopeId ? p.scopeRecords.find((s) => s.id === a.scopeId) : null,
    }))

  const tabs = [
    { id: 'profile' as PersonTab, label: 'Profile' },
    { id: 'groups' as PersonTab, label: 'Groups', count: myGroups.length },
    { id: 'roles' as PersonTab, label: 'Roles', count: effective.length },
    { id: 'sessions' as PersonTab, label: 'Sessions', count: sessions.length },
  ]

  const dl = (rows: Array<[string, React.ReactNode]>) => (
    <dl className="grid grid-cols-[140px_1fr] gap-y-3 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-gray-600 dark:text-gray-400">{k}</dt>
          <dd className="min-w-0 text-gray-900 dark:text-gray-100">{v}</dd>
        </div>
      ))}
    </dl>
  )
  const iconBtn = `${btnGhost} size-11 justify-center px-0 text-gray-500 sm:size-8`

  return (
    <SlideOver open onClose={onClose} title={person.name}>
      <header className="flex items-start gap-3 px-5 pb-4 pt-5">
        <Avatar name={person.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-bold tracking-tight">{person.name}</h2>
            <StatusPill status={person.status} />
          </div>
          <p className="mt-0.5 truncate text-sm text-gray-600 dark:text-gray-400">{person.email}</p>
        </div>
        <CloseButton onClick={onClose} />
      </header>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {tab === 'profile' ? (
          <div className="flex flex-col gap-6">
            {dl([
              ['Email', <span className="break-all">{person.email}</span>],
              ['Account', local ? 'Local password in the tenant realm' : 'Brokered through the identity provider'],
              ['Identity source', person.identitySource],
              ['Onboarding', person.onboarding === 'invited' ? 'Added by an administrator' : 'Created at first sign-in'],
              ['First sign-in', person.firstSignInAt ? fmtDateTime(person.firstSignInAt) : <span className="text-gray-500">Not yet</span>],
              ['Last sign-in', person.lastSignInAt ? relativeTime(person.lastSignInAt) : <span className="text-gray-500">Never</span>],
            ])}
            {person.status === 'pending' && local ? (
              <section className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/50 dark:bg-blue-950/25">
                <h3 className="text-sm font-semibold text-blue-950 dark:text-blue-100">Set-password email</h3>
                <p className="mt-0.5 text-xs text-blue-900/80 dark:text-blue-200/80">The realm sends the email; first sign-in activates the account. There is no manual activation.</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button type="button" className={btnSecondary} disabled={!!p.resendRateLimited} onClick={() => { p.onResendSetPassword?.(person.id); setResent(new Date().toISOString()) }}><Mail className="size-5 text-gray-500" strokeWidth={1.75} aria-hidden />Resend set-password email</button>
                  <span role="status" className="text-xs text-blue-900/80 dark:text-blue-200/80">{p.resendRateLimited ? `Resend is paused. Try again in ${p.resendRateLimited.retryAfterMinutes} minutes.` : sentAt ? `Last sent ${relativeTime(sentAt)}` : 'Not sent yet'}</span>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        {tab === 'groups' ? (
          <div className="flex flex-col gap-6">
            <section>
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold">Directory groups</h3>
                <span className="text-xs text-gray-500">Synced {relativeTime(idpGroups[0]?.syncedAt ?? null)}</span>
              </div>
              <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">Membership is managed in the identity provider and refreshed at every sign-in.</p>
              <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
                {idpGroups.map((g) => (
                  <li key={g.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <Building2 className="size-4 text-gray-500" strokeWidth={1.75} aria-hidden />
                    <button type="button" onClick={() => p.onOpenGroup?.(g.id)} className={`flex-1 rounded text-left font-medium hover:underline ${focusRing}`}>{g.name}</button>
                    {g.stale ? <Pill tone="amber" title={`Last seen ${relativeTime(g.lastSeenAt)}`}>Stale</Pill> : null}
                  </li>
                ))}
                {idpGroups.length === 0 ? <li className="py-5 text-center text-sm text-gray-600 dark:text-gray-400">No directory groups arrived in the last token.</li> : null}
              </ul>
            </section>
            <section>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Local groups</h3>
                {joinable.length > 0 ? (
                  <button type="button" className={btnGhost} onClick={() => setPickGroup((v) => !v)}><Plus className="size-5" strokeWidth={2} aria-hidden />Add to group</button>
                ) : null}
              </div>
              {pickGroup ? (
                <ul className="mt-2 rounded-lg border border-blue-200 bg-blue-50/40 p-1 dark:border-blue-900/50 dark:bg-blue-950/20">
                  {joinable.map((g) => (
                    <li key={g.id}>
                      <button type="button" onClick={() => { p.onAddToLocalGroup?.(person.id, g.id); setPickGroup(false) }} className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-white dark:hover:bg-gray-800 ${focusRing}`}>
                        <UsersRound className="size-4 text-gray-500" strokeWidth={1.75} aria-hidden />
                        <span className="flex-1 font-medium">{g.name}</span>
                        <span className="text-xs text-gray-500">{g.memberCount} members</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
                {localGroups.map((g) => {
                  const why = guard({ type: 'removeMember', groupId: g.id, personId: person.id })
                  return (
                    <li key={g.id} className="flex items-center gap-3 py-2 text-sm">
                      <UsersRound className="size-4 text-gray-500" strokeWidth={1.75} aria-hidden />
                      <button type="button" onClick={() => p.onOpenGroup?.(g.id)} className={`flex-1 rounded text-left font-medium hover:underline ${focusRing}`}>{g.name}</button>
                      <button type="button" aria-label={`Remove from ${g.name}`} disabled={Boolean(why)} title={why ?? undefined} className={iconBtn} onClick={() => p.onRemoveFromLocalGroup?.(person.id, g.id)}><X className="size-5" strokeWidth={1.75} /></button>
                    </li>
                  )
                })}
                {localGroups.length === 0 ? <li className="py-5 text-center text-sm text-gray-600 dark:text-gray-400">Not in any local group.</li> : null}
              </ul>
            </section>
          </div>
        ) : null}

        {tab === 'roles' ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 flex-wrap items-center gap-1">
                <p className="text-xs text-gray-600 dark:text-gray-400">Everything this person can do, and where each grant comes from. Read-only here.</p>
                <HelpNote label="How this adds up">
                  <p>This person receives access through the roles assigned to them directly and through the roles their groups carry. The two combine within the scope each grant holds.</p>
                  <p>Removing one path leaves the other. A group role changes for every member of that group, and a disabled account still blocks access.</p>
                </HelpNote>
              </span>
              <button type="button" className={`${btnSecondary} shrink-0`} onClick={() => p.onManageAccess?.(person.id)}><KeyRound className="size-5 text-gray-500" strokeWidth={1.75} aria-hidden />Manage in Access</button>
            </div>
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {effective.map(({ a, role, via, scope }) => {
                return (
                  <li key={a.id} className="flex items-start gap-3 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{role?.name}</span>
                        <Pill tone={a.scopeId ? 'blue' : 'gray'}>{scope ? scope.label : 'Whole tenant'}</Pill>
                      </div>
                      <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                        {via ? <>via <span className="font-medium text-gray-800 dark:text-gray-200">{via.name}</span>{via.stale ? ' (stale group)' : ''}</> : 'Direct'}
                        {role?.entitlementAdded?.length ? <> as <span className="font-medium text-gray-800 dark:text-gray-200">Tenant administrator (system)</span>, which includes every entitled module's admin permission</> : null} · added by {a.createdBy}
                      </div>
                    </div>
                  </li>
                )
              })}
              {effective.length === 0 ? <li className="py-6 text-center text-sm text-gray-600 dark:text-gray-400">No roles yet. This person can sign in but sees nothing.</li> : null}
            </ul>
            <p className="text-xs text-gray-500">Access is granted and taken back in one place, the Access screen. A role held through a group changes for every member of that group.</p>
          </div>
        ) : null}

        {tab === 'sessions' ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-gray-600 dark:text-gray-400">{sessions.length === 0 ? 'No active sessions.' : `${sessions.length} active ${sessions.length === 1 ? 'session' : 'sessions'}.`}</p>
              {sessions.length > 0 ? <button type="button" className={`${btnSecondary} shrink-0`} onClick={() => setConfirm('signOutAll')}>Sign out all</button> : null}
            </div>
            {sessions.length > 0 ? (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {sessions.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-3 text-sm">
                    <div className="min-w-0 flex-1"><div className="font-medium">{s.device}</div><div className="text-xs text-gray-600 dark:text-gray-400">{s.browser} · <code className="font-mono">{s.ipAddress}</code> · active {relativeTime(s.lastActiveAt)}</div></div>
                    <button type="button" className={`${btnSecondary} h-11 sm:h-10`} onClick={() => p.onRevokeSession?.(s.id)}>Sign out</button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <footer className="border-t border-gray-200 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-gray-800">
        <p className="text-xs text-gray-600 dark:text-gray-400">{(removeGuard ?? disableGuard) ? `${removeGuard ?? disableGuard}.` : person.status === 'disabled' ? 'Re-enabling restores sign-in with the same groups and roles. Removing drops their groups and direct roles and keeps their name and audit trail.' : 'Disabling keeps history and assignments. Removing drops their groups and direct roles and keeps their name and audit trail.'}</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {person.status === 'disabled' ? (
            <button type="button" className={btnSecondary} onClick={() => p.onEnablePerson?.(person.id)}>Re-enable</button>
          ) : (
            <button type="button" className={btnSecondary} disabled={Boolean(disableGuard)} title={disableGuard ?? undefined} onClick={() => setConfirm('disable')}>Disable</button>
          )}
          <button type="button" className={`${btnSecondary} text-red-700 dark:text-red-300`} disabled={Boolean(removeGuard)} title={removeGuard ?? undefined} onClick={() => setConfirm('remove')}>Remove</button>
        </div>
      </footer>

      <ConfirmDialog open={confirm === 'remove'} onClose={() => setConfirm(null)} title={`Remove ${person.name}?`} description="Every session ends, and their groups and direct roles are removed. Their name, email, and audit trail are kept, and their identity-provider account is untouched." confirmLabel="Remove" danger onConfirm={() => p.onRemovePerson?.(person.id)} />
      <ConfirmDialog open={confirm === 'disable'} onClose={() => setConfirm(null)} title={`Disable ${person.name}?`} description="They cannot sign in and every session ends. History and assignments are kept; you can re-enable them later." confirmLabel="Disable" danger onConfirm={() => p.onDisablePerson?.(person.id)} />
      <ConfirmDialog open={confirm === 'signOutAll'} onClose={() => setConfirm(null)} title={`Sign out ${person.name} everywhere?`} description={`${sessions.length} ${sessions.length === 1 ? 'session ends' : 'sessions end'} now. They can sign in again straight away.`} confirmLabel="Sign out all" danger onConfirm={() => p.onRevokeAllSessions?.(person.id)} />
    </SlideOver>
  )
}
