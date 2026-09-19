import { useId, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { btnPrimary, btnSecondary, focusRing } from './helpers'

export interface TransferItem {
  id: string
  label: string
  description?: string
  /** Leading visual, for example an avatar or a group icon. */
  icon?: React.ReactNode
  /** Why this item cannot move, or null. The row stays readable and its checkbox is disabled. */
  disabledReason?: string | null
}

export interface TransferListProps {
  items: TransferItem[]
  /** The ids in the chosen group. Controlled by the caller. */
  value: string[]
  onChange: (ids: string[]) => void
  /** Heading of the chosen group. */
  targetLabel?: string
  /** Heading of the group that holds everything else. */
  availableLabel?: string
  /** Action drawn at the right of the chosen heading, for example Remove all. */
  targetAction?: React.ReactNode
  /** One fact the rows cannot show, for example who cannot be added. Sits in the footer. */
  note?: string
  emptyTarget?: string
  emptyAvailable?: string
  searchLabel?: string
}

const matches = (item: TransferItem, q: string) =>
  !q || item.label.toLowerCase().includes(q) || (item.description?.toLowerCase().includes(q) ?? false)

/**
 * One roster, two groups: what is chosen sits at the top, everything else below it. Tick rows in
 * either group and the footer offers the move that fits the ticks, "Add 3", "Remove 1", or both.
 * The list fills the height of its container and scrolls alone, so it reads the same in a phone
 * sheet and in a slide-over. The parent must be a flex column with a known height.
 *
 * This is the narrow-container form of the v1 admin portal transfer list. Two panes side by side
 * need about 900 px to keep an email address readable, which a slide-over does not have.
 */
export function TransferList({
  items,
  value,
  onChange,
  targetLabel = 'Chosen',
  availableLabel = 'Everyone else',
  targetAction,
  note,
  emptyTarget = 'Nothing chosen yet.',
  emptyAvailable = 'Nothing left to add.',
  searchLabel = 'Search the list',
}: TransferListProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const listId = useId()
  const valueSet = useMemo(() => new Set(value), [value])

  const q = query.trim().toLowerCase()
  const shown = items.filter((i) => matches(i, q))
  const chosen = shown.filter((i) => valueSet.has(i.id))
  const rest = shown.filter((i) => !valueSet.has(i.id))
  const movable = shown.filter((i) => !i.disabledReason)
  const allOn = movable.length > 0 && movable.every((i) => selected.has(i.id))

  // A controlled value can change under a stale tick, so every move is read from the value itself.
  const toAdd = [...selected].filter((id) => !valueSet.has(id))
  const toRemove = [...selected].filter((id) => valueSet.has(id))

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const toggleAll = () => {
    const next = new Set(selected)
    movable.forEach((i) => (allOn ? next.delete(i.id) : next.add(i.id)))
    setSelected(next)
  }

  const add = () => {
    setSelected(new Set())
    if (toAdd.length > 0) onChange([...value, ...toAdd])
  }

  const remove = () => {
    const drop = new Set(toRemove)
    setSelected(new Set())
    if (drop.size > 0) onChange(value.filter((id) => !drop.has(id)))
  }

  const heading = (label: string, count: number, action?: React.ReactNode) => (
    <li className="sticky top-0 z-10 flex min-h-8 items-center justify-between gap-3 border-b border-gray-100 bg-gray-50 px-5 py-1 dark:border-gray-800 dark:bg-gray-950">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">{label} · {count}</span>
      {action}
    </li>
  )

  const row = (item: TransferItem) => {
    const on = selected.has(item.id)
    const blocked = Boolean(item.disabledReason)
    return (
      <li key={item.id}>
        <label
          title={item.disabledReason ?? undefined}
          className={`flex min-h-11 items-center gap-3 px-5 py-2 text-sm motion-safe:transition-colors ${blocked ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'} ${on ? 'bg-blue-50 dark:bg-blue-950/40' : blocked ? '' : 'hover:bg-gray-50 dark:hover:bg-gray-950'}`}
        >
          <input
            type="checkbox"
            checked={on}
            disabled={blocked}
            onChange={() => toggle(item.id)}
            className={`size-4 shrink-0 accent-blue-600 ${focusRing}`}
          />
          {item.icon ?? null}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{item.label}</span>
            {item.description ? <span className="block truncate text-xs text-gray-600 dark:text-gray-400">{item.description}</span> : null}
          </span>
        </label>
      </li>
    )
  }

  const empty = (text: string) => <li className="px-5 py-4 text-sm text-gray-600 dark:text-gray-400">{text}</li>

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-5 pb-2 pt-4">
        <label className="flex h-10 items-center gap-2 rounded-lg border border-gray-500 bg-white px-3 text-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 dark:border-gray-500 dark:bg-gray-950 dark:focus-within:ring-blue-400 dark:focus-within:ring-offset-gray-950">
          <Search className="size-4 shrink-0 text-gray-500" strokeWidth={1.75} aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={searchLabel}
            aria-controls={listId}
            placeholder={searchLabel}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-gray-500"
          />
        </label>
        <div className="flex min-h-11 items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={allOn} disabled={movable.length === 0} onChange={toggleAll} className={`size-4 accent-blue-600 ${focusRing}`} />
            Select all shown
          </label>
          {selected.size > 0 ? (
            <button type="button" onClick={() => setSelected(new Set())} className={`rounded text-xs font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 ${focusRing}`}>
              Clear {selected.size}
            </button>
          ) : null}
        </div>
      </div>

      <ul id={listId} className="min-h-0 flex-1 overflow-y-auto border-t border-gray-200 dark:border-gray-800">
        {heading(targetLabel, chosen.length, targetAction)}
        {chosen.length > 0 ? chosen.map(row) : empty(q ? 'No match here.' : emptyTarget)}
        {heading(availableLabel, rest.length)}
        {rest.length > 0 ? rest.map(row) : empty(q ? 'No match here.' : emptyAvailable)}
      </ul>

      {selected.size > 0 ? (
        <div className="flex items-center gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-800">
          {toAdd.length > 0 ? <button type="button" className={btnPrimary} onClick={add}>Add {toAdd.length}</button> : null}
          {toRemove.length > 0 ? <button type="button" className={`${btnSecondary} text-red-700 dark:text-red-300`} onClick={remove}>Remove {toRemove.length}</button> : null}
        </div>
      ) : note ? (
        <p className="border-t border-gray-200 px-5 py-3 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-400">{note}</p>
      ) : null}
    </div>
  )
}
