import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { ModuleInfo, Role, RoleAssignment, RoleInput } from '@/../product/sections/people-groups-and-roles/types'
import { btnPrimary, focusRing, rowKeyDown } from './helpers'
import { Card, ConfirmDialog, EmptyRow, HelpNote, PhoneBar, Pill, RowMenu, SearchField, Th, Td } from './ui'
import { RoleForm } from './RoleForm'

export interface RolesDirectoryProps {
  roles: Role[]
  roleAssignments: RoleAssignment[]
  modules: ModuleInfo[]
  /** Row click. The host opens the role detail. */
  onOpenRole?: (roleId: string) => void
  onCreateRole?: (input: RoleInput) => void
  onUpdateRole?: (roleId: string, input: RoleInput) => void
  onCopyRole?: (roleId: string) => void
  onDeleteRole?: (roleId: string) => void
}

export function RolesDirectory({ roles, roleAssignments, modules, onOpenRole, onCreateRole, onUpdateRole, onCopyRole, onDeleteRole }: RolesDirectoryProps) {
  const [q, setQ] = useState('')
  const [form, setForm] = useState<{ mode: 'create' | 'edit' | 'copy'; role: Role | null } | null>(null)
  const [deleting, setDeleting] = useState<Role | null>(null)
  const rows = useMemo(() => roles.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || r.description.toLowerCase().includes(q.toLowerCase())), [roles, q])
  const moduleName = (id: string | null) => modules.find((m) => m.id === id)?.name
  const hasUnentitled = (r: Role) => modules.some((m) => !m.entitled && m.permissionKeys.some((k) => r.permissions.includes(k.key)))
  const count = (r: Role) => roleAssignments.filter((a) => a.roleId === r.id).length
  const menuFor = (r: Role) =>
    r.kind === 'system'
      ? [{ label: 'Copy to custom role', onSelect: () => { onCopyRole?.(r.id); setForm({ mode: 'copy', role: r }) } }]
      : [
          { label: 'Edit', onSelect: () => setForm({ mode: 'edit', role: r }) },
          { label: 'Copy', onSelect: () => { onCopyRole?.(r.id); setForm({ mode: 'copy', role: r }) } },
          { label: 'Delete', danger: true, onSelect: () => setDeleting(r) },
        ]
  const newRole = <button type="button" className={btnPrimary} onClick={() => setForm({ mode: 'create', role: null })}><Plus className="size-5" strokeWidth={2} aria-hidden />New role</button>

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search and its help travel together: a 4px gap binds the icon to the field it explains. */}
        <div className="flex min-w-0 flex-1 items-center gap-1 sm:max-w-md">
        <SearchField value={q} onChange={setQ} placeholder="Search roles" />
        <HelpNote label="How roles work" iconOnly>
          <p>A role is a bundle of permissions. A system role is read-only, and you can copy one into a custom role and edit the copy. A custom role is editable here.</p>
          <p>This page defines roles. Giving a role to a person or a group happens in Access, where one assignment can cover the whole tenant or one record.</p>
        </HelpNote>
        </div>
        <div className="hidden sm:ml-auto md:block">{newRole}</div>
      </div>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-gray-100 md:hidden dark:divide-gray-800">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <button type="button" onClick={() => onOpenRole?.(r.id)} className={`min-w-0 flex-1 rounded-lg text-left ${focusRing}`}>
                <span className="flex flex-wrap items-center gap-1.5"><span className="font-semibold">{r.name}</span>{r.kind === 'system' ? <Pill>System</Pill> : <Pill tone="blue">Custom</Pill>}{hasUnentitled(r) ? <Pill>Not entitled</Pill> : null}</span>
                <span className="block truncate text-xs text-gray-600 dark:text-gray-400">{r.description}</span>
                <span className="block text-xs text-gray-600 dark:text-gray-400">{r.permissions.length} permissions · {count(r)} assignments</span>
              </button>
              <RowMenu items={menuFor(r)} />
            </li>
          ))}
          {rows.length === 0 ? <li className="px-5 py-12 text-center text-sm text-gray-600 dark:text-gray-400">No roles match.</li> : null}
        </ul>
        <div className="hidden md:block">
          <table className="w-full table-fixed">
            <colgroup><col /><col className="w-[26%]" /><col className="w-28" /><col className="w-28" /><col className="w-16" /></colgroup>
            <thead className="bg-gray-50 dark:bg-gray-950/50"><tr><Th>Role</Th><Th>Kind</Th><Th className="text-right">Permissions</Th><Th className="text-right">Assignments</Th><Th /></tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((r) => (
                <tr key={r.id} tabIndex={0} role="button" onClick={() => onOpenRole?.(r.id)} onKeyDown={rowKeyDown(() => onOpenRole?.(r.id))} className={`cursor-pointer motion-safe:transition-colors hover:bg-gray-50 focus-visible:bg-blue-50/60 dark:hover:bg-gray-800/60 ${focusRing}`}>
                  <Td>
                    <div className="truncate font-semibold">{r.name}</div>
                    <div className="truncate text-xs text-gray-600 dark:text-gray-400">{r.description}</div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {r.kind === 'system' ? <Pill>System · {moduleName(r.moduleId)}</Pill> : <Pill tone="blue">Custom</Pill>}
                      {hasUnentitled(r) ? <Pill title="Carries permissions of a module this tenant is not entitled to">Not entitled</Pill> : null}
                    </div>
                  </Td>
                  <Td className="text-right tabular-nums text-gray-700 dark:text-gray-300">{r.permissions.length}</Td>
                  <Td className="text-right tabular-nums text-gray-700 dark:text-gray-300">{count(r)}</Td>
                  <Td className="text-right"><RowMenu items={menuFor(r)} /></Td>
                </tr>
              ))}
              {rows.length === 0 ? <EmptyRow colSpan={5}>No roles match.</EmptyRow> : null}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-100 px-5 py-2.5 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-400">System roles are seeded by modules and cannot be edited. Copy one to start a custom role.</div>
      </Card>
      <PhoneBar>{newRole}</PhoneBar>
      {form ? (
        <RoleForm
          open
          onClose={() => setForm(null)}
          modules={modules}
          existingRoles={roles}
          initial={form.role}
          mode={form.mode}
          onSubmit={(input) => (form.mode === 'edit' && form.role ? onUpdateRole?.(form.role.id, input) : onCreateRole?.(input))}
        />
      ) : null}
      <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} title={`Delete ${deleting?.name ?? ''}?`} description={`Its ${deleting ? count(deleting) : 0} ${deleting && count(deleting) === 1 ? 'assignment is' : 'assignments are'} removed and the people and groups holding it lose these permissions now.`} confirmLabel="Delete role" danger onConfirm={() => deleting && onDeleteRole?.(deleting.id)} />
    </div>
  )
}
