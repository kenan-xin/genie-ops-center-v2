import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, GripVertical, Star, X } from 'lucide-react'
import type { Category, Favorite, Solution, Viewer } from '@/../product/sections/solutions/types'
import { btnGhost, btnSecondary, focusRing } from './helpers'
import { Card, Monogram, Pill, StatusPill } from './ui'

export interface FavoritesPageProps {
  viewer: Viewer
  favorites: Favorite[]
  solutions: Solution[]
  categories: Category[]
  onOpenSolution?: (solutionId: string) => void
  onToggleFavorite?: (solutionId: string) => void
  onReorderFavorites?: (orderedSolutionIds: string[]) => void
}

const PINNED_LIMIT = 6

/** Favorites page: the member's starred solutions in sidebar order, with reorder and unstar. */
export function FavoritesPage({ viewer, favorites, solutions, categories, onOpenSolution, onToggleFavorite, onReorderFavorites }: FavoritesPageProps) {
  const canAdminister = viewer.permissions.includes('solutions:admin')
  const rows = favorites
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((f) => solutions.find((s) => s.id === f.solutionId))
    .filter((s): s is Solution => Boolean(s) && !s!.archived && viewer.grantedSolutionIds.includes(s!.id) && (s!.status !== 'draft' || canAdminister))
  const ids = rows.map((s) => s.id)

  const [undo, setUndo] = useState<Solution | null>(null)
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 4000); return () => clearTimeout(t) }, [undo])

  const move = (from: number, to: number) => {
    if (to < 0 || to >= ids.length) return
    const next = ids.slice()
    next.splice(to, 0, next.splice(from, 1)[0])
    onReorderFavorites?.(next)
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-200 px-6 py-14 text-center dark:border-gray-800">
        <span className="flex size-12 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"><Star className="size-6" strokeWidth={1.75} aria-hidden /></span>
        <h2 className="text-base font-semibold">No favorites yet</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">Star a solution on the Solutions hub to pin it here.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <p className="text-sm text-gray-600 dark:text-gray-400">The first {PINNED_LIMIT} appear in the sidebar Pinned rail. Drag, or use the arrows, to change the order.</p>
      <Card className="overflow-hidden">
        <ol className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((s, i) => {
            const cat = categories.find((c) => c.id === s.categoryId)?.name ?? 'Other'
            return (
              <li key={s.id} className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${i >= PINNED_LIMIT ? 'bg-gray-50/60 dark:bg-gray-950/40' : ''}`}>
                <div className="flex items-center gap-2">
                  <span aria-hidden className="hidden cursor-grab text-gray-400 sm:block dark:text-gray-600"><GripVertical className="size-5" strokeWidth={1.75} /></span>
                  <span className="w-6 text-center font-mono text-sm font-semibold text-gray-500">{i + 1}</span>
                  <div className="flex flex-col">
                    <button type="button" aria-label={`Move ${s.name} up`} disabled={i === 0} onClick={() => move(i, i - 1)} className={`flex size-6 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800 ${focusRing}`}><ChevronUp className="size-4" strokeWidth={2} /></button>
                    <button type="button" aria-label={`Move ${s.name} down`} disabled={i === rows.length - 1} onClick={() => move(i, i + 1)} className={`flex size-6 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800 ${focusRing}`}><ChevronDown className="size-4" strokeWidth={2} /></button>
                  </div>
                  <Monogram text={s.monogram} color={s.accentColor} size="sm" />
                  <div className="min-w-0 flex-1 sm:hidden">
                    <div className="flex flex-wrap items-center gap-1.5"><span className="truncate font-semibold">{s.name}</span><Pill>{s.type === 'embedded' ? 'Embedded' : 'Chat'}</Pill>{s.status !== 'ready' ? <StatusPill status={s.status} /> : null}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">{cat}</div>
                  </div>
                </div>
                <div className="hidden min-w-0 flex-1 sm:block">
                  <div className="flex flex-wrap items-center gap-1.5"><span className="truncate font-semibold">{s.name}</span><Pill>{s.type === 'embedded' ? 'Embedded' : 'Chat'}</Pill>{s.status !== 'ready' ? <StatusPill status={s.status} /> : null}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">{cat}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" className={`${btnSecondary} h-11 flex-1 justify-center sm:h-10 sm:flex-none`} onClick={() => onOpenSolution?.(s.id)}>Open</button>
                  <button type="button" aria-label={`Unstar ${s.name}`} className={`${btnGhost} h-11 w-11 justify-center px-0 text-amber-500 sm:h-10 sm:w-10`} onClick={() => { onToggleFavorite?.(s.id); setUndo(s) }}><Star className="size-5" strokeWidth={1.75} fill="currentColor" /></button>
                </div>
              </li>
            )
          })}
        </ol>
      </Card>

      {undo ? (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium shadow-lg md:left-auto md:right-6 md:translate-x-0 dark:border-gray-700 dark:bg-gray-900">
          Removed {undo.name} from favorites.
          <button type="button" className={`rounded-md font-semibold text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`} onClick={() => { onToggleFavorite?.(undo.id); setUndo(null) }}>Undo</button>
          <button type="button" aria-label="Dismiss" onClick={() => setUndo(null)} className={`ml-1 flex size-8 items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 ${focusRing}`}><X className="size-4" strokeWidth={2} /></button>
        </div>
      ) : null}
    </div>
  )
}
