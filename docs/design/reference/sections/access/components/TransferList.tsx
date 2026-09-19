import { useId, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { btnPrimary, btnSecondary, focusRing } from './helpers'
import { Pill } from './ui'

export interface TransferItem {
  id: string
  label: string
  description?: string
  /** Short type label drawn at the right of the row, for example Solution or Module. */
  badge?: string
  /**
   * Access the row already has from somewhere else, for example a group. A row on the catalog side
   * carrying this note is reachable today, so the side it sits on never means "no access".
   */
  note?: string
  /** Reason the row gives nothing right now, for example a module that is switched off. */
  inactiveReason?: string
  /**
   * Reason the row cannot be added now. The row stays readable and stays removable, so a grant kept
   * from before can always be taken away.
   */
  blockedReason?: string
}

export interface TransferListProps {
  items: TransferItem[]
  /** Ids on the granted side. Controlled by the caller. */
  value: string[]
  onChange: (ids: string[]) => void
  /** Ids whose change is not saved yet. The row carries a Pending pill. */
  pendingIds?: string[]
  availableLabel?: string
  targetLabel?: string
  emptyAvailable?: string
  emptyTarget?: string
  /** Reads as the whole list with no controls, for example while every record is granted at once. */
  disabled?: boolean
}

const matches = (item: TransferItem, q: string) =>
  !q || item.label.toLowerCase().includes(q) || (item.description?.toLowerCase().includes(q) ?? false)

function Side({ heading, items, pending, selected, onSelected, actionLabel, actionClass, onAction, quickLabel, onQuick, empty, disabled, blockAdds }: {
  heading: string
  items: TransferItem[]
  pending: Set<string>
  selected: Set<string>
  onSelected: (next: Set<string>) => void
  actionLabel: (n: number) => string
  actionClass: string
  onAction: () => void
  quickLabel: string
  onQuick: (shownIds: string[]) => void
  empty: string
  disabled?: boolean
  /** The side that adds. A row with a blocked reason cannot be ticked, selected in bulk, or added. */
  blockAdds?: boolean
}) {
  const [query, setQuery] = useState('')
  const headingId = useId()
  const q = query.trim().toLowerCase()
  const shown = items.filter((i) => matches(i, q))
  const blocked = (i: TransferItem) => Boolean(blockAdds && i.blockedReason)
  // Select all and the quick action only ever reach the rows this side may move.
  const movable = shown.filter((i) => !blocked(i))
  const allOn = movable.length > 0 && movable.every((i) => selected.has(i.id))

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelected(next)
  }

  const toggleAll = () => {
    const next = new Set(selected)
    movable.forEach((i) => (allOn ? next.delete(i.id) : next.add(i.id)))
    onSelected(next)
  }

  return (
    <section aria-labelledby={headingId} className={`flex min-h-0 min-w-0 flex-col rounded-lg border border-gray-200 dark:border-gray-800 ${disabled ? 'opacity-55' : ''}`}>
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-gray-100 px-3 dark:border-gray-800">
        <h4 id={headingId} className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">{heading} · {items.length}</h4>
        {!disabled && movable.length > 0 ? (
          <button type="button" onClick={() => onQuick(movable.map((i) => i.id))} className={`rounded text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`}>{quickLabel}</button>
        ) : null}
      </div>
      <div className="flex items-center gap-2 border-b border-gray-100 px-2 py-2 dark:border-gray-800">
        <label className="flex min-h-11 items-center px-1">
          <input type="checkbox" aria-label={`Select all shown in ${heading}`} checked={allOn} disabled={disabled || movable.length === 0} onChange={toggleAll} className={`size-4 accent-blue-600 ${focusRing}`} />
        </label>
        <label className="flex h-10 min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-500 bg-white px-3 text-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 dark:border-gray-500 dark:bg-gray-950 dark:focus-within:ring-blue-400 dark:focus-within:ring-offset-gray-950">
          <Search className="size-4 shrink-0 text-gray-500" strokeWidth={1.75} aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} disabled={disabled} aria-label={`Search ${heading}`} placeholder="Search" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-gray-500" />
        </label>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {shown.map((item) => {
          const on = selected.has(item.id)
          const stop = blocked(item)
          return (
            <li key={item.id}>
              <label title={stop ? item.blockedReason : undefined} className={`flex min-h-11 items-center gap-3 px-3 py-2 text-sm motion-safe:transition-colors ${disabled || stop ? 'cursor-not-allowed' : 'cursor-pointer'} ${stop ? 'opacity-60' : ''} ${on ? 'bg-blue-50 dark:bg-blue-950/40' : stop ? '' : 'hover:bg-gray-50 dark:hover:bg-gray-950'}`}>
                <input type="checkbox" checked={on} disabled={disabled || stop} onChange={() => toggle(item.id)} className={`size-4 shrink-0 accent-blue-600 ${focusRing}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.label}</span>
                  {item.description ? <span className="block truncate text-xs text-gray-600 dark:text-gray-400">{item.description}</span> : null}
                  {item.note ? <span title={item.note} className="block truncate text-xs font-medium text-gray-700 dark:text-gray-300">{item.note}</span> : null}
                </span>
                {item.inactiveReason ? <Pill tone="amber" title={item.inactiveReason}>Inactive</Pill> : null}
                {item.badge ? <Pill>{item.badge}</Pill> : null}
                {pending.has(item.id) ? <Pill>Pending</Pill> : null}
              </label>
            </li>
          )
        })}
        {shown.length === 0 ? <li className="px-3 py-6 text-center text-sm text-gray-600 dark:text-gray-400">{q ? 'No match.' : empty}</li> : null}
      </ul>
      {!disabled && selected.size > 0 ? (
        <div className="border-t border-gray-100 p-2 dark:border-gray-800">
          <button type="button" className={`${actionClass} w-full justify-center`} onClick={onAction}>{actionLabel(selected.size)}</button>
        </div>
      ) : null}
    </section>
  )
}

/**
 * The v1 admin portal pattern: a catalogue on the left, what is granted on the right, each side
 * searchable with a count, a select-all box, a quick action for everything shown, and one button
 * that moves the ticked rows. Use it where the container is at least about 900 px wide; a narrow
 * sheet uses the one-roster form instead (design-system/tokens.md, "Transfer list").
 */
export function TransferList({
  items,
  value,
  onChange,
  pendingIds = [],
  availableLabel = 'Catalog',
  targetLabel = 'Granted',
  emptyAvailable = 'Nothing left to add.',
  emptyTarget = 'Nothing granted yet.',
  disabled,
}: TransferListProps) {
  const [availableSelected, setAvailableSelected] = useState<Set<string>>(new Set())
  const [targetSelected, setTargetSelected] = useState<Set<string>>(new Set())
  const valueSet = useMemo(() => new Set(value), [value])
  const pending = useMemo(() => new Set(pendingIds), [pendingIds])
  const available = items.filter((i) => !valueSet.has(i.id))
  const target = items.filter((i) => valueSet.has(i.id))

  // Every move is pruned against the controlled value, so a stale tick cannot add a duplicate.
  const add = (ids: string[]) => {
    const fresh = ids.filter((id) => !valueSet.has(id))
    setAvailableSelected(new Set())
    if (fresh.length > 0) onChange([...value, ...fresh])
  }

  const remove = (ids: string[]) => {
    const drop = new Set(ids.filter((id) => valueSet.has(id)))
    setTargetSelected(new Set())
    if (drop.size > 0) onChange(value.filter((id) => !drop.has(id)))
  }

  return (
    <div className="grid min-h-0 grid-cols-1 gap-3 md:h-[22rem] md:grid-cols-2">
      <Side
        heading={availableLabel}
        items={available}
        pending={pending}
        selected={availableSelected}
        onSelected={setAvailableSelected}
        actionLabel={(n) => `Add ${n}`}
        actionClass={btnPrimary}
        onAction={() => add([...availableSelected])}
        quickLabel="Add all shown"
        onQuick={add}
        empty={emptyAvailable}
        disabled={disabled}
        blockAdds
      />
      <Side
        heading={targetLabel}
        items={target}
        pending={pending}
        selected={targetSelected}
        onSelected={setTargetSelected}
        actionLabel={(n) => `Remove ${n}`}
        actionClass={`${btnSecondary} text-red-700 dark:text-red-300`}
        onAction={() => remove([...targetSelected])}
        quickLabel="Remove all shown"
        onQuick={remove}
        empty={emptyTarget}
        disabled={disabled}
      />
    </div>
  )
}
