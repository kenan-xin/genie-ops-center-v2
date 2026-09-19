import { useCallback, useMemo, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import type { Category, CompiledModule } from '@/../product/sections/audit-and-tenant-settings/types'
import { focusRing, useDelayed } from './helpers'
import { Card, ConfirmDialog, HelpNote, Pill, SearchField, Select, Switch, Th, Td, Toast } from './ui'

export interface ModulesPageProps {
  modules: CompiledModule[]
  categories: Category[]
  onSetModuleEnabled?: (moduleId: string, enabled: boolean) => void
  onSetModuleCategory?: (moduleId: string, categoryId: string | null) => void
  /** Design-only: open the switch-off confirm for this module on load. */
  initialConfirmModuleId?: string
}

const SAVED = 'Saved. Written to the audit log.'
/** Access is granted in one place, so the link carries the module and the level (`DEC-39`). */
const accessHref = (moduleId: string) => `/admin/access?module=${moduleId}&level=use`
/** Holders named in a row. Two fit one line at the narrowest column; the rest become a +n count. */
const NAMED = 2

/**
 * Read-only: who holds a role carrying `<id>:use`, from role_assignment. One line, because the row
 * only answers whether anyone reaches the module; the names and every change live on the Access
 * screen the line links to (`DEC-39`). The role is always `<Display name> user`, so the row does not
 * repeat it; the table footer states the rule once.
 */
function Access({ m }: { m: CompiledModule }) {
  const { groups, people } = m.holders
  // Groups first: a group carries more reach than a person, and its member count states how much.
  const holders = [...groups.map((g) => `${g.name} · ${g.memberCount}`), ...people.map((p) => p.name)]
  const rest = holders.length - NAMED
  return (
    <a href={accessHref(m.id)} title={holders.join(', ') || undefined} className={`group flex min-h-11 max-w-full items-center gap-1.5 text-sm text-gray-700 hover:underline sm:min-h-0 dark:text-gray-300 ${focusRing}`}>
      <span className={`truncate ${holders.length ? '' : 'text-gray-500'}`}>{holders.slice(0, NAMED).join(', ') || 'No one yet'}</span>
      {rest > 0 ? <span className="shrink-0 text-gray-500 dark:text-gray-400">+{rest}</span> : null}
      <ArrowUpRight className="size-3.5 shrink-0 text-gray-400 group-hover:text-gray-600 dark:text-gray-600 dark:group-hover:text-gray-400" strokeWidth={2} aria-hidden />
      <span className="sr-only">— manage in Access</span>
    </a>
  )
}

/**
 * Fully controlled: the host owns `modules`, so a change made here shows on the Categories page and
 * in the solution configure sheet, which read the same record.
 */
export function ModulesPage({ modules, categories, onSetModuleEnabled, onSetModuleCategory, initialConfirmModuleId }: ModulesPageProps) {
  const [confirmId, setConfirmId] = useState<string | null>(initialConfirmModuleId ?? null)
  const [q, setQ] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])
  const closeConfirm = useCallback(() => setConfirmId(null), [])
  const ordered = categories.slice().sort((a, b) => a.position - b.position)
  const confirming = modules.find((m) => m.id === confirmId)
  // Name, id, and description, so `requests` finds Service requests and a word from the blurb finds its module.
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return modules
    return modules.filter((m) => `${m.displayName} ${m.id} ${m.description}`.toLowerCase().includes(needle))
  }, [modules, q])
  const noMatch = 'No module matches.'

  const setEnabled = (id: string, enabled: boolean) => {
    onSetModuleEnabled?.(id, enabled)
    setToast(SAVED)
  }
  const setCategory = (id: string, categoryId: string | null) => {
    onSetModuleCategory?.(id, categoryId)
    setToast(SAVED)
  }
  const toggle = (m: CompiledModule, on: boolean) => (on ? setEnabled(m.id, true) : setConfirmId(m.id))
  const [switchingOff, confirmSwitchOff] = useDelayed(() => { if (confirming) setEnabled(confirming.id, false); setConfirmId(null) })

  // A module with no static workspace entry has nothing to place in the navigation, so it shows no
  // picker (R-84). The same rule keeps it out of Assign items on the Categories page.
  const categoryPicker = (m: CompiledModule) =>
    m.staticEntries === 0 ? (
      <span className="text-xs text-gray-600 dark:text-gray-400">No workspace entry, so nothing to place</span>
    ) : (
      <Select ariaLabel={`Category for ${m.displayName}`} value={m.categoryId ?? ''} onChange={(v) => setCategory(m.id, v || null)} className="block w-full">
        <option value="">No category</option>
        {ordered.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
    )
  const identity = (m: CompiledModule) => (
    <div className="min-w-0">
      <div className="flex items-center gap-2 font-semibold">{m.displayName}<span className="font-mono text-xs font-medium text-gray-500">{m.id}</span>{m.enabled ? null : <Pill>Off</Pill>}</div>
      <div className="line-clamp-2 text-xs text-gray-600 dark:text-gray-400">{m.description}</div>
    </div>
  )

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 pb-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchField value={q} onChange={setQ} placeholder="Search modules" />
        <HelpNote label="What a module is here">
          <p>Every module compiled into this deployment is listed, on or off. You cannot add one here, because the image an operator deploys is the boundary.</p>
          <p>Switching one off hides it and refuses its routes. Its data stays, and switching it on again returns it to everyone's navigation.</p>
          <p className="text-gray-600 dark:text-gray-400">Access is read from role assignments, so nothing on this page grants it. A module with no workspace entry, such as Reporting exports, has nothing to place in a category.</p>
        </HelpNote>
      </div>

      {/* Phone: one card per module. */}
      <ul className="flex flex-col gap-3 md:hidden">
        {shown.map((m) => (
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
        {shown.length === 0 ? (
          <li className="rounded-xl border border-gray-200 px-4 py-10 text-center text-sm text-gray-600 dark:border-gray-800 dark:text-gray-400">{noMatch}</li>
        ) : null}
      </ul>

      {/* Desktop table. */}
      <Card className="hidden overflow-hidden md:block">
        {/* The table scrolls inside the card, so a narrow content area never widens the page. */}
        <div className="overflow-x-auto">
        <table className="w-full min-w-[840px] table-fixed">
          <colgroup><col className="w-[34%]" /><col className="w-[84px]" /><col className="w-[200px]" /><col /></colgroup>
          <thead className="border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-950/50">
            <tr><Th>Module</Th><Th>Enabled</Th><Th>Category</Th><Th>Access</Th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {shown.map((m) => (
              <tr key={m.id} className={m.enabled ? '' : 'text-gray-600 dark:text-gray-400'}>
                {/* Every cell tops out on the same line, so a row reads across its first line. */}
                <Td className="align-top">{identity(m)}</Td>
                <Td className="align-top"><Switch label={`${m.displayName} enabled`} checked={m.enabled} onChange={(v) => toggle(m, v)} /></Td>
                <Td className="align-top">{categoryPicker(m)}</Td>
                <Td className="align-top"><Access m={m} /></Td>
              </tr>
            ))}
            {shown.length === 0 ? (
              <tr><td colSpan={4} className="px-5 py-12 text-center text-sm text-gray-600 dark:text-gray-400">{noMatch}</td></tr>
            ) : null}
          </tbody>
        </table>
        </div>
        <div className="border-t border-gray-100 px-5 py-2.5 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-400">Every module compiled into this deployment. Switching one off hides it and refuses its routes; its data stays. Access counts who holds the module's user role, and changes on the Access screen.</div>
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
