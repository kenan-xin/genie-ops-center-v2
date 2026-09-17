import { useMemo, useState } from 'react'
import { Building2, Plus, UsersRound } from 'lucide-react'
import type { Group, Person, Role, RoleAssignment, ScopeRecord } from '@/../product/sections/people-groups-and-roles/types'
import { btnPrimary, btnSecondary, focusRing, inputClass, labelClass, relativeTime, rowKeyDown, type Guard } from './helpers'
import { Card, Dialog, EmptyRow, PhoneBar, Pill, SearchField, Th, Td } from './ui'
import { GroupInspector } from './GroupInspector'

export interface GroupsDirectoryProps {
  groups: Group[]
  people: Person[]
  roles: Role[]
  roleAssignments: RoleAssignment[]
  scopeRecords: ScopeRecord[]
  initialGroupId?: string | null
  /** Design OS preview: open the inspector with a confirm dialog showing. */
  initialDialog?: 'archive' | 'delete' | 'clear'
  /** Why a removal is blocked (last-administrator rule), or null. */
  guard?: Guard
  onCreateLocalGroup?: (name: string, description: string) => void
  onUpdateLocalGroup?: (groupId: string, name: string, description: string) => void
  onAddToLocalGroup?: (personId: string, groupId: string) => void
  onRemoveFromLocalGroup?: (personId: string, groupId: string) => void
  onArchiveGroup?: (groupId: string) => void
  onDeleteLocalGroup?: (groupId: string) => void
  onRemoveAllMembers?: (groupId: string) => void
  onOpenRole?: (roleId: string) => void
}

export function GroupsDirectory(p: GroupsDirectoryProps) {
  const [q, setQ] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [openId, setOpenId] = useState<string | null>(p.initialGroupId ?? null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')

  const rows = useMemo(() => p.groups.filter((g) => (showArchived || !g.archived) && (!q || g.name.toLowerCase().includes(q.toLowerCase()))), [p.groups, q, showArchived])
  const archivedCount = p.groups.filter((g) => g.archived).length
  const rolesFor = (g: Group) => p.roleAssignments.filter((a) => a.principalType === 'group' && a.principalId === g.id).length
  const open = p.groups.find((g) => g.id === openId) ?? null
  const newGroup = <button type="button" className={btnPrimary} onClick={() => setCreating(true)}><Plus className="size-5" strokeWidth={2} aria-hidden />New local group</button>

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchField value={q} onChange={setQ} placeholder="Search groups" />
        {archivedCount > 0 ? (
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className={`size-4 rounded border-gray-300 accent-blue-600 ${focusRing}`} />
            Show archived ({archivedCount})
          </label>
        ) : null}
        <div className="hidden sm:ml-auto md:block">{newGroup}</div>
      </div>

      <Card className="overflow-hidden">
        <ul className="divide-y divide-gray-100 md:hidden dark:divide-gray-800">
          {rows.map((g) => (
            <li key={g.id}>
              <button type="button" onClick={() => setOpenId(g.id)} className={`flex w-full items-center gap-3 px-4 py-3 text-left ${focusRing} ${g.archived ? 'opacity-60' : ''}`}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">{g.source === 'idp' ? <Building2 className="size-4" strokeWidth={1.75} aria-hidden /> : <UsersRound className="size-4" strokeWidth={1.75} aria-hidden />}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5"><span className="truncate font-semibold">{g.name}</span><Pill tone={g.source === 'local' ? 'blue' : 'gray'}>{g.source === 'local' ? 'Local' : 'Directory'}</Pill>{g.stale ? <Pill tone="amber">Stale</Pill> : null}{g.archived ? <Pill>Archived</Pill> : null}</span>
                  <span className="block text-xs text-gray-600 dark:text-gray-400">{g.memberCount} members · {rolesFor(g)} roles{g.source === 'idp' ? ` · synced ${relativeTime(g.stale ? g.lastSeenAt : g.syncedAt)}` : ''}</span>
                </span>
              </button>
            </li>
          ))}
          {rows.length === 0 ? <li className="px-5 py-12 text-center text-sm text-gray-600 dark:text-gray-400">No groups match.</li> : null}
        </ul>
        <div className="hidden md:block">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-950/50"><tr><Th>Group</Th><Th>Source</Th><Th className="text-right">Members</Th><Th className="text-right">Roles</Th><Th>Sync</Th></tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((g) => (
                <tr key={g.id} tabIndex={0} role="button" onClick={() => setOpenId(g.id)} onKeyDown={rowKeyDown(() => setOpenId(g.id))} className={`cursor-pointer motion-safe:transition-colors hover:bg-gray-50 focus-visible:bg-blue-50/60 dark:hover:bg-gray-800/60 ${focusRing} ${g.archived ? 'opacity-60' : ''} ${openId === g.id ? 'bg-blue-50/60 dark:bg-blue-950/30' : ''}`}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">{g.source === 'idp' ? <Building2 className="size-4" strokeWidth={1.75} aria-hidden /> : <UsersRound className="size-4" strokeWidth={1.75} aria-hidden />}</span>
                      <div className="min-w-0"><div className="flex items-center gap-1.5 font-semibold">{g.name}{g.archived ? <Pill>Archived</Pill> : null}</div><div className="max-w-md truncate text-xs text-gray-600 dark:text-gray-400">{g.description || '—'}</div></div>
                    </div>
                  </Td>
                  <Td><Pill tone={g.source === 'local' ? 'blue' : 'gray'}>{g.source === 'local' ? 'Local' : 'Directory'}</Pill></Td>
                  <Td className="text-right tabular-nums text-gray-700 dark:text-gray-300">{g.memberCount}</Td>
                  <Td className="text-right tabular-nums text-gray-700 dark:text-gray-300">{rolesFor(g)}</Td>
                  <Td className="whitespace-nowrap">
                    {g.source === 'local' ? <span className="text-xs text-gray-500">Managed in Genie</span> : g.stale ? <Pill tone="amber" title={`Last seen ${relativeTime(g.lastSeenAt)}`}>Stale · {relativeTime(g.lastSeenAt)}</Pill> : <span className="text-sm text-gray-700 dark:text-gray-300">{relativeTime(g.syncedAt)}</span>}
                  </Td>
                </tr>
              ))}
              {rows.length === 0 ? <EmptyRow colSpan={5}>No groups match.</EmptyRow> : null}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-100 px-5 py-2.5 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-400">Directory groups arrive in the sign-in token and are refreshed at every sign-in. A group that stops arriving is marked stale and keeps its roles.</div>
      </Card>

      <GroupInspector group={open} onClose={() => setOpenId(null)} guard={p.guard} initialDialog={p.initialDialog} people={p.people} roles={p.roles} roleAssignments={p.roleAssignments} scopeRecords={p.scopeRecords} onUpdateLocalGroup={p.onUpdateLocalGroup} onAddToLocalGroup={p.onAddToLocalGroup} onRemoveFromLocalGroup={p.onRemoveFromLocalGroup} onArchiveGroup={p.onArchiveGroup} onDeleteLocalGroup={p.onDeleteLocalGroup} onRemoveAllMembers={p.onRemoveAllMembers} onOpenRole={p.onOpenRole} />

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New local group"
        description="A group managed in Genie. Use it when the directory has no matching group."
        footer={<><button type="button" className={btnSecondary} onClick={() => setCreating(false)}>Cancel</button><button type="button" className={btnPrimary} disabled={!name.trim()} onClick={() => { p.onCreateLocalGroup?.(name.trim(), desc.trim()); setCreating(false); setName(''); setDesc('') }}>Create group</button></>}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5"><label htmlFor="ng-name" className={labelClass}>Name</label><input id="ng-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="For example, Night shift leads" className={inputClass} /></div>
          <div className="flex flex-col gap-1.5"><label htmlFor="ng-desc" className={labelClass}>Description <span className="font-normal text-gray-500">(optional)</span></label><textarea id="ng-desc" value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} className={`${inputClass} h-auto py-2`} /></div>
        </div>
      </Dialog>
      <PhoneBar>{newGroup}</PhoneBar>
    </div>
  )
}
