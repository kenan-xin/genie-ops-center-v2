import { useEffect, useId, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, HelpCircle, Loader2, MoreHorizontal, Search, SlidersHorizontal, X } from 'lucide-react'
import type { SolutionStatus } from '@/../product/sections/solutions/types'
import { STATUS_META, btnDanger, btnGhost, btnPrimary, btnSecondary, focusRing, foregroundFor, initials, useModalFocus } from './helpers'

/* Shared building blocks: rounded cards, hairline borders, semantic pills, slide-over, dialog. */


export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 ${className}`}>{children}</section>
}

/** One dismiss behavior for every panel that hangs off a control in this section: Escape and a press outside close it. */
function useDismiss(open: boolean, setOpen: (v: boolean) => void, wrap: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, setOpen, wrap])
}

const panelClass = 'absolute top-full z-30 mt-1 max-w-[calc(100vw-2rem)] rounded-md border border-gray-200 bg-white p-4 text-left shadow-lg dark:border-gray-700 dark:bg-gray-900'

/**
 * The one contextual-help pattern (tokens.md, Help disclosure): a labelled button opens one collapsed
 * callout beside the control it explains, at most one per screen. It never opens on hover alone.
 * Escape and a click outside close it. `iconOnly` drops the text when the row already carries enough
 * words, and moves the label to `aria-label`.
 */
export function HelpNote({ label, children, align = 'left', iconOnly }: { label: string; children: React.ReactNode; align?: 'left' | 'right'; iconOnly?: boolean }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const wrap = useRef<HTMLSpanElement>(null)
  useDismiss(open, setOpen, wrap)
  return (
    <span ref={wrap} className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        aria-label={iconOnly ? label : undefined}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-11 items-center gap-1.5 rounded-lg text-sm font-medium text-blue-700 motion-safe:transition-colors hover:bg-blue-50 sm:h-10 dark:text-blue-400 dark:hover:bg-blue-950/40 ${iconOnly ? 'w-11 justify-center sm:w-10' : 'px-2'} ${focusRing}`}
      >
        <HelpCircle className="size-5 sm:size-4" strokeWidth={1.75} aria-hidden />{iconOnly ? null : label}
      </button>
      {/* Phones pin the panel to the viewport gutters instead of the button, so it cannot be clipped wherever the trigger sits (tokens.md: a dialog goes full width under 768px). */}
      {open ? (
        <div id={`${id}-panel`} role="group" aria-label={label} className={`${panelClass} w-80 max-sm:fixed max-sm:inset-x-4 max-sm:bottom-[calc(7rem+env(safe-area-inset-bottom))] max-sm:top-auto max-sm:w-auto max-sm:max-w-none ${align === 'right' ? 'sm:right-0' : 'sm:left-0'}`}>
          <div className="flex flex-col gap-2 text-xs leading-relaxed text-gray-700 dark:text-gray-300">{children}</div>
          <button type="button" onClick={() => setOpen(false)} className={`mt-3 rounded text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`}>Close</button>
        </div>
      ) : null}
    </span>
  )
}

/**
 * Secondary filters behind one control. A toolbar that lines up four selects crushes the search field
 * beside them, and a filter a person touches once a month does not earn standing width. The button
 * carries the number of filters now narrowing the list, and the page renders a removable chip per
 * active filter underneath, so nothing this panel holds is ever hidden state.
 */
export function FilterMenu({ count, onClear, children }: { count: number; onClear?: () => void; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const wrap = useRef<HTMLSpanElement>(null)
  useDismiss(open, setOpen, wrap)
  return (
    <span ref={wrap} className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((v) => !v)}
        className={`${btnSecondary} ${count ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-400' : ''}`}
      >
        <SlidersHorizontal className="size-4" strokeWidth={1.75} aria-hidden />
        Filters
        {count ? <span className="rounded-full bg-blue-600 px-1.5 text-xs font-semibold tabular-nums text-white">{count}</span> : null}
      </button>
      {open ? (
        <div id={`${id}-panel`} role="group" aria-label="Filters" className={`${panelClass} left-0 w-72`}>
          {children}
          {onClear ? (
            <button type="button" onClick={onClear} className={`mt-3 rounded text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`}>Clear filters</button>
          ) : null}
        </div>
      ) : null}
    </span>
  )
}

export type Tone = 'gray' | 'blue' | 'emerald' | 'red' | 'amber'
// Tinted surfaces stay neutral gray (tokens, Color roles): the blue label pill is gray too, so no tint ramp is derived from the tenant color.
const TONES: Record<Tone, string> = {
  gray: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  blue: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  red: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  amber: 'bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300', // unslop-ignore: the warning surface, not a cream page (tokens.md, Color roles)
}
export function Pill({ tone = 'gray', children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${TONES[tone]}`}>
      {children}
    </span>
  )
}

export function StatusPill({ status }: { status: SolutionStatus }) {
  return <Pill tone={STATUS_META[status].tone}>{STATUS_META[status].label}</Pill>
}

/** Solution monogram tile in its accent color with a computed foreground. */
export function Monogram({ text, color, size = 'md' }: { text: string; color: string; size?: 'sm' | 'md' | 'lg' }) {
  // The letter tile follows the tile step of the radius ladder: 6px small, 8px medium, 12px large.
  const cls = { sm: 'size-8 rounded-md text-xs', md: 'size-11 rounded-lg text-sm', lg: 'size-14 rounded-xl text-base' }[size]
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center font-extrabold tracking-tight ${cls}`} style={{ backgroundColor: color, color: foregroundFor(color) }}>
      {text}
    </span>
  )
}

/**
 * The one warning note (DESIGN.md, Semantic colors): amber-800 on amber-50, one alert icon, one
 * short sentence. `sm` is the inline note under a control, `md` the block at the top of a card or a
 * sheet. Amber is only ever a real warning.
 */
export function WarningNote({ children, size = 'sm', className = '', role }: { children: React.ReactNode; size?: 'sm' | 'md'; className?: string; role?: 'status' | 'alert' }) {
  const md = size === 'md'
  return (
    <div role={role} className={`flex items-start rounded-lg bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 ${md ? 'gap-2.5 px-3.5 py-3 text-sm' : 'gap-1.5 px-2.5 py-1.5 text-xs'} ${className}`}>
      <AlertTriangle className={`size-4 shrink-0 ${md ? 'mt-0.5' : 'mt-px'}`} strokeWidth={2} aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const cls = { sm: 'size-8 text-xs', md: 'size-10 text-xs', lg: 'size-14 text-base' }[size]
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full bg-gray-100 font-bold text-gray-700 dark:bg-gray-800 dark:text-gray-300 ${cls}`}>
      {initials(name)}
    </span>
  )
}

/** `shortcut` draws the key that focuses this field, shown only while the field is empty. `inputRef` lets the page press it. */
export function SearchField({ value, onChange, placeholder, inputRef, shortcut }: { value: string; onChange: (v: string) => void; placeholder: string; inputRef?: React.Ref<HTMLInputElement>; shortcut?: string }) {
  return (
    // The field keeps a 192px floor and wraps to its own line rather than shrinking. It was the only
    // flexible item in the toolbar, so every select beside it took its width first (CHANGELOG, 2026-09-19).
    <label className="flex h-10 min-h-10 min-w-48 flex-1 items-center gap-2 rounded-lg border border-gray-500 bg-white px-3 text-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 sm:max-w-sm dark:border-gray-500 dark:bg-gray-950 dark:focus-within:ring-blue-400 dark:focus-within:ring-offset-gray-950">
      <Search className="size-4 shrink-0 text-gray-500" strokeWidth={1.75} aria-hidden />
      <input ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="peer min-w-0 flex-1 bg-transparent outline-none placeholder:text-gray-500" />
      {shortcut && !value ? (
        <kbd aria-hidden className="hidden shrink-0 rounded border border-gray-300 px-1.5 font-mono text-xs leading-5 text-gray-500 peer-focus:invisible sm:block dark:border-gray-700 dark:text-gray-400">{shortcut}</kbd>
      ) : null}
    </label>
  )
}

/** `full` keeps the control at the container's width past `sm`, for a select stacked inside a panel. */
export function Select({ value, onChange, children, ariaLabel, full }: { value: string; onChange: (v: string) => void; children: React.ReactNode; ariaLabel: string; full?: boolean }) {
  return (
    <span className={`relative block w-full ${full ? '' : 'sm:inline-block sm:w-auto'}`}>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-10 w-full appearance-none rounded-lg border border-gray-500 bg-white pl-3 pr-9 text-sm text-gray-800 focus:border-blue-500 dark:border-gray-500 dark:bg-gray-950 dark:text-gray-200 ${focusRing}`}
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gray-500" strokeWidth={1.75} />
    </span>
  )
}

export function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 text-left text-xs font-semibold text-gray-600 first:pl-5 last:pr-5 dark:text-gray-400 ${className}`}>{children}</th>
}
export function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 align-middle text-sm first:pl-5 last:pr-5 ${className}`}>{children}</td>
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<{ id: T; label: string; count?: number }>; value: T; onChange: (t: T) => void }) {
  return (
    // Phone: the strip scrolls and a fade on the right edge hints at more tabs.
    <div className="relative border-b border-gray-200 after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-8 after:bg-gradient-to-l after:from-white after:to-transparent sm:after:hidden dark:border-gray-800 dark:after:from-gray-900">
    <div role="tablist" className="flex gap-1 overflow-x-auto overflow-y-hidden px-2 [scrollbar-width:none]">
      {tabs.map((t) => {
        const active = t.id === value
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium motion-safe:transition-colors ${focusRing} ${
              active ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-400' : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
            }`}
          >
            {t.label}
            {t.count !== undefined ? <span className="rounded-full bg-gray-100 px-1.5 text-xs dark:bg-gray-800">{t.count}</span> : null}
          </button>
        )
      })}
    </div>
    </div>
  )
}

/** Full-height sheet on phones (the base), a right slide-over of 560px from sm. Escape closes. */
export function SlideOver({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const panel = useModalFocus<HTMLElement>(open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40">
      <button type="button" tabIndex={-1} aria-hidden onClick={onClose} className="absolute inset-0 bg-gray-900/25 backdrop-blur-[1px]" />
      <aside
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl shadow-gray-900/10 sm:inset-y-3 sm:right-3 sm:w-[560px] sm:max-w-[calc(100vw-1.5rem)] sm:rounded-xl sm:border sm:border-gray-200 dark:bg-gray-900 dark:sm:border-gray-800"
      >
        {children}
      </aside>
    </div>
  )
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" aria-label="Close" onClick={onClick} className={`${btnGhost} size-11 justify-center px-0 text-gray-500 sm:size-8`}>
      <X className="size-5 sm:size-4" strokeWidth={1.75} />
    </button>
  )
}

/** Small centered dialog. */
export function Dialog({ open, onClose, title, description, children, footer }: { open: boolean; onClose: () => void; title: string; description?: string; children?: React.ReactNode; footer?: React.ReactNode }) {
  const panel = useModalFocus(open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" tabIndex={-1} aria-hidden onClick={onClose} className="absolute inset-0 bg-gray-900/30 backdrop-blur-[1px]" />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="dlg-title" className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl border border-gray-200 bg-white shadow-2xl shadow-gray-900/10 sm:max-w-[480px] sm:rounded-xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-start justify-between gap-3 px-6 pt-5">
          <div>
            <h2 id="dlg-title" className="text-lg font-bold tracking-tight">{title}</h2>
            {description ? <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p> : null}
          </div>
          <CloseButton onClick={onClose} />
        </div>
        {children ? <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div> : <div className="h-4" />}
        {footer ? <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end dark:border-gray-800 [&>button]:min-h-[44px] sm:[&>button]:min-h-0">{footer}</div> : null}
      </div>
    </div>
  )
}

/** Confirm step per tokens: the object in the title, one consequence sentence, Cancel focused, danger tone for destructive actions. Escape, scrim, and Cancel all cancel. */
export function ConfirmDialog({ open, title, description, confirmLabel, danger, onConfirm, onClose }: { open: boolean; title: string; description: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={<><button type="button" autoFocus className={btnSecondary} onClick={onClose}>Cancel</button><button type="button" className={danger ? btnDanger : btnPrimary} onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</button></>}
    />
  )
}

/** Row overflow menu. */
export function RowMenu({ items }: { items: Array<{ label: string; onSelect: () => void; danger?: boolean }> }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label="More actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={`${btnGhost} size-8 justify-center px-0 text-gray-500`}>
        <MoreHorizontal className="size-4" strokeWidth={1.75} />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              type="button"
              onClick={() => { setOpen(false); it.onSelect() }}
              className={`flex w-full rounded-md px-2.5 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800 ${focusRing} ${it.danger ? 'text-red-700 dark:text-red-300' : 'text-gray-800 dark:text-gray-200'}`}
            >
              {it.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Primary button with the tokens loading state: the label stays, a spinner replaces the leading icon, width is kept, `aria-busy`, a second press does nothing. Design-only: waits ~900 ms then calls `onClick`. */
export function SaveButton({ icon, onClick, disabled, title, className = '', children }: { icon: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string; className?: string; children: React.ReactNode }) {
  const [loading, setLoading] = useState(false)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const press = () => {
    if (loading) return
    setLoading(true)
    timer.current = window.setTimeout(() => { setLoading(false); onClick() }, 900)
  }
  return (
    <button type="button" aria-busy={loading || undefined} disabled={disabled} title={title} onClick={press} className={`${btnPrimary} min-w-24 justify-center ${className}`}>
      {loading ? <Loader2 className="size-5 motion-safe:animate-spin" strokeWidth={2} aria-hidden /> : icon}
      {children}
    </button>
  )
}

/** Phone only: sticky bar for the page's primary action, the same slot the shell's `bottomBar` fills. Full bleed inside the shell's main padding. */
export function BottomBar({ children }: { children: React.ReactNode }) {
  return <div className="sticky bottom-0 -mx-3 -mb-3 mt-auto flex items-center gap-2 border-t border-gray-200 bg-white/95 px-3 py-2 backdrop-blur md:hidden dark:border-gray-800 dark:bg-gray-950/95 [&>button]:min-h-11 [&>button]:flex-1 [&>button]:justify-center">{children}</div>
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-12 text-center text-sm text-gray-600 dark:text-gray-400">{children}</td>
    </tr>
  )
}
