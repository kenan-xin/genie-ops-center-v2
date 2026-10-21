import { useState } from 'react'
import { Archive, ArrowUpRight, Building2, KeyRound, Pencil, ShieldCheck, Trash2, UsersRound } from 'lucide-react'
import type { Group, Person, Role, RoleAssignment, ScopeRecord } from '@/../product/sections/people-groups-and-roles/types'
import { btnGhost, btnPrimary, btnSecondary, focusRing, inputClass, relativeTime, type Guard } from './helpers'
import { Avatar, CloseButton, ConfirmDialog, HelpNote, Pill, SlideOver, Tabs, WarningNote } from './ui'
import { TransferList, type TransferItem } from './TransferList'

type Confirm = 'archive' | 'delete' | 'clear'

export interface GroupInspectorProps {
  group: Group | null
  onClose: () => void
  people: Person[]
  roles: Role[]
  roleAssignments: RoleAssignment[]
  scopeRecords: ScopeRecord[]
  /** Why a removal is blocked (last-administrator rule), or null. */
  guard?: Guard
  onUpdateLocalGroup?: (groupId: string, name: string, description: string) => void
  onAddToLocalGroup?: (personId: string, groupId: string) => void
  onRemoveFromLocalGroup?: (personId: string, groupId: string) => void
  onArchiveGroup?: (groupId: string) => void
  onDeleteLocalGroup?: (groupId: string) => void
  onRemoveAllMembers?: (groupId: string) => void
  onOpenRole?: (roleId: string) => void
  /** Opens core Access with this group preselected. This screen never writes an assignment (`DEC-39`). */
  onManageAccess?: (groupId: string) => void
  /** Design OS preview: open with a confirm dialog already showing. */
  initialDialog?: Confirm
}

export function GroupInspector(p: GroupInspectorProps) {
  const { group } = p
  const [tab, setTab] = useState<'members' | 'roles'>('members')
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(group?.name ?? '')
  const [desc, setDesc] = useState(group?.description ?? '')
  const [confirm, setConfirm] = useState<Confirm | null>(p.initialDialog ?? null)
  const [leaving, setLeaving] = useState<string[] | null>(null)
  if (!group) return null

  const guard: Guard = p.guard ?? (() => null)
  const members = p.people.filter((x) => x.groupIds.includes(group.id))
  const memberIds = members.map((x) => x.id)
  // Both sides of the transfer list. A disabled person cannot be added, but one who is already a
  // member stays listed so that the administrator can remove them.
  const transferItems: TransferItem[] = p.people
    .filter((x) => x.status !== 'disabled' || x.groupIds.includes(group.id))
    .map((x) => ({
      id: x.id,
      label: x.name,
      description: x.email,
      icon: <Avatar name={x.name} size="sm" />,
      disabledReason: x.groupIds.includes(group.id) ? guard({ type: 'removeMember', groupId: group.id, personId: x.id }) : null,
    }))
  const applyMembers = (ids: string[]) => {
    const before = new Set(memberIds)
    const after = new Set(ids)
    ids.filter((id) => !before.has(id)).forEach((id) => p.onAddToLocalGroup?.(id, group.id))
    memberIds.filter((id) => !after.has(id)).forEach((id) => p.onRemoveFromLocalGroup?.(id, group.id))
  }
  // Adding is applied at once. Removing ends what this group carries and nothing else, so it is
  // confirmed first and the confirmation names the sources that stay.
  const commitMembers = (ids: string[]) => {
    if (memberIds.some((id) => !ids.includes(id))) setLeaving(ids)
    else applyMembers(ids)
  }
  const leavingCount = leaving ? memberIds.filter((id) => !leaving.includes(id)).length : 0
  const carried = p.roleAssignments.filter((a) => a.principalType === 'group' && a.principalId === group.id)
  const local = group.source === 'local'
  const deleteGuard = local ? guard({ type: 'deleteGroup', groupId: group.id }) : null
  const clearGuard = local ? guard({ type: 'removeAllMembers', groupId: group.id }) : null
  // Archiving stops the group granting, so R-38 guards it like any other assignment write.
  const archiveGuard = group.archived ? null : guard({ type: 'archiveGroup', groupId: group.id })
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

  return (
    <SlideOver open onClose={p.onClose} title={group.name}>
      <header className="flex items-start gap-3 px-5 pb-4 pt-5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          {local ? <UsersRound className="size-5" strokeWidth={1.75} aria-hidden /> : <Building2 className="size-5" strokeWidth={1.75} aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex flex-col gap-2">
              <input aria-label="Group name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              <textarea aria-label="Group description" value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} className={`${inputClass} h-auto py-2`} />
              <div className="flex gap-2">
                <button type="button" className={btnPrimary} onClick={() => { p.onUpdateLocalGroup?.(group.id, name.trim(), desc.trim()); setEditing(false) }}>Save</button>
                <button type="button" className={btnSecondary} onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-bold tracking-tight">{group.name}</h2>
                <Pill tone={local ? 'blue' : 'gray'}>{local ? 'Local' : 'Directory'}</Pill>
                {group.stale ? <Pill tone="amber">Stale</Pill> : null}
                {group.archived ? <Pill>Archived</Pill> : null}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{group.description || <span className="italic text-gray-500">No description</span>}</p>
              <p className="mt-0.5 text-xs text-gray-500">{local ? 'Local group, managed here' : `Directory group · synced ${relativeTime(group.syncedAt)} · ${group.externalId}`}</p>
            </>
          )}
        </div>
        <CloseButton onClick={p.onClose} />
      </header>

      {group.stale ? (
        <WarningNote size="md" role="status" className="mx-5 mb-3">
          <p className="font-semibold">This group no longer arrives in sign-in tokens.</p>
          <p className="mt-0.5">Last seen {relativeTime(group.lastSeenAt)}. It was renamed or removed in the identity provider. Its role assignments still apply to the {members.length} people last seen in it. Archive it to hide it from lists; assignments are kept.</p>
        </WarningNote>
      ) : null}

      {/* The one pointer to where access is decided, on both tabs, because it is the question a group raises first. */}
      <button
        type="button"
        onClick={() => p.onManageAccess?.(group.id)}
        className={`mx-5 mb-3 flex items-center gap-3 rounded-lg border border-gray-200 px-3.5 py-3 text-left motion-safe:transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-950 ${focusRing}`}
      >
        <KeyRound className="size-5 shrink-0 text-gray-500" strokeWidth={1.75} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Access is managed in one place</span>
          <span className="block text-xs text-gray-600 dark:text-gray-400">{carried.length === 0 ? 'No grants yet. Give it a solution or a module there.' : `${n(carried.length, 'grant', 'grants')} through this group`}</span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-blue-700 dark:text-blue-400">Open in Access<ArrowUpRight className="size-4" strokeWidth={2} aria-hidden /></span>
      </button>

      <div className="mx-5 mb-3 flex">
        <HelpNote label="How group access works">
          <p>Every member receives what this group is granted, at the scope each grant carries. A person can also hold a direct assignment, which is the exception to the normal path.</p>
          <p>Removing somebody from this group ends only what the group carries. Their direct roles and their other groups stay, and a disabled account or a switched-off module still blocks access.</p>
        </HelpNote>
      </div>

      <Tabs tabs={[{ id: 'members' as const, label: 'Members', count: members.length }, { id: 'roles' as const, label: 'Roles', count: carried.length }]} value={tab} onChange={setTab} />

      {tab === 'members' && local ? (
        <TransferList
          items={transferItems}
          value={memberIds}
          onChange={commitMembers}
          targetLabel="Members"
          availableLabel="Not in this group"
          searchLabel="Search people"
          emptyTarget="No members yet."
          emptyAvailable="Everyone is a member already."
          note="A disabled person cannot be added. A pending invite can."
          targetAction={members.length > 0 ? <button type="button" className={`${btnGhost} h-11 px-2 text-xs text-gray-600 sm:h-8`} disabled={Boolean(clearGuard)} title={clearGuard ?? undefined} onClick={() => setConfirm('clear')}>Remove all</button> : null}
        />
      ) : (
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {tab === 'members' ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-gray-600 dark:text-gray-400">Membership is managed in the identity provider.</p>
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {members.map((x) => (
                  <li key={x.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <Avatar name={x.name} size="sm" />
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{x.name}</span><span className="block truncate text-xs text-gray-600 dark:text-gray-400">{x.email}</span></span>
                  </li>
                ))}
                {members.length === 0 ? <li className="py-6 text-center text-sm text-gray-600 dark:text-gray-400">No members seen in the last sync.</li> : null}
              </ul>
            {members.length < group.memberCount ? <p className="text-xs text-gray-500">{group.memberCount} members in the directory, {members.length} of them have signed in to Genie.</p> : null}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-gray-600 dark:text-gray-400">What this group carries, and at which scope. Read-only here.</p>
            <button type="button" className={btnSecondary} onClick={() => p.onManageAccess?.(group.id)}>Manage in Access</button>
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {carried.map((a) => {
              const role = p.roles.find((r) => r.id === a.roleId)
              const scope = a.scopeId ? p.scopeRecords.find((s) => s.id === a.scopeId) : null
              return (
                <li key={a.id} className="flex items-center gap-3 py-3 text-sm">
                  <ShieldCheck className="size-4 text-gray-500" strokeWidth={1.75} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => role && p.onOpenRole?.(role.id)} className={`rounded font-semibold text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`}>{role?.name}</button>
                    <div className="text-xs text-gray-600 dark:text-gray-400">added by {a.createdBy}</div>
                  </div>
                  <Pill tone={a.scopeId ? 'blue' : 'gray'}>{scope ? scope.label : 'Whole tenant'}</Pill>
                </li>
              )
            })}
            {carried.length === 0 ? <li className="py-6 text-center text-sm text-gray-600 dark:text-gray-400">This group carries no roles.</li> : null}
          </ul>
          </div>
        )}
      </div>
      )}

      {/* Group actions live in one bar at the foot of the sheet, so the header stays identity only. */}
      <footer className="flex shrink-0 flex-col gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-800">
        {deleteGuard ?? archiveGuard ? <p className="text-xs text-gray-600 dark:text-gray-400">{deleteGuard ?? archiveGuard}. Its members hold the Tenant administrator role through this group.</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {local ? (
            <>
              <button type="button" className={btnSecondary} onClick={() => setEditing(true)}><Pencil className="size-5 text-gray-500" strokeWidth={1.75} aria-hidden />Edit name and description</button>
              <button type="button" className={`${btnSecondary} text-red-700 dark:text-red-300`} disabled={Boolean(deleteGuard)} title={deleteGuard ?? undefined} onClick={() => setConfirm('delete')}><Trash2 className="size-5" strokeWidth={1.75} aria-hidden />Delete group</button>
            </>
          ) : (
            <>
              <p className="min-w-0 flex-1 text-xs text-gray-600 dark:text-gray-400">{group.archived ? 'Archived. Its role assignments are kept and give nothing while it is archived.' : 'Name, description, and members come from the identity provider.'}</p>
              {group.archived ? null : <button type="button" className={btnSecondary} disabled={Boolean(archiveGuard)} title={archiveGuard ?? undefined} onClick={() => setConfirm('archive')}><Archive className="size-5 text-gray-500" strokeWidth={1.75} aria-hidden />Archive group</button>}
            </>
          )}
        </div>
      </footer>

      <ConfirmDialog open={confirm === 'delete'} onClose={() => setConfirm(null)} title={`Delete ${group.name}?`} description={`${n(members.length, 'member loses', 'members lose')} this membership and ${n(carried.length, 'role assignment is', 'role assignments are')} removed. This cannot be undone.`} confirmLabel="Delete group" danger onConfirm={() => { p.onDeleteLocalGroup?.(group.id); p.onClose() }} />
      <ConfirmDialog open={confirm === 'archive' && !archiveGuard} onClose={() => setConfirm(null)} title={`Archive ${group.name}?`} description={`The group is hidden from lists and stops granting. Its ${n(carried.length, 'role assignment', 'role assignments')} and the ${members.length} people last seen in it are kept, and they apply again when it is restored.`} confirmLabel="Archive" onConfirm={() => { p.onArchiveGroup?.(group.id); p.onClose() }} />
      <ConfirmDialog open={confirm === 'clear'} onClose={() => setConfirm(null)} title={`Remove all members from ${group.name}?`} description={`${n(members.length, 'person loses', 'people lose')} every role this group carries. Their direct roles and their other groups still give access, and this does not remove them. The group and its assignments stay.`} confirmLabel="Remove all" danger onConfirm={() => p.onRemoveAllMembers?.(group.id)} />
      <ConfirmDialog
        open={leaving !== null}
        onClose={() => setLeaving(null)}
        title={leavingCount === 1 ? `Remove one person from ${group.name}?` : `Remove ${leavingCount} people from ${group.name}?`}
        description={`${leavingCount === 1 ? 'That person loses' : 'Those people lose'} every role this group carries. Direct roles and other group memberships still give access, and this does not remove them. Access, then Overview, shows what is left.`}
        confirmLabel="Remove"
        danger
        onConfirm={() => { if (leaving) applyMembers(leaving); setLeaving(null) }}
      />
    </SlideOver>
  )
}
