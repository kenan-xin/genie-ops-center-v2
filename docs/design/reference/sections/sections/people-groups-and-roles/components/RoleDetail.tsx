import { useState } from 'react'
import { AlertTriangle, ArrowLeft, Building2, Copy, Pencil, Plus, Trash2, UsersRound } from 'lucide-react'
import type { AssignmentInput, Group, ModuleInfo, Person, Role, RoleAssignment, RoleInput, ScopeRecord } from '@/../product/sections/people-groups-and-roles/types'
import { btnGhost, btnPrimary, btnSecondary, fmtDate, focusRing, guardReason } from './helpers'
import { Avatar, Card, ConfirmDialog, EmptyRow, Pill, Th, Td } from './ui'
import { AssignmentForm } from './AssignmentForm'
import { RoleForm } from './RoleForm'

export interface RoleDetailProps {
  role: Role
  roles: Role[]
  roleAssignments: RoleAssignment[]
  modules: ModuleInfo[]
  people: Person[]
  groups: Group[]
  scopeRecords: ScopeRecord[]
  currentUserId?: string
  onBack?: () => void
  onUpdateRole?: (roleId: string, input: RoleInput) => void
  onCopyRole?: (roleId: string) => void
  onCreateRole?: (input: RoleInput) => void
  onDeleteRole?: (roleId: string) => void
  onAddAssignment?: (input: AssignmentInput) => void
  onRemoveAssignment?: (assignmentId: string) => void
}

export function RoleDetail(p: RoleDetailProps) {
  const { role } = p
  const [form, setForm] = useState<'edit' | 'copy' | null>(null)
  const [adding, setAdding] = useState(false)
  const [confirm, setConfirm] = useState<'delete' | { assignmentId: string } | null>(null)
  const assignments = p.roleAssignments.filter((a) => a.roleId === role.id)
  const modulesWithKeys = p.modules.filter((m) => m.permissionKeys.some((k) => role.permissions.includes(k.key)))
  const moduleName = p.modules.find((m) => m.id === role.moduleId)?.name
  const state = { people: p.people, roles: p.roles, roleAssignments: p.roleAssignments }
  const removeGuard = (assignmentId: string) => guardReason(state, p.currentUserId, { type: 'removeAssignment', assignmentId })
  const describe = (a: RoleAssignment) => ({
    person: a.principalType === 'user' ? p.people.find((x) => x.id === a.principalId) : null,
    group: a.principalType === 'group' ? p.groups.find((x) => x.id === a.principalId) : null,
    scope: a.scopeId ? p.scopeRecords.find((s) => s.id === a.scopeId) : null,
  })
  const confirmed = confirm && typeof confirm === 'object' ? assignments.find((a) => a.id === confirm.assignmentId) : null
  const confirmedInfo = confirmed ? describe(confirmed) : null
  const iconBtn = `${btnGhost} justify-center px-0 text-gray-500 hover:text-red-700`

  return (
    <div className="flex flex-col gap-4 pb-8">
      <button type="button" onClick={() => p.onBack?.()} className={`inline-flex w-fit items-center gap-1.5 rounded text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 ${focusRing}`}>
        <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden />All roles
      </button>

      <Card>
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight">{role.name}</h2>
              {role.kind === 'system' ? <Pill>System · {moduleName}</Pill> : <Pill tone="blue">Custom</Pill>}
            </div>
            <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">{role.description}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {role.kind === 'custom' ? <button type="button" className={btnSecondary} onClick={() => setForm('edit')}><Pencil className="size-5 text-gray-500" strokeWidth={1.75} aria-hidden />Edit</button> : null}
            <button type="button" className={btnSecondary} onClick={() => { p.onCopyRole?.(role.id); setForm('copy') }}><Copy className="size-5 text-gray-500" strokeWidth={1.75} aria-hidden />Copy</button>
            {role.kind === 'custom' ? <button type="button" className={`${btnSecondary} text-red-700 dark:text-red-300`} onClick={() => setConfirm('delete')}><Trash2 className="size-5" strokeWidth={1.75} aria-hidden />Delete</button> : null}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <div className="px-5 pb-3 pt-5 sm:px-6">
            <h3 className="text-base font-bold tracking-tight">Permissions</h3>
            <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">{role.permissions.length} {role.permissions.length === 1 ? 'key' : 'keys'} across {modulesWithKeys.length} {modulesWithKeys.length === 1 ? 'module' : 'modules'}.</p>
            {role.entitlementAdded?.length ? (
              <p className="mt-2 rounded-xl bg-blue-50 px-2.5 py-1.5 text-xs text-blue-900 dark:bg-blue-900/30 dark:text-blue-100">When a module is entitled, its admin permission is appended to this role automatically, so administrators always reach every entitled module's admin screens. Member use of a module's records is still a separate grant.</p>
            ) : null}
          </div>
          <div className="divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800">
            {modulesWithKeys.map((m) => (
              <div key={m.id} className="px-5 py-3.5 sm:px-6">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{m.name}</span>
                  <Pill tone={m.entitled ? 'emerald' : 'gray'}>{m.entitled ? 'Entitled' : 'Not entitled'}</Pill>
                </div>
                {!m.entitled ? (
                  <p className="mt-1.5 flex items-start gap-1.5 rounded-xl bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                    <AlertTriangle className="mt-px size-4 shrink-0" strokeWidth={2} aria-hidden />
                    <span className="min-w-0">This tenant is not entitled to {m.name}. These keys grant nothing until an operator enables the module.</span>
                  </p>
                ) : null}
                <ul className="mt-2 flex flex-col gap-1.5">
                  {m.permissionKeys.filter((k) => role.permissions.includes(k.key)).map((k) => (
                    <li key={k.key} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 flex-wrap items-center gap-1.5">{!m.entitled ? <AlertTriangle className="size-4 shrink-0 text-amber-600" strokeWidth={2} aria-label="Module not entitled" /> : null}<span className="min-w-0">{k.label}</span>{role.entitlementAdded?.includes(k.key) ? <Pill tone="blue">Added by entitlement</Pill> : null}</span>
                      <code className="shrink-0 font-mono text-xs text-gray-500">{k.key}</code>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5 sm:px-6">
            <div>
              <h3 className="text-base font-bold tracking-tight">Assignments</h3>
              <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">Who holds this role, and at which scope.</p>
            </div>
            <button type="button" className={btnPrimary} onClick={() => setAdding(true)}><Plus className="size-5" strokeWidth={2} aria-hidden />Add assignment</button>
          </div>
          <ul className="divide-y divide-gray-100 border-t border-gray-100 md:hidden dark:divide-gray-800 dark:border-gray-800">
            {assignments.map((a) => {
              const { person, group, scope } = describe(a)
              const why = removeGuard(a.id)
              return (
                <li key={a.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  {person ? <Avatar name={person.name} size="sm" /> : <span className="flex size-7 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800"><UsersRound className="size-4 text-gray-600" strokeWidth={1.75} aria-hidden /></span>}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 font-medium">{person?.name ?? group?.name}<Pill tone={a.scopeId ? 'blue' : 'gray'}>{scope ? scope.label : 'Whole tenant'}</Pill></div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">{fmtDate(a.createdAt)} by {a.createdBy}</div>
                  </div>
                  <button type="button" aria-label="Remove assignment" disabled={Boolean(why)} title={why ?? undefined} className={`${iconBtn} size-11`} onClick={() => setConfirm({ assignmentId: a.id })}><Trash2 className="size-5" strokeWidth={1.75} /></button>
                </li>
              )
            })}
            {assignments.length === 0 ? <li className="px-5 py-10 text-center text-sm text-gray-600 dark:text-gray-400">Nobody holds this role yet.</li> : null}
          </ul>
          <div className="hidden border-t border-gray-100 md:block dark:border-gray-800">
            <table className="w-full table-fixed">
              <colgroup><col /><col className="w-[30%]" /><col className="w-36" /><col className="w-16" /></colgroup>
              <thead className="bg-gray-50 dark:bg-gray-950/50"><tr><Th>Principal</Th><Th>Scope</Th><Th>Added</Th><Th /></tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {assignments.map((a) => {
                  const { person, group, scope } = describe(a)
                  const why = removeGuard(a.id)
                  return (
                    <tr key={a.id}>
                      <Td>
                        <div className="flex items-center gap-2.5">
                          {person ? <Avatar name={person.name} size="sm" /> : <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">{group?.source === 'idp' ? <Building2 className="size-4 text-gray-600" strokeWidth={1.75} aria-hidden /> : <UsersRound className="size-4 text-gray-600" strokeWidth={1.75} aria-hidden />}</span>}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 font-medium"><span className="truncate">{person?.name ?? group?.name}</span>{group?.stale ? <Pill tone="amber">Stale</Pill> : null}</div>
                            <div className="truncate text-xs text-gray-600 dark:text-gray-400">{person ? person.email : `${group?.source === 'idp' ? 'Directory' : 'Local'} group · ${group?.memberCount ?? 0} members`}</div>
                          </div>
                        </div>
                      </Td>
                      <Td><Pill tone={a.scopeId ? 'blue' : 'gray'}><span className="truncate">{scope ? scope.label : 'Whole tenant'}</span></Pill></Td>
                      <Td className="text-xs text-gray-600 dark:text-gray-400">{fmtDate(a.createdAt)}<br />by {a.createdBy}</Td>
                      <Td className="text-right"><button type="button" aria-label="Remove assignment" disabled={Boolean(why)} title={why ?? undefined} className={`${iconBtn} size-8`} onClick={() => setConfirm({ assignmentId: a.id })}><Trash2 className="size-5" strokeWidth={1.75} /></button></Td>
                    </tr>
                  )
                })}
                {assignments.length === 0 ? <EmptyRow colSpan={4}>Nobody holds this role yet.</EmptyRow> : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {adding ? <AssignmentForm open onClose={() => setAdding(false)} roles={p.roles} people={p.people} groups={p.groups} modules={p.modules} scopeRecords={p.scopeRecords} roleAssignments={p.roleAssignments} fixedRoleId={role.id} onSubmit={p.onAddAssignment} /> : null}
      {form ? <RoleForm open onClose={() => setForm(null)} modules={p.modules} existingRoles={p.roles} initial={role} mode={form} onSubmit={(input) => (form === 'edit' ? p.onUpdateRole?.(role.id, input) : p.onCreateRole?.(input))} /> : null}
      <ConfirmDialog open={confirm === 'delete'} onClose={() => setConfirm(null)} title={`Delete ${role.name}?`} description={`Its ${assignments.length} ${assignments.length === 1 ? 'assignment is' : 'assignments are'} removed and the people and groups holding it lose these permissions now.`} confirmLabel="Delete role" danger onConfirm={() => p.onDeleteRole?.(role.id)} />
      <ConfirmDialog open={Boolean(confirmed)} onClose={() => setConfirm(null)} title={`Remove ${role.name} from ${confirmedInfo?.person?.name ?? confirmedInfo?.group?.name ?? ''}?`} description={`${confirmedInfo?.group ? 'Every member of the group loses' : 'They lose'} this role ${confirmedInfo?.scope ? `for ${confirmedInfo.scope.label}` : 'for the whole tenant'} at once.`} confirmLabel="Remove" danger onConfirm={() => confirmed && p.onRemoveAssignment?.(confirmed.id)} />
    </div>
  )
}
