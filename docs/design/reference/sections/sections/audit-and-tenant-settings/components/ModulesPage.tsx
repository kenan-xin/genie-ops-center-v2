import { useCallback, useState } from 'react'
import { ArrowUpRight, Users } from 'lucide-react'
import type { Category, CompiledModule } from '@/../product/sections/audit-and-tenant-settings/types'
import { focusRing, useDelayed } from './helpers'
import { Card, ConfirmDialog, Pill, Select, Switch, Th, Td, Toast } from './ui'

export interface ModulesPageProps {
  modules: CompiledModule[]
  categories: Category[]
  onSetModuleEnabled?: (moduleId: string, enabled: boolean) => void
  onSetModuleCategory?: (moduleId: string, categoryId: string | null) => void
  /** Design-only: open the switch-off confirm for this module on load. */
  initialConfirmModuleId?: string
}

const SAVED = 'Saved. Written to the audit log.'
const ROLES_HREF = '/admin/roles'

function RolesLink({ className = '' }: { className?: string }) {
  return (
    <a href={ROLES_HREF} className={`inline-flex min-h-11 items-center gap-0.5 text-sm font-semibold text-blue-700 hover:underline sm:min-h-0 dark:text-blue-400 ${focusRing} ${className}`}>
      Manage in Roles<ArrowUpRight className="size-3.5" strokeWidth={2} aria-hidden />
    </a>
  )
}

/** Read-only: who holds a role carrying `<id>:use`, from role_assignment. Changes happen on the Roles screen (DEC-39). */
function Access({ m }: { m: CompiledModule }) {
  const { groups, people } = m.holders
  if (groups.length + people.length === 0) {
    return (
      <div className="flex flex-col items-start gap-1">
        <span className="text-sm text-gray-600 dark:text-gray-400">No one holds {m.userRoleName} yet</span>
        <RolesLink />
      </div>
    )
  }
  const parts = [groups.length ? `${groups.length} ${groups.length === 1 ? 'group' : 'groups'}` : null, people.length ? `${people.length} ${people.length === 1 ? 'person' : 'people'}` : null].filter(Boolean)
  return (
    <div className="flex flex-col items-start gap-1.5">
      <span className="text-xs text-gray-600 dark:text-gray-400">{parts.join(', ')} via {m.userRoleName}</span>
      <div className="flex flex-wrap gap-1">
        {groups.map((g) => <Pill key={g.id} title={`${g.memberCount} members`}><Users className="size-3" strokeWidth={2} aria-hidden />{g.name} · {g.memberCount}</Pill>)}
        {people.map((p) => <Pill key={p.id}>{p.name}</Pill>)}
      </div>
      <RolesLink />
    </div>
  )
}

export function ModulesPage({ modules: initial, categories, onSetModuleEnabled, onSetModuleCategory, initialConfirmModuleId }: ModulesPageProps) {
  const [modules, setModules] = useState(initial)
  const [confirmId, setConfirmId] = useState<string | null>(initialConfirmModuleId ?? null)
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])
  const closeConfirm = useCallback(() => setConfirmId(null), [])
  const ordered = categories.slice().sort((a, b) => a.position - b.position)
  const confirming = modules.find((m) => m.id === confirmId)

  const setEnabled = (id: string, enabled: boolean) => {
    setModules((l) => l.map((m) => (m.id === id ? { ...m, enabled } : m)))
    onSetModuleEnabled?.(id, enabled)
    setToast(SAVED)
  }
  const setCategory = (id: string, categoryId: string | null) => {
    setModules((l) => l.map((m) => (m.id === id ? { ...m, categoryId } : m)))
    onSetModuleCategory?.(id, categoryId)
    setToast(SAVED)
  }
  const toggle = (m: CompiledModule, on: boolean) => (on ? setEnabled(m.id, true) : setConfirmId(m.id))
  const [switchingOff, confirmSwitchOff] = useDelayed(() => { if (confirming) setEnabled(confirming.id, false); setConfirmId(null) })

  const categoryPicker = (m: CompiledModule) => (
    <Select ariaLabel={`Category for ${m.displayName}`} value={m.categoryId ?? ''} onChange={(v) => setCategory(m.id, v || null)} className="block w-full sm:w-52">
      <option value="">No category</option>
      {ordered.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </Select>
  )
  const identity = (m: CompiledModule) => (
    <div className="min-w-0">
      <div className="flex items-center gap-2 font-semibold">{m.displayName}<span className="font-mono text-xs font-medium text-gray-500">{m.id}</span>{m.enabled ? null : <Pill>Off</Pill>}</div>
      <div className="truncate text-xs text-gray-600 dark:text-gray-400">{m.description}</div>
    </div>
  )

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-8">
      {/* Phone: one card per module. */}
      <ul className="flex flex-col gap-3 md:hidden">
        {modules.map((m) => (
          <li key={m.id}>
            <Card className="flex flex-col gap-4 p-4">
              <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
                {identity(m)}
                <Switch label={`${m.displayName} enabled`} checked={m.enabled} onChange={(v) => toggle(m, v)} />
              </label>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Category</span>
                {categoryPicker(m)}
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Access</span>
                <Access m={m} />
              </div>
            </Card>
          </li>
        ))}
      </ul>

      {/* Desktop table. */}
      <Card className="hidden overflow-hidden md:block">
        <table className="w-full table-fixed">
          <colgroup><col className="w-[30%]" /><col className="w-[90px]" /><col className="w-[200px]" /><col /></colgroup>
          <thead className="border-b border-gray-100 dark:border-gray-800">
            <tr><Th>Module</Th><Th>Enabled</Th><Th>Category</Th><Th>Access</Th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {modules.map((m) => (
              <tr key={m.id} className={m.enabled ? '' : 'text-gray-600 dark:text-gray-400'}>
                <Td>{identity(m)}</Td>
                <Td><Switch label={`${m.displayName} enabled`} checked={m.enabled} onChange={(v) => toggle(m, v)} /></Td>
                <Td>{categoryPicker(m)}</Td>
                <Td className="align-top"><Access m={m} /></Td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-gray-100 px-5 py-2.5 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-400">Every module compiled into this deployment. Switching one off hides it and refuses its routes; its data stays. Access is read from role assignments and changes on the Roles screen.</div>
      </Card>

      <ConfirmDialog
        open={Boolean(confirming)}
        title={`Switch off ${confirming?.displayName ?? ''}?`}
        description={`Members lose ${confirming?.displayName ?? 'the module'} from their navigation until it is switched on again. Its data stays.`}
        confirmLabel="Switch off"
        danger
        busy={switchingOff}
        onConfirm={confirmSwitchOff}
        onClose={closeConfirm}
      />
      <Toast message={toast} onDone={clearToast} />
    </div>
  )
}
