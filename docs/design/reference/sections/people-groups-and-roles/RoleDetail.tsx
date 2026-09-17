import { useState } from 'react'
import data from '@/../product/sections/people-groups-and-roles/data.json'
import type { Group, ModuleInfo, Person, Role, RoleAssignment, ScopeRecord } from '@/../product/sections/people-groups-and-roles/types'
import { RoleDetail } from './components/RoleDetail'

/** Preview switches: ?role=<id> picks the role, ?lastadmin=1 leaves one tenant administrator so the assignment trash is guarded. */
export default function RoleDetailPreview() {
  const roles = data.roles as Role[]
  const params = new URLSearchParams(window.location.search)
  const lastAdmin = params.get('lastadmin') === '1'
  const wanted = params.get('role')
  const role = roles.find((r) => r.id === wanted) ?? roles.find((r) => r.id === 'role_chat_user') ?? roles[0]
  const [assignments, setAssignments] = useState(data.roleAssignments as RoleAssignment[])
  const people = (data.people as Person[]).map((x) => (lastAdmin && x.id === 'usr_leila' ? { ...x, groupIds: x.groupIds.filter((g) => g !== 'grp_admins') } : x))

  return (
    <RoleDetail
      role={role}
      roles={roles}
      roleAssignments={assignments}
      modules={data.modules as ModuleInfo[]}
      people={people}
      groups={data.groups as Group[]}
      scopeRecords={data.scopeRecords as ScopeRecord[]}
      currentUserId={data.currentUserId}
      onBack={() => console.log('Back to roles')}
      onUpdateRole={(id, input) => console.log('Update role:', id, input)}
      onCopyRole={(id) => console.log('Copy role:', id)}
      onCreateRole={(input) => console.log('Create role:', input)}
      onDeleteRole={(id) => console.log('Delete role:', id)}
      onAddAssignment={(input) => setAssignments((l) => [...l, { id: `ra_${Date.now()}`, ...input, createdBy: 'Priya Nair', createdAt: new Date().toISOString() }])}
      onRemoveAssignment={(id) => setAssignments((l) => l.filter((a) => a.id !== id))}
    />
  )
}
