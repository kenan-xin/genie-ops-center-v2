import { goTo } from '@/shell/components/routes'
import { useState } from 'react'
import data from '@/../product/sections/people-groups-and-roles/data.json'
import type { Group, Person, Role, RoleAssignment, ScopeRecord } from '@/../product/sections/people-groups-and-roles/types'
import { guardReason } from './components/helpers'
import { GroupsDirectory } from './components/GroupsDirectory'

/** Preview switches: ?open=<id> or ?group=<id> opens the inspector, ?dialog=delete|archive|clear opens a confirm, ?lastadmin=1 leaves one tenant administrator. */
export default function GroupsDirectoryPreview() {
  const params = new URLSearchParams(window.location.search)
  const lastAdmin = params.get('lastadmin') === '1'
  const [groups, setGroups] = useState(data.groups as Group[])
  const [people, setPeople] = useState(() => (data.people as Person[]).map((x) => (lastAdmin && x.id === 'usr_leila' ? { ...x, groupIds: x.groupIds.filter((g) => g !== 'grp_admins') } : x)))
  const dialog = params.get('dialog')
  const roles = data.roles as Role[]
  const roleAssignments = data.roleAssignments as RoleAssignment[]

  return (
    <GroupsDirectory
      groups={groups}
      people={people}
      roles={roles}
      roleAssignments={roleAssignments}
      scopeRecords={data.scopeRecords as ScopeRecord[]}
      initialGroupId={params.get('group') ?? params.get('open')}
      initialDialog={dialog === 'delete' || dialog === 'archive' || dialog === 'clear' ? dialog : undefined}
      guard={(action) => guardReason({ people, roles, roleAssignments }, data.currentUserId, action)}
      onCreateLocalGroup={(name, description) => setGroups((l) => [...l, { id: `grp_${Date.now()}`, name, description, source: 'local', externalId: null, memberCount: 0, syncedAt: null, stale: false, lastSeenAt: null, archived: false }])}
      onUpdateLocalGroup={(id, name, description) => setGroups((l) => l.map((g) => (g.id === id ? { ...g, name, description } : g)))}
      onAddToLocalGroup={(pid, gid) => { setPeople((l) => l.map((x) => (x.id === pid ? { ...x, groupIds: [...x.groupIds, gid] } : x))); setGroups((l) => l.map((g) => (g.id === gid ? { ...g, memberCount: g.memberCount + 1 } : g))) }}
      onRemoveFromLocalGroup={(pid, gid) => { setPeople((l) => l.map((x) => (x.id === pid ? { ...x, groupIds: x.groupIds.filter((g) => g !== gid) } : x))); setGroups((l) => l.map((g) => (g.id === gid ? { ...g, memberCount: Math.max(0, g.memberCount - 1) } : g))) }}
      onArchiveGroup={(id) => setGroups((l) => l.map((g) => (g.id === id ? { ...g, archived: true } : g)))}
      onDeleteLocalGroup={(id) => { setGroups((l) => l.filter((g) => g.id !== id)); setPeople((l) => l.map((x) => ({ ...x, groupIds: x.groupIds.filter((g) => g !== id) }))) }}
      onRemoveAllMembers={(id) => { setPeople((l) => l.map((x) => ({ ...x, groupIds: x.groupIds.filter((g) => g !== id) }))); setGroups((l) => l.map((g) => (g.id === id ? { ...g, memberCount: 0 } : g))) }}
      onOpenRole={(id) => goTo(`/admin/roles/${id}`)}
      onManageAccess={(id) => goTo(`/admin/access?recipient=${id}`)}
    />
  )
}
