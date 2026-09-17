import { useMemo, useState } from 'react'
import { Clock, Mail, SearchX } from 'lucide-react'
import type { Category, Favorite, Recent, Solution, SolutionStatus, Viewer } from '@/../product/sections/solutions/types'
import { btnSecondary } from './helpers'
import { SearchField, Select } from './ui'
import { SolutionCard } from './SolutionCard'

export interface SolutionsHubProps {
  viewer: Viewer
  categories: Category[]
  solutions: Solution[]
  favorites: Favorite[]
  recents: Recent[]
  /** Preview only: seeds the search field so the filter empty state can be captured. */
  initialQuery?: string
  /** Support contact from branding, shown in the no-solutions empty state when present. */
  support?: { companyName: string; href: string | null }
  onOpenSolution?: (solutionId: string) => void
  onToggleFavorite?: (solutionId: string) => void
}

/** The Solutions hub, the member landing page. Today: recents row, then category sections with card grids, Other last. Only granted, visible solutions. */
export function SolutionsHub({ viewer, categories, solutions, favorites, recents, initialQuery = '', support, onOpenSolution, onToggleFavorite }: SolutionsHubProps) {
  const [q, setQ] = useState(initialQuery)
  const [status, setStatus] = useState<'all' | SolutionStatus>('all')
  const [sort, setSort] = useState<'recent' | 'name'>('recent')

  const canAdminister = viewer.permissions.includes('solutions:admin')
  const visible = useMemo(
    () =>
      solutions.filter((s) => !s.archived && viewer.grantedSolutionIds.includes(s.id) && (s.status !== 'draft' || canAdminister)),
    [solutions, viewer, canAdminister],
  )
  const hasNonReady = visible.some((s) => s.status !== 'ready')
  const openedAt = (id: string) => recents.find((r) => r.solutionId === id)?.openedAt ?? ''
  const shown = visible
    .filter((s) => {
      const t = q.trim().toLowerCase()
      return (!t || s.name.toLowerCase().includes(t) || s.description.toLowerCase().includes(t)) && (status === 'all' || s.status === status)
    })
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : openedAt(b.id).localeCompare(openedAt(a.id)) || a.name.localeCompare(b.name)))
  const filtered = q.trim().length > 0 || status !== 'all'
  const favIds = new Set(favorites.map((f) => f.solutionId))
  const recentCards = recents
    .slice()
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
    .map((r) => shown.find((s) => s.id === r.solutionId))
    .filter((s): s is Solution => Boolean(s))
    .slice(0, 6)

  const groups = [
    ...categories
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ id: c.id, name: c.name, items: shown.filter((s) => s.categoryId === c.id) })),
    { id: 'other', name: 'Other', items: shown.filter((s) => !s.categoryId || !categories.some((c) => c.id === s.categoryId)) },
  ].filter((g) => g.items.length > 0)

  const card = (s: Solution, compact = false) => (
    <SolutionCard key={s.id} solution={s} compact={compact} isFavorite={favIds.has(s.id)} showDraftBadge={canAdminister} onOpen={() => onOpenSolution?.(s.id)} onToggleFavorite={() => onToggleFavorite?.(s.id)} />
  )

  if (visible.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center rounded-2xl border border-dashed border-gray-200 p-8 dark:border-gray-800">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <span aria-hidden className="flex size-14 items-center justify-center rounded-2xl border border-gray-200 bg-white text-2xl font-extrabold text-blue-700 dark:border-gray-700 dark:bg-gray-900 dark:text-blue-300">
            {(support?.companyName ?? 'G').slice(0, 1).toUpperCase()}
          </span>
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-bold tracking-tight">No solutions yet</h2>
            <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">Ask your administrator to grant you access to a solution.</p>
          </div>
          {support?.href ? (
            <a href={support.href} className={btnSecondary}>
              <Mail className="size-5 text-gray-500" strokeWidth={1.75} aria-hidden />
              Contact {support.companyName} support
            </a>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchField value={q} onChange={setQ} placeholder="Search solutions" />
        <Select ariaLabel="Sort" value={sort} onChange={(v) => setSort(v as typeof sort)}>
          <option value="recent">Recently opened</option>
          <option value="name">Name</option>
        </Select>
        {hasNonReady ? (
          <Select ariaLabel="Filter by status" value={status} onChange={(v) => setStatus(v as typeof status)}>
            <option value="all">All statuses</option>
            <option value="ready">Ready</option>
            <option value="maintenance">Maintenance</option>
            <option value="down">Down</option>
            {canAdminister ? <option value="draft">Draft</option> : null}
          </Select>
        ) : null}
        <span className="text-xs text-gray-600 sm:ml-auto dark:text-gray-400">{shown.length} of {visible.length} solutions</span>
      </div>

      {recentCards.length > 0 && !q ? (
        <section aria-labelledby="recents-h">
          <h2 id="recents-h" className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300">
            <Clock className="size-4 text-gray-500" strokeWidth={1.75} aria-hidden />Recent
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{recentCards.map((s) => card(s, true))}</div>
        </section>
      ) : null}

      {groups.map((g) => (
        <section key={g.id} aria-labelledby={`cat-${g.id}`}>
          <div className="mb-2.5 flex items-baseline gap-2">
            <h2 id={`cat-${g.id}`} className="text-base font-bold tracking-tight">{g.name}</h2>
            <span className="text-xs text-gray-500">{g.items.length}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{g.items.map((s) => card(s))}</div>
        </section>
      ))}

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 px-6 py-14 text-center dark:border-gray-800">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"><SearchX className="size-6" strokeWidth={1.75} aria-hidden /></span>
          <h3 className="text-base font-semibold">No solutions match</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Try another word or clear the filters.</p>
          {filtered ? <button type="button" className={btnSecondary} onClick={() => { setQ(''); setStatus('all') }}>Clear filters</button> : null}
        </div>
      ) : null}
    </div>
  )
}
