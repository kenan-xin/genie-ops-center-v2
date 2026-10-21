import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { Group, ModuleInfo, NewPersonInput, Person, PersonSession, PersonStatus, Role, RoleAssignment, ScopeRecord, TenantSettingsSummary } from '@/../product/sections/people-groups-and-roles/types'
import { btnPrimary, focusRing, guardReason, relativeTime, rowKeyDown, type Guard } from './helpers'
import { Avatar, Card, ConfirmDialog, EmptyRow, FilterChip, FilterMenu, HelpNote, PhoneBar, Pill, RowMenu, SearchField, Select, StatusPill, Th, Td } from './ui'

/** Field label inside the filter panel. Caption size: the panel is already titled. */
const filterLabel = 'text-xs font-semibold text-gray-700 dark:text-gray-300'
import { PersonInspector, type PersonTab } from './PersonInspector'
import { AddPersonDialog } from './AddPersonDialog'
import { GroupInspector } from './GroupInspector'

export interface PeopleDirectoryProps {
  tenantSettings: TenantSettingsSummary
  people: Person[]
  groups: Group[]
  roles: Role[]
  roleAssignments: RoleAssignment[]
  sessions: PersonSession[]
  modules: ModuleInfo[]
  scopeRecords: ScopeRecord[]
  /** Person to open in the inspector on first render (Design OS preview). */
  initialPersonId?: string | null
  /** Design OS preview: inspector tab, and a confirm dialog opened on first render. */
  initialTab?: PersonTab
  initialDialog?: 'remove' | 'disable'
  initialGroupId?: string | null
  initialGroupDialog?: 'archive' | 'delete' | 'clear'
  /** The signed-in administrator. Their own row cannot be disabled, removed, or stripped of roles. */
  currentUserId?: string
  onAddPerson?: (input: NewPersonInput) => void
  onResendSetPassword?: (personId: string) => void
  /** DEC-31 rate-limit refusals, passed through to AddPersonDialog and PersonInspector. */
  addPersonRateLimited?: { retryAfterMinutes: number }
  resendRateLimited?: { retryAfterMinutes: number }
  onUpdateLocalGroup?: (groupId: string, name: string, description: string) => void
  onArchiveGroup?: (groupId: string) => void
  onDeleteLocalGroup?: (groupId: string) => void
  onRemoveAllMembers?: (groupId: string) => void
  onOpenRole?: (roleId: string) => void
  onDisablePerson?: (personId: string) => void
  onEnablePerson?: (personId: string) => void
  onRemovePerson?: (personId: string) => void
  onRevokeSession?: (sessionId: string) => void
  onRevokeAllSessions?: (personId: string) => void
  onAddToLocalGroup?: (personId: string, groupId: string) => void
  onRemoveFromLocalGroup?: (personId: string, groupId: string) => void
  /** Opens core Access with this person preselected. This screen never writes an assignment (`DEC-39`). */
  onManageAccess?: (personId: string) => void
}

const statusOrder: Record<PersonStatus, number> = { active: 0, pending: 1, disabled: 2 }

export function PeopleDirectory(p: PeopleDirectoryProps) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | PersonStatus>('all')
  const [groupId, setGroupId] = useState('all')
  const [sort, setSort] = useState<'name' | 'status' | 'lastSignIn'>('name')
  const [openId, setOpenId] = useState<string | null>(p.initialPersonId ?? null)
  const [openGroupId, setOpenGroupId] = useState<string | null>(p.initialGroupId ?? null)
  const [adding, setAdding] = useState(false)
  const [confirm, setConfirm] = useState<{ kind: 'disable' | 'remove'; person: Person } | null>(null)

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return p.people
      .filter((x) => (!s || x.name.toLowerCase().includes(s) || x.email.toLowerCase().includes(s)) && (status === 'all' || x.status === status) && (groupId === 'all' || x.groupIds.includes(groupId)))
      .sort((a, b) => (sort === 'status' ? statusOrder[a.status] - statusOrder[b.status] || a.name.localeCompare(b.name) : sort === 'lastSignIn' ? (b.lastSignInAt ?? '').localeCompare(a.lastSignInAt ?? '') : a.name.localeCompare(b.name)))
  }, [p.people, q, status, groupId, sort])

  // Self-protection and the last-administrator rule. The server refuses too; the UI explains why first.
  const guard: Guard = (action) => guardReason({ people: p.people, roles: p.roles, roleAssignments: p.roleAssignments, groups: p.groups }, p.currentUserId, action)
  const menuFor = (person: Person) => {
    const disableWhy = guard({ type: 'disablePerson', personId: person.id })
    const removeWhy = guard({ type: 'removePerson', personId: person.id })
    return [
      person.status === 'disabled'
        ? { label: 'Re-enable', onSelect: () => p.onEnablePerson?.(person.id) }
        : { label: 'Disable', onSelect: () => setConfirm({ kind: 'disable', person }), disabled: Boolean(disableWhy), title: disableWhy ?? undefined },
      { label: 'Remove', danger: true, onSelect: () => setConfirm({ kind: 'remove', person }), disabled: Boolean(removeWhy), title: removeWhy ?? undefined },
    ]
  }

  const roleCount = (person: Person) =>
    p.roleAssignments.filter((a) => (a.principalType === 'user' && a.principalId === person.id) || (a.principalType === 'group' && person.groupIds.includes(a.principalId))).length

  const addPerson = <button type="button" className={btnPrimary} onClick={() => setAdding(true)}><Plus className="size-5" strokeWidth={2} aria-hidden />Add person</button>
  const counts = { active: p.people.filter((x) => x.status === 'active').length, pending: p.people.filter((x) => x.status === 'pending').length, disabled: p.people.filter((x) => x.status === 'disabled').length }
  const open = p.people.find((x) => x.id === openId) ?? null

  // Status and Group sit behind one Filters button so search keeps its standing width. Sort stays in
  // the toolbar, because it orders the list and never removes a row.
  const filterCount = (status !== 'all' ? 1 : 0) + (groupId !== 'all' ? 1 : 0)
  const resetFilters = () => { setStatus('all'); setGroupId('all') }
  const clearAll = () => { setQ(''); resetFilters() }
  const chips: Array<{ label: string; clear: () => void }> = []
  if (q.trim()) chips.push({ label: `“${q.trim()}”`, clear: () => setQ('') })
  if (status !== 'all') chips.push({ label: `${status[0].toUpperCase()}${status.slice(1)}`, clear: () => setStatus('all') })
  if (groupId !== 'all') chips.push({ label: p.groups.find((g) => g.id === groupId)?.name ?? 'Group', clear: () => setGroupId('all') })
  const noMatch = (
    <>No people match.{chips.length ? <> <button type="button" onClick={clearAll} className={`rounded font-semibold text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`}>Clear filters</button></> : <> Add a person to start.</>}</>
  )

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {/* Search and its help travel together: a 4px gap binds the icon to the field it explains. */}
          <div className="flex min-w-0 flex-1 items-center gap-1 sm:max-w-md">
            <SearchField value={q} onChange={setQ} placeholder="Search by name or email" />
            <HelpNote label="Pending, disabled, removed" iconOnly>
              <p>Somebody you add stays Pending until their first sign-in. Nothing activates them by hand, and they can hold roles while they wait.</p>
              <p>Disabling stops sign-in and keeps everything else. Removing ends every session, drops their groups and their direct roles, and keeps their name and their audit trail.</p>
              <p className="text-gray-600 dark:text-gray-400">Replacing a name with an anonymous one is an operator command, never an action on this screen.</p>
            </HelpNote>
          </div>
          {/* One pair on phones, so neither control claims a row of its own. */}
          <div className="flex items-center gap-2">
            <Select ariaLabel="Sort" value={sort} onChange={(v) => setSort(v as typeof sort)}>
              <option value="name">Name</option><option value="status">Status</option><option value="lastSignIn">Last sign-in</option>
            </Select>
            <FilterMenu count={filterCount} onClear={filterCount ? resetFilters : undefined}>
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5"><span className={filterLabel}>Status</span>
                  <Select full ariaLabel="Status" value={status} onChange={(v) => setStatus(v as typeof status)}>
                    <option value="all">All statuses ({p.people.length})</option>
                    <option value="active">Active ({counts.active})</option>
                    <option value="pending">Pending ({counts.pending})</option>
                    <option value="disabled">Disabled ({counts.disabled})</option>
                  </Select>
                </label>
                <label className="flex flex-col gap-1.5"><span className={filterLabel}>Group</span>
                  <Select full ariaLabel="Group" value={groupId} onChange={setGroupId}>
                    <option value="all">All groups</option>
                    {p.groups.filter((g) => !g.archived).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </Select>
                </label>
              </div>
            </FilterMenu>
          </div>
          <div className="hidden sm:ml-auto md:block">{addPerson}</div>
        </div>

        {chips.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((c) => <FilterChip key={c.label} label={c.label} onClear={c.clear} />)}
            <button type="button" onClick={clearAll} className={`h-8 rounded-lg px-1.5 text-xs font-medium text-gray-600 underline-offset-2 hover:underline dark:text-gray-400 ${focusRing}`}>Clear all</button>
          </div>
        ) : null}
      </div>

      <Card className="overflow-hidden">
        {/* Phone: card list */}
        <ul className="divide-y divide-gray-100 md:hidden dark:divide-gray-800">
          {rows.map((person) => (
            <li key={person.id} className={`flex items-center gap-3 px-4 py-3 ${openId === person.id ? 'bg-blue-50/60 dark:bg-blue-950/30' : ''}`}>
              <button type="button" onClick={() => setOpenId(person.id)} className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left ${focusRing}`}>
                <Avatar name={person.name} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5"><span className="truncate font-semibold">{person.name}</span><StatusPill status={person.status} /></span>
                  <span className="block truncate text-xs text-gray-600 dark:text-gray-400">{person.email}</span>
                  <span className="block text-xs text-gray-600 dark:text-gray-400">{roleCount(person)} roles · last sign-in {relativeTime(person.lastSignInAt)}</span>
                </span>
              </button>
              <RowMenu items={menuFor(person)} />
            </li>
          ))}
          {rows.length === 0 ? <li className="px-5 py-12 text-center text-sm text-gray-600 dark:text-gray-400">{noMatch}</li> : null}
        </ul>
        <div className="hidden md:block">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-950/50">
              <tr><Th>Person</Th><Th>Status</Th><Th>Groups</Th><Th className="text-right">Roles</Th><Th>Last sign-in</Th><Th /></tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((person) => {
                const gs = p.groups.filter((g) => person.groupIds.includes(g.id))
                return (
                  <tr
                    key={person.id}
                    tabIndex={0}
                    role="button"
                    onClick={() => setOpenId(person.id)}
                    onKeyDown={rowKeyDown(() => setOpenId(person.id))}
                    className={`cursor-pointer motion-safe:transition-colors hover:bg-gray-50 focus-visible:bg-blue-50/60 dark:hover:bg-gray-800/60 ${focusRing} ${openId === person.id ? 'bg-blue-50/60 dark:bg-blue-950/30' : ''}`}
                  >
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={person.name} />
                        <div className="min-w-0"><div className="truncate font-semibold">{person.name}</div><div className="truncate text-xs text-gray-600 dark:text-gray-400">{person.email}</div></div>
                      </div>
                    </Td>
                    <Td><StatusPill status={person.status} /></Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1">
                        {gs.slice(0, 2).map((g) => <button key={g.id} type="button" onClick={(e) => { e.stopPropagation(); setOpenGroupId(g.id) }} className={`rounded-full hover:opacity-80 ${focusRing}`} title={`Open ${g.name}`}><Pill tone={g.source === 'local' ? 'blue' : 'gray'}>{g.name}</Pill></button>)}
                        {gs.length > 2 ? <span className="text-xs text-gray-600 dark:text-gray-400">+{gs.length - 2}</span> : null}
                        {gs.length === 0 ? <span className="text-xs text-gray-500">—</span> : null}
                      </div>
                    </Td>
                    <Td className="text-right tabular-nums text-gray-700 dark:text-gray-300">{roleCount(person)}</Td>
                    <Td className="whitespace-nowrap text-gray-700 dark:text-gray-300">{relativeTime(person.lastSignInAt)}</Td>
                    <Td className="text-right">
                      <RowMenu items={menuFor(person)} />
                    </Td>
                  </tr>
                )
              })}
              {rows.length === 0 ? <EmptyRow colSpan={6}>{noMatch}</EmptyRow> : null}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-1 border-t border-gray-100 px-5 py-2.5 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-400">
          <span>{rows.length} of {p.people.length} people</span>
          <span>Onboarding: {p.tenantSettings.onboardingMode === 'invite' ? 'Invite only' : 'Just in time'} · {p.tenantSettings.identitySource}</span>
        </div>
      </Card>

      <PersonInspector
        person={open}
        onClose={() => setOpenId(null)}
        groups={p.groups}
        roles={p.roles}
        roleAssignments={p.roleAssignments}
        sessions={p.sessions}
        modules={p.modules}
        scopeRecords={p.scopeRecords}
        people={p.people}
        onDisablePerson={p.onDisablePerson}
        onEnablePerson={p.onEnablePerson}
        onRemovePerson={(id) => { p.onRemovePerson?.(id); setOpenId(null) }}
        guard={guard}
        initialTab={p.initialTab}
        initialDialog={p.initialDialog}
        onResendSetPassword={p.onResendSetPassword}
        resendRateLimited={p.resendRateLimited}
        onOpenGroup={(gid) => setOpenGroupId(gid)}
        onRevokeSession={p.onRevokeSession}
        onRevokeAllSessions={p.onRevokeAllSessions}
        onAddToLocalGroup={p.onAddToLocalGroup}
        onRemoveFromLocalGroup={p.onRemoveFromLocalGroup}
        onManageAccess={p.onManageAccess}
      />
      <AddPersonDialog open={adding} onClose={() => setAdding(false)} roles={p.roles} settings={p.tenantSettings} onSubmit={p.onAddPerson} rateLimited={p.addPersonRateLimited} />
      {openGroupId ? (
        <GroupInspector group={p.groups.find((g) => g.id === openGroupId) ?? null} onClose={() => setOpenGroupId(null)} people={p.people} roles={p.roles} roleAssignments={p.roleAssignments} scopeRecords={p.scopeRecords} guard={guard} initialDialog={p.initialGroupDialog} onUpdateLocalGroup={p.onUpdateLocalGroup} onAddToLocalGroup={p.onAddToLocalGroup} onRemoveFromLocalGroup={p.onRemoveFromLocalGroup} onArchiveGroup={p.onArchiveGroup} onDeleteLocalGroup={p.onDeleteLocalGroup} onRemoveAllMembers={p.onRemoveAllMembers} onOpenRole={p.onOpenRole} onManageAccess={p.onManageAccess} />
      ) : null}
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'remove' ? `Remove ${confirm.person.name}?` : `Disable ${confirm?.person.name ?? ''}?`}
        description={confirm?.kind === 'remove' ? 'Every session ends, and their groups and direct roles are removed. Their name, email, and audit trail are kept, and their identity-provider account is untouched.' : 'They cannot sign in and every session ends. History and assignments are kept, and you can re-enable them later.'}
        confirmLabel={confirm?.kind === 'remove' ? 'Remove' : 'Disable'}
        danger
        onConfirm={() => { if (!confirm) return; if (confirm.kind === 'remove') p.onRemovePerson?.(confirm.person.id); else p.onDisablePerson?.(confirm.person.id) }}
      />
      <PhoneBar>{addPerson}</PhoneBar>
    </div>
  )
}
