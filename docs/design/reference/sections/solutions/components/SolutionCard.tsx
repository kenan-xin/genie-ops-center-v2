import { Star } from 'lucide-react'
import type { Solution } from '@/../product/sections/solutions/types'
import { focusRing } from './helpers'
import { Monogram, Pill, StatusPill } from './ui'

export interface SolutionCardProps {
  solution: Solution
  isFavorite: boolean
  showDraftBadge?: boolean
  compact?: boolean
  onOpen?: () => void
  onToggleFavorite?: () => void
}

export function SolutionCard({ solution: s, isFavorite, showDraftBadge, compact, onOpen, onToggleFavorite }: SolutionCardProps) {
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen?.()}
      className={`group relative flex cursor-pointer gap-3.5 rounded-2xl border border-gray-200 bg-white motion-safe:transition-all hover:border-gray-300 hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,.18)] motion-safe:hover:-translate-y-px dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 ${focusRing} ${compact ? 'items-center p-3' : 'flex-col p-4'}`}
    >
      <div className={`flex items-start ${compact ? '' : 'justify-between'}`}>
        <Monogram text={s.monogram} color={s.accentColor} size={compact ? 'sm' : 'md'} />
        {!compact ? (
          <button
            type="button"
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={isFavorite}
            onClick={(e) => { e.stopPropagation(); onToggleFavorite?.() }}
            className={`-mr-1.5 -mt-1.5 flex size-8 items-center justify-center rounded-xl motion-safe:transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 ${focusRing} ${isFavorite ? 'text-amber-500' : 'text-gray-400 group-hover:text-gray-500 dark:text-gray-500'}`}
          >
            <Star className="size-4" strokeWidth={1.75} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className={`truncate font-semibold ${compact ? 'text-sm' : 'text-base'}`}>{s.name}</h3>
          {!compact ? <Pill>{s.type === 'embedded' ? 'Embedded' : 'Chat'}</Pill> : null}
          {s.status !== 'ready' && s.status !== 'draft' ? <StatusPill status={s.status} /> : null}
          {s.status === 'draft' && showDraftBadge ? <Pill>Draft</Pill> : null}
        </div>
        {!compact ? <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{s.description}</p> : null}
      </div>
    </div>
  )
}
