import { useState } from 'react'
import { AlertTriangle, Check, Loader2, Lock } from 'lucide-react'
import type { AssignableItem, Category, CompiledModule } from '@/../product/sections/audit-and-tenant-settings/types'
import { focusRing } from './helpers'
import { Card, Pill, SearchField, Select, Td, Th } from './ui'

export interface AssignItemsProps {
  categories: Category[]
  /** Modules with a static workspace entry, and the records each enabled module contributes. */
  items: AssignableItem[]
  /** Every compiled module, used to name the ones that are switched off and therefore contribute nothing. */
  modules: CompiledModule[]
  /** The viewer's permission keys. A row whose `writeKey` is missing is read-only and says so. */
  permissions: string[]
  /** Resolves on success and rejects on failure. A rejected write leaves the row unchanged and shows Retry. */
  onSetItemCategory?: (itemId: string, categoryId: string | null) => void | Promise<void>
}

type RowState = { status: 'saving' | 'saved' | 'error'; attempted: string | null; message?: string }

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/**
 * The v1 "Assign solutions" table, widened to every item the navigation can group: one row per
 * module with a static workspace entry, one row per record a module contributes. One category per
 * item, or none. No wizard, no bulk step.
 *
 * A module row writes `tenant_module.category_id`, which is core's own column. A record row is the
 * module's data, so the module contributes it and performs the write; core reads no module table
 * (`DEC-51`). That interface is an amendment, not an existing contract.
 */
export function AssignItems(p: AssignItemsProps) {
  const [q, setQ] = useState('')
  const [type, setType] = useState<'all' | 'module' | 'record'>('all')
  const [onlyLoose, setOnlyLoose] = useState(false)
  const [rows, setRows] = useState<Record<string, RowState>>({})

  const ordered = p.categories.slice().sort((a, b) => a.position - b.position)
  const known = new Set(ordered.map((c) => c.id))
  // A category id that no longer exists reads as no category, everywhere (R-91).
  const categoryOf = (it: AssignableItem) => (it.categoryId && known.has(it.categoryId) ? it.categoryId : null)
  const loose = p.items.filter((i) => categoryOf(i) === null).length
  const offModules = p.modules.filter((m) => !m.enabled && m.staticEntries > 0)

  const s = q.trim().toLowerCase()
  const shown = p.items.filter((i) => {
    if (type !== 'all' && i.kind !== type) return false
    if (onlyLoose && categoryOf(i) !== null) return false
    return !s || i.label.toLowerCase().includes(s) || i.detail.toLowerCase().includes(s) || i.typeLabel.toLowerCase().includes(s)
  })

  const commit = async (item: AssignableItem, categoryId: string | null) => {
    setRows((r) => ({ ...r, [item.id]: { status: 'saving', attempted: categoryId } }))
    try {
      await p.onSetItemCategory?.(item.id, categoryId)
      setRows((r) => ({ ...r, [item.id]: { status: 'saved', attempted: categoryId } }))
      window.setTimeout(() => setRows((r) => {
        const next = { ...r }
        if (next[item.id]?.status === 'saved') delete next[item.id]
        return next
      }), 2500)
    } catch (e) {
      // The row keeps the value the server still holds, so a failure can never read as a save.
      setRows((r) => ({ ...r, [item.id]: { status: 'error', attempted: categoryId, message: e instanceof Error ? e.message : 'The server refused the change.' } }))
    }
  }

  /** Moving a module entry moves that entry alone. Its records carry their own category. */
  const entryNote = (item: AssignableItem) => {
    if (item.kind !== 'module') return null
    const owned = p.items.filter((x) => x.kind === 'record' && x.ownerModuleId === item.ownerModuleId)
    if (owned.length === 0) return null
    return `Moves this entry only. Its ${n(owned.length, owned[0].typeLabel.toLowerCase(), `${owned[0].typeLabel.toLowerCase()}s`)} keep the category each one carries.`
  }

  const picker = (item: AssignableItem) => {
    const state = rows[item.id]
    const may = p.permissions.includes(item.writeKey)
    const current = categoryOf(item)
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <Select
            ariaLabel={`Category for ${item.label}`}
            value={current ?? ''}
            disabled={!may || state?.status === 'saving'}
            onChange={(v) => commit(item, v || null)}
            className="block min-w-0 flex-1"
          >
            <option value="">No category</option>
            {ordered.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          {state?.status === 'saving' ? <Loader2 className="size-4 shrink-0 text-gray-500 motion-safe:animate-spin" strokeWidth={2} aria-hidden /> : null}
          {state?.status === 'saved' ? <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} aria-hidden /> : null}
        </div>
        {state?.status === 'saving' ? <span role="status" className="text-xs text-gray-600 dark:text-gray-400">Saving…</span> : null}
        {state?.status === 'saved' ? <span role="status" className="text-xs text-emerald-700 dark:text-emerald-400">Saved. Written to the audit log.</span> : null}
        {state?.status === 'error' ? (
          <span role="alert" className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-red-700 dark:text-red-300">
            <AlertTriangle className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
            Not saved. {state.message} The row still reads {current ? ordered.find((c) => c.id === current)?.name : 'No category'}.
            <button type="button" onClick={() => commit(item, state.attempted)} className={`rounded font-semibold underline ${focusRing}`}>Retry</button>
          </span>
        ) : null}
        {!may ? (
          <span className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
            <Lock className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />You need {item.writeKey} to change this.
          </span>
        ) : null}
      </div>
    )
  }

  const identity = (item: AssignableItem) => (
    <div className="min-w-0">
      <div className="truncate font-semibold">{item.label}</div>
      <div className="truncate text-xs text-gray-600 dark:text-gray-400">{item.detail}</div>
      {entryNote(item) ? <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">{entryNote(item)}</div> : null}
    </div>
  )

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold tracking-tight">Assign items</h3>
          <Pill tone={loose > 0 ? 'amber' : 'gray'}>{loose} uncategorized</Pill>
        </div>
        <p className="max-w-prose text-xs text-gray-600 dark:text-gray-400">
          Pick the category each item sits under. An item without one stands alone under Other. One category per item, and filing an item never changes who can open it.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchField value={q} onChange={setQ} placeholder="Search items" />
          <Select ariaLabel="Type" value={type} onChange={(v) => setType(v as typeof type)} className="w-full sm:w-44">
            <option value="all">All types</option>
            <option value="module">Modules only</option>
            <option value="record">Solutions only</option>
          </Select>
          <label className="flex min-h-11 items-center gap-2 text-sm sm:min-h-0">
            <input type="checkbox" checked={onlyLoose} onChange={(e) => setOnlyLoose(e.target.checked)} className={`size-4 accent-blue-600 ${focusRing}`} />
            Uncategorized only
          </label>
        </div>
      </div>

      {/* Phone: one card per item. */}
      <ul className="flex flex-col gap-3 border-t border-gray-100 p-3 md:hidden dark:border-gray-800">
        {shown.map((item) => (
          <li key={item.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
            <div className="flex items-start justify-between gap-2">
              {identity(item)}
              <Pill>{item.typeLabel}</Pill>
            </div>
            <div className="mt-3">{picker(item)}</div>
          </li>
        ))}
        {shown.length === 0 ? <li className="px-2 py-8 text-center text-sm text-gray-600 dark:text-gray-400">{p.items.length === 0 ? 'Nothing to file yet. A module with a workspace entry, and every solution, appears here.' : 'No item matches.'}</li> : null}
      </ul>

      {/* Desktop table. */}
      <div className="hidden border-t border-gray-100 md:block dark:border-gray-800">
        <table className="w-full table-fixed">
          <colgroup><col /><col className="w-[110px]" /><col className="w-[300px]" /></colgroup>
          <thead className="bg-gray-50 dark:bg-gray-950/50"><tr><Th>Item</Th><Th>Type</Th><Th>Category</Th></tr></thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {shown.map((item) => (
              <tr key={item.id}>
                <Td>{identity(item)}</Td>
                <Td><Pill>{item.typeLabel}</Pill></Td>
                <Td>{picker(item)}</Td>
              </tr>
            ))}
            {shown.length === 0 ? (
              <tr><td colSpan={3} className="px-5 py-10 text-center text-sm text-gray-600 dark:text-gray-400">{p.items.length === 0 ? 'Nothing to file yet. A module with a workspace entry, and every solution, appears here.' : 'No item matches.'}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-1 border-t border-gray-100 px-5 py-2.5 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-400">
        <span>A module with no workspace entry is not listed, because it has nothing to place in the navigation.</span>
        {offModules.length > 0 ? (
          <span>{offModules.map((m) => m.displayName).join(', ')} {offModules.length === 1 ? 'is' : 'are'} switched off. The module entry can still be filed, and the records of a switched-off module are not listed until it is switched on again. Their stored category is kept.</span>
        ) : null}
      </div>
    </Card>
  )
}
