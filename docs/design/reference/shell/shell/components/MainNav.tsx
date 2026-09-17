import { useState } from 'react'
import { ChevronDown, GripVertical, type LucideIcon } from 'lucide-react'
import { focusRing } from './helpers'

export interface NavigationItem {
  label: string
  href: string
  isActive?: boolean
  icon?: LucideIcon
  /** Optional group heading. Items with the same section render under one label. */
  section?: string
  /** Unread or pending count, shown as a small blue pill on the right. */
  badge?: number
}

/** One entry of a module's navigation tree (DEC-51). `categoryId` is the id of a core `category` row, or null. */
export interface NavEntry {
  label: string
  href: string
  categoryId?: string | null
  moduleId: string
  kind: 'solution' | 'module'
  /** Shown for module entries only. */
  icon?: LucideIcon
  isActive?: boolean
}

/** The tree core renders: pinned rail (at most six, ordered) and every entry the person may reach. */
export interface NavTree {
  pinned: NavEntry[]
  entries: NavEntry[]
}

/** A core `category` row. Entries are grouped under these in position order. */
export interface NavCategory {
  id: string
  name: string
  position: number
}

interface MainNavProps {
  items: NavigationItem[]
  tree?: NavTree
  categories?: NavCategory[]
  onNavigate?: (href: string) => void
}

export function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-1.5 pt-5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
      {children}
    </div>
  )
}

// Rows are 44px tall under lg (touch targets), 40px nav and 32px tree rows on desktop.
const rowBase = `flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-sm motion-safe:transition-colors lg:min-h-0 ${focusRing}`
const navRow = 'lg:h-10'
const treeRow = 'lg:h-8'
const rowIdle =
  'text-gray-700 hover:bg-gray-200/60 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
const rowActive = 'bg-white font-semibold text-blue-700 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:text-blue-400 dark:ring-gray-700'

function go(onNavigate: ((href: string) => void) | undefined, href: string) {
  return (e: React.MouseEvent) => {
    if (!onNavigate) return
    e.preventDefault()
    onNavigate(href)
  }
}

function NavLink({ item, onNavigate }: { item: NavigationItem; onNavigate?: (href: string) => void }) {
  const Icon = item.icon
  return (
    <a
      href={item.href}
      aria-current={item.isActive ? 'page' : undefined}
      onClick={go(onNavigate, item.href)}
      className={`${rowBase} ${navRow} ${item.isActive ? rowActive : rowIdle}`}
    >
      {Icon ? (
        <Icon
          className={`size-5 shrink-0 ${item.isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500'}`}
          strokeWidth={1.75}
          aria-hidden
        />
      ) : null}
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge ? (
        <span
          aria-label={`${item.badge} unread`}
          className="rounded-full bg-blue-600 px-1.5 py-px text-xs font-semibold text-white"
        >
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      ) : null}
    </a>
  )
}

function EntryLink({
  item,
  indent,
  onNavigate,
}: {
  item: NavEntry
  indent?: boolean
  onNavigate?: (href: string) => void
}) {
  const Icon = item.kind === 'module' ? item.icon : undefined
  return (
    <a
      href={item.href}
      aria-current={item.isActive ? 'page' : undefined}
      onClick={go(onNavigate, item.href)}
      className={`${rowBase} ${treeRow} ${item.isActive ? rowActive : rowIdle} ${indent ? 'ml-6' : ''}`}
    >
      {Icon ? (
        <Icon
          className={`size-4 shrink-0 ${item.isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500'}`}
          strokeWidth={1.75}
          aria-hidden
        />
      ) : null}
      <span className="truncate">{item.label}</span>
    </a>
  )
}

/** Collapsed state persists per device in local storage, not per account. */
const COLLAPSE_KEY = 'genie.sidebar.collapsed'
function readCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

function Category({ category, items, onNavigate }: { category: NavCategory; items: NavEntry[]; onNavigate?: (href: string) => void }) {
  const [open, setOpenState] = useState(() => !readCollapsed()[category.id])
  const setOpen = (fn: (v: boolean) => boolean) => {
    setOpenState((v) => {
      const next = fn(v)
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify({ ...readCollapsed(), [category.id]: !next }))
      } catch {
        /* private mode: keep the in-memory state only */
      }
      return next
    })
  }
  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`${rowBase} ${rowIdle} ${treeRow} w-full text-left font-medium`}
      >
        <ChevronDown
          aria-hidden
          strokeWidth={1.75}
          className={`size-4 text-gray-500 motion-safe:transition-transform ${open ? '' : '-rotate-90'}`}
        />
        <span className="flex-1 truncate">{category.name}</span>
        <span className="rounded-full bg-gray-200/70 px-1.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          {items.length}
        </span>
      </button>
      {open ? items.map((s) => <EntryLink key={s.href} item={s} indent onNavigate={onNavigate} />) : null}
    </div>
  )
}

const byLabel = (a: NavEntry, b: NavEntry) => a.label.localeCompare(b.label)

export function MainNav({ items, tree, categories = [], onNavigate }: MainNavProps) {
  const pinned = tree?.pinned.slice(0, 6) ?? []
  const entries = tree?.entries ?? []
  // One tree: a group per core category in position order that holds at least one entry, then the rest under Other.
  // An entry whose categoryId points to no category is treated as having none (DEC-51).
  const groups = [...categories]
    .sort((a, b) => a.position - b.position)
    .map((c) => ({ category: c, items: entries.filter((e) => e.categoryId === c.id).sort(byLabel) }))
    .filter((g) => g.items.length > 0)
  const knownIds = new Set(categories.map((c) => c.id))
  const other = entries.filter((e) => !e.categoryId || !knownIds.has(e.categoryId)).sort(byLabel)

  const sections: Array<{ label?: string; items: NavigationItem[] }> = []
  for (const item of items) {
    const last = sections[sections.length - 1]
    if (last && last.label === item.section) last.items.push(item)
    else sections.push({ label: item.section, items: [item] })
  }

  return (
    <div className="flex flex-col">
      {sections.map((s, idx) => (
        <nav key={s.label ?? idx} aria-label={s.label ?? 'Primary'} className="flex flex-col gap-0.5">
          {s.label ? <GroupLabel>{s.label}</GroupLabel> : null}
          {s.items.map((item) => (
            <NavLink key={item.href} item={item} onNavigate={onNavigate} />
          ))}
        </nav>
      ))}

      {pinned.length > 0 ? (
        <nav aria-label="Pinned" className="flex flex-col gap-0.5">
          <GroupLabel>Pinned</GroupLabel>
          {pinned.map((f) => (
            <a
              key={f.href}
              href={f.href}
              draggable
              aria-current={f.isActive ? 'page' : undefined}
              onClick={go(onNavigate, f.href)}
              className={`${rowBase} ${treeRow} group ${f.isActive ? rowActive : rowIdle}`}
            >
              <GripVertical
                aria-hidden
                strokeWidth={1.75}
                className="size-4 shrink-0 cursor-grab text-gray-400 group-hover:text-gray-500 dark:text-gray-500"
              />
              <span className="truncate">{f.label}</span>
            </a>
          ))}
        </nav>
      ) : null}

      {groups.length > 0 ? (
        <nav aria-label="Categories" className="flex flex-col gap-0.5">
          <GroupLabel>Categories</GroupLabel>
          {groups.map((g) => (
            <Category key={g.category.id} category={g.category} items={g.items} onNavigate={onNavigate} />
          ))}
        </nav>
      ) : null}

      {other.length > 0 ? (
        <nav aria-label="Other" className="flex flex-col gap-0.5">
          <GroupLabel>Other</GroupLabel>
          {other.map((s) => (
            <EntryLink key={s.href} item={s} onNavigate={onNavigate} />
          ))}
        </nav>
      ) : null}
    </div>
  )
}
