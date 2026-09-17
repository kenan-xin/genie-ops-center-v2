import { useMemo, useState } from 'react'
import { Building2, Check, Search, UserRound, UsersRound } from 'lucide-react'
import type { AssignmentInput, Group, ModuleInfo, Person, PrincipalType, Role, RoleAssignment, ScopeRecord } from '@/../product/sections/people-groups-and-roles/types'
import { btnPrimary, btnSecondary, focusRing, inputClass, labelClass } from './helpers'
import { Avatar, Dialog, LoadingButton, Pill } from './ui'

export interface AssignmentFormProps {
  open: boolean
  onClose: () => void
  roles: Role[]
  people: Person[]
  groups: Group[]
  modules: ModuleInfo[]
  scopeRecords: ScopeRecord[]
  /** Existing assignments, for the duplicate check on (role, principal, scope). */
  roleAssignments?: RoleAssignment[]
  /** Preselect and lock the role (from the role page) or the person (from the person inspector). */
  fixedRoleId?: string
  fixedPrincipal?: { type: PrincipalType; id: string }
  onSubmit?: (input: AssignmentInput) => void
}

/** Role, principal, scope. Shared by the Roles page and the person inspector. */
export function AssignmentForm({ open, onClose, roles, people, groups, modules, scopeRecords, roleAssignments = [], fixedRoleId, fixedPrincipal, onSubmit }: AssignmentFormProps) {
  const [roleId, setRoleId] = useState(fixedRoleId ?? roles[0]?.id ?? '')
  const [q, setQ] = useState('')
  const [principal, setPrincipal] = useState<{ type: PrincipalType; id: string } | null>(fixedPrincipal ?? null)
  const [scopeType, setScopeType] = useState<string>('tenant')
  const [scopeQ, setScopeQ] = useState('')
  const [scopeId, setScopeId] = useState<string | null>(null)

  const role = roles.find((r) => r.id === roleId)
  // Record types the role can be scoped to: those of modules whose keys the role carries.
  // A role with any core key is administrative and tenant-wide by nature.
  const recordTypes = useMemo(() => {
    if (!role || role.permissions.some((k) => k.startsWith('core:'))) return []
    const mods = modules.filter((m) => m.permissionKeys.some((k) => role.permissions.includes(k.key)))
    return mods.flatMap((m) => m.recordTypes.map((rt) => ({ ...rt, moduleId: m.id, moduleName: m.name, entitled: m.entitled })))
  }, [role, modules])

  const candidates = useMemo(() => {
    const s = q.trim().toLowerCase()
    const g = groups.filter((x) => !x.archived && (!s || x.name.toLowerCase().includes(s))).map((x) => ({ type: 'group' as const, id: x.id, label: x.name, sub: `${x.memberCount} members`, source: x.source }))
    const p = people.filter((x) => !s || x.name.toLowerCase().includes(s) || x.email.toLowerCase().includes(s)).map((x) => ({ type: 'user' as const, id: x.id, label: x.name, sub: x.email, source: null }))
    return [...g, ...p].slice(0, 6)
  }, [q, groups, people])

  const chosenType = recordTypes.find((r) => r.type === scopeType)
  const scopeEntitled = scopeType === 'tenant' || (chosenType?.entitled ?? false)
  const records = scopeRecords.filter((r) => r.type === scopeType && (!scopeQ || r.label.toLowerCase().includes(scopeQ.toLowerCase())))
  const finalScopeType = scopeType === 'tenant' ? null : scopeType
  const finalScopeId = scopeType === 'tenant' ? null : scopeId
  const duplicate = Boolean(role && principal && (scopeType === 'tenant' || scopeId) && roleAssignments.some((a) => a.roleId === role.id && a.principalType === principal.type && a.principalId === principal.id && a.scopeType === finalScopeType && a.scopeId === finalScopeId))
  const valid = Boolean(role && principal && (scopeType === 'tenant' || (scopeEntitled && scopeId))) && !duplicate

  const principalLabel = principal ? (principal.type === 'user' ? people.find((p) => p.id === principal.id)?.name : groups.find((g) => g.id === principal.id)?.name) : null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add assignment"
      description="Grant a role to a person or group, for the whole tenant or one record."
      footer={
        <>
          <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
          <LoadingButton
            className={btnPrimary}
            disabled={!valid}
            onPress={() => {
              if (!role || !principal) return
              onSubmit?.({ roleId: role.id, principalType: principal.type, principalId: principal.id, scopeType: finalScopeType, scopeId: finalScopeId })
              onClose()
            }}
          >
            Add assignment
          </LoadingButton>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>Role</span>
          {fixedRoleId ? (
            <div className="flex items-center gap-2 text-sm"><span className="font-semibold">{role?.name}</span><Pill tone={role?.kind === 'system' ? 'gray' : 'blue'}>{role?.kind === 'system' ? 'System' : 'Custom'}</Pill></div>
          ) : (
            <select value={roleId} onChange={(e) => { setRoleId(e.target.value); setScopeType('tenant'); setScopeId(null) }} className={`${inputClass} appearance-none`}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>Who</span>
          {fixedPrincipal ? (
            <div className="flex items-center gap-2 text-sm">
              {fixedPrincipal.type === 'user' ? <Avatar name={principalLabel ?? ''} size="sm" /> : <UsersRound className="size-4 text-gray-500" strokeWidth={1.75} aria-hidden />}
              <span className="font-semibold">{principalLabel}</span>
            </div>
          ) : principal ? (
            <div className="flex items-center justify-between rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-gray-700">
              <span className="flex items-center gap-2">
                {principal.type === 'user' ? <Avatar name={principalLabel ?? ''} size="sm" /> : <span className="flex size-7 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800"><UsersRound className="size-4 text-gray-600" strokeWidth={1.75} aria-hidden /></span>}
                <span className="font-semibold">{principalLabel}</span>
                <Pill tone={principal.type === 'user' ? 'blue' : 'gray'}>{principal.type === 'user' ? 'Person' : 'Group'}</Pill>
              </span>
              <button type="button" className={`rounded text-xs font-medium text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`} onClick={() => setPrincipal(null)}>Change</button>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-500 dark:border-gray-500">
              <label className="flex h-10 items-center gap-2 border-b border-gray-200 px-3 text-sm dark:border-gray-800">
                <Search className="size-4 text-gray-500" strokeWidth={1.75} aria-hidden />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people and groups" className="flex-1 bg-transparent outline-none placeholder:text-gray-500" />
              </label>
              <ul className="max-h-56 overflow-y-auto p-1">
                {candidates.map((c) => (
                  <li key={c.type + c.id}>
                    <button type="button" onClick={() => setPrincipal({ type: c.type, id: c.id })} className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800 ${focusRing}`}>
                      {c.type === 'user' ? <Avatar name={c.label} size="sm" /> : <span className="flex size-7 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">{c.source === 'idp' ? <Building2 className="size-4 text-gray-600" strokeWidth={1.75} aria-hidden /> : <UsersRound className="size-4 text-gray-600" strokeWidth={1.75} aria-hidden />}</span>}
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{c.label}</span><span className="block truncate text-xs text-gray-600 dark:text-gray-400">{c.sub}</span></span>
                      <Pill tone={c.type === 'user' ? 'blue' : 'gray'}>{c.type === 'user' ? 'Person' : 'Group'}</Pill>
                    </button>
                  </li>
                ))}
                {candidates.length === 0 ? <li className="px-3 py-6 text-center text-sm text-gray-600 dark:text-gray-400">No match.</li> : null}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>Scope</span>
          <div className="flex flex-wrap gap-2">
            {[{ type: 'tenant', label: 'Whole tenant' }, ...recordTypes.map((rt) => ({ type: rt.type, label: `One ${rt.label.toLowerCase()}${rt.entitled ? '' : ' (not entitled)'}` }))].map((opt) => (
              <button
                key={opt.type}
                type="button"
                role="radio"
                aria-checked={scopeType === opt.type}
                onClick={() => { setScopeType(opt.type); setScopeId(null) }}
                className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium motion-safe:transition-colors ${focusRing} ${scopeType === opt.type ? 'border-blue-600 bg-gray-100 text-gray-900 dark:border-blue-400 dark:bg-gray-800 dark:text-gray-100' : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'}`}
              >
                {scopeType === opt.type ? <Check className="size-5" strokeWidth={2.5} aria-hidden /> : null}
                {opt.label}
              </button>
            ))}
          </div>
          {recordTypes.length === 0 ? <p className="text-xs text-gray-600 dark:text-gray-400">{role?.permissions.some((k) => k.startsWith('core:')) ? 'This role carries core permissions, which apply to the whole tenant.' : 'This role carries no module record types, so it applies to the whole tenant.'}</p> : null}
          {scopeType !== 'tenant' && !scopeEntitled ? (
            <div className="mt-1 rounded-xl border border-dashed border-gray-300 px-3.5 py-4 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400" aria-disabled="true">
              This tenant is not entitled to {chosenType?.moduleName}. Its records cannot be picked until an operator enables the module. You can still assign the role tenant-wide.
            </div>
          ) : null}
          {scopeType !== 'tenant' && scopeEntitled ? (
            <div className="mt-1 rounded-xl border border-gray-500 dark:border-gray-500">
              <label className="flex h-10 items-center gap-2 border-b border-gray-200 px-3 text-sm dark:border-gray-800">
                <Search className="size-4 text-gray-500" strokeWidth={1.75} aria-hidden />
                <input value={scopeQ} onChange={(e) => setScopeQ(e.target.value)} placeholder={`Search ${recordTypes.find((r) => r.type === scopeType)?.label.toLowerCase() ?? 'records'}s`} className="flex-1 bg-transparent outline-none placeholder:text-gray-500" />
              </label>
              <ul className="max-h-40 overflow-y-auto p-1">
                {records.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => setScopeId(r.id)} className={`flex min-h-11 w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800 ${focusRing} ${scopeId === r.id ? 'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : ''}`}>
                      {r.label}
                      {scopeId === r.id ? <Check className="size-4" strokeWidth={2.5} aria-hidden /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        {duplicate ? (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{principalLabel} already holds {role?.name} {scopeType === 'tenant' ? 'for the whole tenant' : `for ${scopeRecords.find((r) => r.id === scopeId)?.label ?? 'this record'}`}. Nothing to add.</p>
        ) : null}
        {principal?.type === 'user' ? (
          <p className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-400"><UserRound className="mt-px size-4 shrink-0" strokeWidth={1.75} aria-hidden />Direct assignments survive group changes. Prefer a group when several people need the same access.</p>
        ) : null}
      </div>
    </Dialog>
  )
}
