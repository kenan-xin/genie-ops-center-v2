import { Star } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { Solution } from '@/../product/sections/solutions/types'
import { accentAlpha, focusRing } from './helpers'
import { Monogram, Pill, StatusPill } from './ui'

export interface SolutionCardProps {
  solution: Solution
  isFavorite: boolean
  showDraftBadge?: boolean
  compact?: boolean
  /** Compact card only: the second line, which says when the viewer last opened this solution. */
  meta?: string
  /** The solution the viewer opened last. Its own accent tints the card, so the place to carry on is found before anything is read. */
  resume?: boolean
  onOpen?: () => void
  onToggleFavorite?: () => void
}

export function SolutionCard({ solution: s, isFavorite, showDraftBadge, compact, meta, resume, onOpen, onToggleFavorite }: SolutionCardProps) {
  // Every solution owns an accent color, and until now it reached one 44px tile. The card answers in
  // that color on hover and on keyboard focus, so a wall of neutral cards still names its parts.
  const accent = {
    '--edge': accentAlpha(s.accentColor, 0.4),
    '--edge-dark': accentAlpha(s.accentColor, 0.55),
    '--glow': accentAlpha(s.accentColor, 0.6),
    '--tint': accentAlpha(s.accentColor, 0.07),
    '--tint-dark': accentAlpha(s.accentColor, 0.18),
  } as CSSProperties
  const surface = resume
    ? 'border-[color:var(--edge)] bg-[color:var(--tint)] dark:border-[color:var(--edge-dark)] dark:bg-[color:var(--tint-dark)]'
    : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
  return (
    <div
      role="link"
      tabIndex={0}
      style={accent}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.() } }}
      className={`group relative flex cursor-pointer gap-3.5 rounded-xl border ${surface} motion-safe:transition-all hover:border-[color:var(--edge)] hover:shadow-[0_12px_30px_-16px_var(--glow)] focus-visible:border-[color:var(--edge)] motion-safe:hover:-translate-y-px dark:hover:border-[color:var(--edge-dark)] ${focusRing} ${compact ? 'items-center p-3' : 'flex-col p-4'}`}
    >
      <div className={`flex items-start ${compact ? '' : 'justify-between'}`}>
        <Monogram text={s.monogram} color={s.accentColor} size="md" />
        {!compact ? (
          <button
            type="button"
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={isFavorite}
            onClick={(e) => { e.stopPropagation(); onToggleFavorite?.() }}
            className={`-mr-1.5 -mt-1.5 flex size-8 items-center justify-center rounded-lg motion-safe:transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 ${focusRing} ${isFavorite ? 'text-amber-500' : 'text-gray-400 group-hover:text-gray-500 dark:text-gray-500'}`}
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
        {compact && meta ? <p className="mt-0.5 truncate text-xs text-gray-600 dark:text-gray-400">{meta}</p> : null}
      </div>
    </div>
  )
}
