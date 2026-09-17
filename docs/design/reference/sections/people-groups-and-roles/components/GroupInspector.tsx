import { useState } from 'react'
import { AlertTriangle, Archive, Building2, Plus, ShieldCheck, Trash2, UsersRound, X } from 'lucide-react'
import type { Group, Person, Role, RoleAssignment, ScopeRecord } from '@/../product/sections/people-groups-and-roles/types'
import { btnGhost, btnPrimary, btnSecondary, focusRing, inputClass, relativeTime, type Guard } from './helpers'
import { Avatar, CloseButton, ConfirmDialog, Pill, SlideOver, Tabs } from './ui'

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
  /** Design OS preview: open with a confirm dialog already showing. */
  initialDialog?: Confirm
}

export function GroupInspector(p: GroupInspectorProps) {
  const { group } = p
  const [tab, setTab] = useState<'members' | 'roles'>('members')
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(group?.name ?? '')
  const [desc, setDesc] = useState(group?.description ?? '')
  const [pick, setPick] = useState(false)
  const [confirm, setConfirm] = useState<Confirm | null>(p.initialDialog ?? null)
  if (!group) return null

  const guard: Guard = p.guard ?? (() => null)
  const members = p.people.filter((x) => x.groupIds.includes(group.id))
  const addable = p.people.filter((x) => !x.groupIds.includes(group.id) && x.status !== 'disabled')
  const carried = p.roleAssignments.filter((a) => a.principalType === 'group' && a.principalId === group.id)
  const local = group.source === 'local'
  const deleteGuard = local ? guard({ type: 'deleteGroup', groupId: group.id }) : null
  const clearGuard = local ? guard({ type: 'removeAllMembers', groupId: group.id }) : null
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
  const iconBtn = `${btnGhost} size-11 justify-center px-0 text-gray-500 sm:size-8`

  return (
    <SlideOver open onClose={p.onClose} title={group.name}>
      <header className="flex items-start gap-3 px-5 pb-4 pt-5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
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
              <p className="mt-0.5 text-xs text-gray-500">{local ? 'Managed in Genie' : `Synced ${relativeTime(group.syncedAt)} · ${group.externalId}`}</p>
              <div className="-ml-2 mt-1 flex flex-wrap items-center gap-1">
                {local ? (
                  <>
                    <button type="button" className={btnGhost} onClick={() => setEditing(true)}>Edit name and description</button>
                    <button type="button" className={`${btnGhost} text-red-700 dark:text-red-300`} disabled={Boolean(deleteGuard)} title={deleteGuard ?? undefined} onClick={() => setConfirm('delete')}><Trash2 className="size-5" strokeWidth={1.75} aria-hidden />Delete group</button>
                  </>
                ) : group.archived ? null : (
                  <button type="button" className={btnGhost} onClick={() => setConfirm('archive')}><Archive className="size-5 text-gray-500" strokeWidth={1.75} aria-hidden />Archive group</button>
                )}
              </div>
              {deleteGuard ? <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{deleteGuard}. Its members hold the Tenant administrator role through this group.</p> : null}
            </>
          )}
        </div>
        <CloseButton onClick={p.onClose} />
      </header>

      {group.stale ? (
        <div role="status" className="mx-5 mb-3 flex items-start gap-2.5 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" strokeWidth={2} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">This group no longer arrives in sign-in tokens.</p>
            <p className="mt-0.5">Last seen {relativeTime(group.lastSeenAt)}. It was renamed or removed in the identity provider. Its role assignments still apply to the {members.length} people last seen in it. Archive it to hide it from lists; assignments are kept.</p>
          </div>
        </div>
      ) : null}

      <Tabs tabs={[{ id: 'members' as const, label: 'Members', count: members.length }, { id: 'roles' as const, label: 'Roles', count: carried.length }]} value={tab} onChange={setTab} />

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {tab === 'members' ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-600 dark:text-gray-400">{local ? 'Add or remove people here.' : 'Membership is managed in the identity provider.'}</p>
              <div className="flex items-center gap-2">
                {local && members.length > 0 ? <button type="button" className={`${btnGhost} text-gray-600`} disabled={Boolean(clearGuard)} title={clearGuard ?? undefined} onClick={() => setConfirm('clear')}>Remove all members</button> : null}
                {local && addable.length > 0 ? <button type="button" className={btnSecondary} onClick={() => setPick((v) => !v)}><Plus className="size-5" strokeWidth={2} aria-hidden />Add member</button> : null}
              </div>
            </div>
            {pick ? (
              <ul className="rounded-xl border border-blue-200 bg-blue-50/40 p-1 dark:border-blue-900/50 dark:bg-blue-950/20">
                {addable.map((x) => (
                  <li key={x.id}>
                    <button type="button" onClick={() => { p.onAddToLocalGroup?.(x.id, group.id); setPick(false) }} className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-white dark:hover:bg-gray-800 ${focusRing}`}>
                      <Avatar name={x.name} size="sm" /><span className="flex-1"><span className="block font-medium">{x.name}</span><span className="block text-xs text-gray-600 dark:text-gray-400">{x.email}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
              {members.map((x) => {
                const why = local ? guard({ type: 'removeMember', groupId: group.id, personId: x.id }) : null
                return (
                  <li key={x.id} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
                    <Avatar name={x.name} size="sm" />
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{x.name}</span><span className="block truncate text-xs text-gray-600 dark:text-gray-400">{x.email}</span></span>
                    {local ? <button type="button" aria-label={`Remove ${x.name}`} disabled={Boolean(why)} title={why ?? undefined} className={iconBtn} onClick={() => p.onRemoveFromLocalGroup?.(x.id, group.id)}><X className="size-5" strokeWidth={1.75} /></button> : null}
                  </li>
                )
              })}
              {members.length === 0 ? <li className="px-3.5 py-6 text-center text-sm text-gray-600 dark:text-gray-400">No members{local ? ' yet' : ' seen in the last sync'}.</li> : null}
            </ul>
            {!local && members.length < group.memberCount ? <p className="text-xs text-gray-500">{group.memberCount} members in the directory, {members.length} of them have signed in to Genie.</p> : null}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
            {carried.map((a) => {
              const role = p.roles.find((r) => r.id === a.roleId)
              const scope = a.scopeId ? p.scopeRecords.find((s) => s.id === a.scopeId) : null
              return (
                <li key={a.id} className="flex items-center gap-3 px-3.5 py-3 text-sm">
                  <ShieldCheck className="size-4 text-gray-500" strokeWidth={1.75} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => role && p.onOpenRole?.(role.id)} className={`rounded font-semibold text-blue-700 hover:underline dark:text-blue-300 ${focusRing}`}>{role?.name}</button>
                    <div className="text-xs text-gray-600 dark:text-gray-400">added by {a.createdBy}</div>
                  </div>
                  <Pill tone={a.scopeId ? 'blue' : 'gray'}>{scope ? scope.label : 'Whole tenant'}</Pill>
                </li>
              )
            })}
            {carried.length === 0 ? <li className="px-3.5 py-6 text-center text-sm text-gray-600 dark:text-gray-400">This group carries no roles.</li> : null}
          </ul>
        )}
      </div>

      <ConfirmDialog open={confirm === 'delete'} onClose={() => setConfirm(null)} title={`Delete ${group.name}?`} description={`${n(members.length, 'member loses', 'members lose')} this membership and ${n(carried.length, 'role assignment is', 'role assignments are')} removed. This cannot be undone.`} confirmLabel="Delete group" danger onConfirm={() => { p.onDeleteLocalGroup?.(group.id); p.onClose() }} />
      <ConfirmDialog open={confirm === 'archive'} onClose={() => setConfirm(null)} title={`Archive ${group.name}?`} description={`The group is hidden from lists. Its ${n(carried.length, 'role assignment', 'role assignments')} and the ${members.length} people last seen in it are kept.`} confirmLabel="Archive" onConfirm={() => { p.onArchiveGroup?.(group.id); p.onClose() }} />
      <ConfirmDialog open={confirm === 'clear'} onClose={() => setConfirm(null)} title={`Remove all members from ${group.name}?`} description={`${n(members.length, 'person loses', 'people lose')} every role this group carries. The group and its assignments stay.`} confirmLabel="Remove all" danger onConfirm={() => p.onRemoveAllMembers?.(group.id)} />
    </SlideOver>
  )
}
