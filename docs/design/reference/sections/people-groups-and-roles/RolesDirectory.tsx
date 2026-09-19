import { goTo } from '@/shell/components/routes'
import { useState } from 'react'
import data from '@/../product/sections/people-groups-and-roles/data.json'
import type { ModuleInfo, Role, RoleAssignment } from '@/../product/sections/people-groups-and-roles/types'
import { RolesDirectory } from './components/RolesDirectory'

export default function RolesDirectoryPreview() {
  const [roles, setRoles] = useState(data.roles as Role[])
  return (
    <RolesDirectory
      roles={roles}
      roleAssignments={data.roleAssignments as RoleAssignment[]}
      modules={data.modules as ModuleInfo[]}
      onOpenRole={(id) => goTo(`/admin/roles/${id}`)}
      onCreateRole={(input) => setRoles((l) => [...l, { id: `role_${Date.now()}`, kind: 'custom', moduleId: null, ...input }])}
      onUpdateRole={(id, input) => setRoles((l) => l.map((r) => (r.id === id ? { ...r, ...input } : r)))}
      onCopyRole={(id) => console.log('Copy role:', id)}
      onDeleteRole={(id) => setRoles((l) => l.filter((r) => r.id !== id))}
    />
  )
}
