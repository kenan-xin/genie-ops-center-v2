import { useEffect, useId, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, HelpCircle, Loader2, Search, X } from 'lucide-react'
import { btnDanger, btnGhost, btnPrimary, btnSecondary, focusRing, initials } from './helpers'

/* The section's building blocks, matching the other admin screens: rounded cards, hairline borders, neutral label pills. */

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 ${className}`}>{children}</section>
}

/** Label pills stay a fixed neutral gray (tokens.md, Color roles), so `blue` maps to the gray palette. */
export type Tone = 'gray' | 'blue' | 'emerald' | 'red' | 'amber'
const TONES: Record<Tone, string> = {
  gray: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  blue: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  red: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  amber: 'bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300', // unslop-ignore: the warning surface, not a cream page (tokens.md, Color roles)
}
export function Pill({ tone = 'gray', children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  return <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>
}

/**
 * Contextual help (design-system/tokens.md, "Help disclosure"): a labelled button that opens one
 * short callout. It is collapsed by default, it opens on click, tap, Enter, or Space, and it never
 * opens on hover alone. Escape and a click outside close it.
 */
export function HelpNote({ label, children, align = 'left', iconOnly }: { label: string; children: React.ReactNode; align?: 'left' | 'right'; iconOnly?: boolean }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const wrap = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <span ref={wrap} className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        aria-label={iconOnly ? label : undefined}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-blue-700 motion-safe:transition-colors hover:bg-blue-50 sm:h-8 dark:text-blue-400 dark:hover:bg-blue-950/40 ${focusRing}`}
      >
        <HelpCircle className="size-4" strokeWidth={1.75} aria-hidden />{iconOnly ? null : label}
      </button>
      {open ? (
        <div id={`${id}-panel`} role="group" aria-label={label} className={`absolute top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-gray-200 bg-white p-4 text-left shadow-lg dark:border-gray-700 dark:bg-gray-900 ${align === 'right' ? 'right-0 max-sm:left-0 max-sm:right-auto' : 'left-0'}`}>
          <div className="flex flex-col gap-2 text-xs leading-relaxed text-gray-700 dark:text-gray-300">{children}</div>
          <button type="button" onClick={() => setOpen(false)} className={`mt-3 rounded text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`}>Close</button>
        </div>
      ) : null}
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

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'size-8 text-xs' : 'size-9 text-xs'
  return <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full bg-gray-100 font-bold text-gray-700 dark:bg-gray-800 dark:text-gray-300 ${cls}`}>{initials(name)}</span>
}

export function SearchField({ value, onChange, placeholder, ariaLabel, className = '' }: { value: string; onChange: (v: string) => void; placeholder: string; ariaLabel?: string; className?: string }) {
  return (
    <label className={`flex h-10 min-h-10 min-w-0 items-center gap-2 rounded-lg border border-gray-500 bg-white px-3 text-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 dark:border-gray-500 dark:bg-gray-950 dark:focus-within:ring-blue-400 dark:focus-within:ring-offset-gray-950 ${className}`}>
      <Search className="size-4 shrink-0 text-gray-500" strokeWidth={1.75} aria-hidden />
      <input value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel ?? placeholder} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-gray-500" />
    </label>
  )
}

export function Select({ value, onChange, children, ariaLabel, className = '' }: { value: string; onChange: (v: string) => void; children: React.ReactNode; ariaLabel: string; className?: string }) {
  return (
    <span className={`relative ${className}`}>
      <select aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} className={`h-10 w-full appearance-none rounded-lg border border-gray-500 bg-white pl-3 pr-9 text-sm text-gray-800 dark:border-gray-500 dark:bg-gray-950 dark:text-gray-200 ${focusRing}`}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gray-500" strokeWidth={1.75} />
    </span>
  )
}

export function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-2.5 text-left text-xs font-semibold text-gray-600 first:pl-5 last:pr-5 dark:text-gray-400 ${className}`}>{children}</th>
}
export function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle text-sm first:pl-5 last:pr-5 ${className}`}>{children}</td>
}
export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return <tr><td colSpan={colSpan} className="px-5 py-10 text-center text-sm text-gray-600 dark:text-gray-400">{children}</td></tr>
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<{ id: T; label: string; count?: number }>; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-gray-200 dark:border-gray-800">
      {tabs.map((t) => {
        const active = t.id === value
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`-mb-px flex min-h-11 shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2.5 text-sm font-medium motion-safe:transition-colors ${focusRing} ${active ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-400' : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'}`}
          >
            {t.label}
            {t.count !== undefined ? <span className={`rounded-full px-1.5 text-xs ${active ? 'bg-blue-50 dark:bg-blue-900/40' : 'bg-gray-100 dark:bg-gray-800'}`}>{t.count}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

/** Confirm dialog per tokens.md: the object in the title, one sentence of consequence, Cancel focused. Bottom sheet on phones. */
export function ConfirmDialog({ open, title, description, confirmLabel, danger, busy, onConfirm, onClose }: { open: boolean; title: string; description: string; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  const id = useId()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label="Close dialog" onClick={onClose} className="absolute inset-0 bg-gray-900/25 backdrop-blur-[1px]" />
      <div role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`} className="relative w-full rounded-t-xl border border-gray-200 bg-white shadow-2xl shadow-gray-900/10 sm:max-w-[480px] sm:rounded-xl dark:border-gray-700 dark:bg-gray-900">
        <div className="px-5 pb-5 pt-5 sm:px-6">
          <h2 id={`${id}-title`} className="text-lg font-bold tracking-tight">{title}</h2>
          <p id={`${id}-body`} className="mt-2 text-sm text-gray-600 dark:text-gray-400">{description}</p>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-5 py-3 sm:flex-row sm:justify-end sm:px-6 dark:border-gray-800">
          <button type="button" autoFocus className={`${btnSecondary} h-11 justify-center sm:h-10`} onClick={onClose}>Cancel</button>
          <button type="button" className={`${danger ? btnDanger : btnPrimary} h-11 justify-center sm:h-10 sm:min-w-32`} aria-busy={busy || undefined} onClick={onConfirm}>
            {busy ? <Loader2 className="size-4 motion-safe:animate-spin" strokeWidth={2} aria-hidden /> : null}{confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/** A modal for the secondary path only, which needs protected focus. Bottom sheet on phones. */
export function Dialog({ open, onClose, title, description, children, footer }: { open: boolean; onClose: () => void; title: string; description?: string; children?: React.ReactNode; footer?: React.ReactNode }) {
  const id = useId()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label="Close dialog" onClick={onClose} className="absolute inset-0 bg-gray-900/25 backdrop-blur-[1px]" />
      <div role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} className="relative flex max-h-[90vh] w-full flex-col rounded-t-xl border border-gray-200 bg-white shadow-2xl shadow-gray-900/10 sm:max-w-[520px] sm:rounded-xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 sm:px-6">
          <div>
            <h2 id={`${id}-title`} className="text-lg font-bold tracking-tight">{title}</h2>
            {description ? <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p> : null}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className={`${btnGhost} size-11 justify-center px-0 text-gray-500 sm:size-8`}><X className="size-5" strokeWidth={1.75} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
        {footer ? <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-5 py-3 sm:flex-row sm:justify-end sm:px-6 dark:border-gray-800 [&>button]:h-11 [&>button]:justify-center sm:[&>button]:h-10">{footer}</div> : null}
      </div>
    </div>
  )
}

/** Full-height sheet on phones, a right slide-over of 480px from sm. Escape closes. */
export function SlideOver({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label="Close panel" onClick={onClose} className="absolute inset-0 bg-gray-900/25 backdrop-blur-[1px]" />
      <aside role="dialog" aria-modal="true" aria-label={title} className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl shadow-gray-900/10 sm:inset-y-3 sm:right-3 sm:w-[520px] sm:rounded-xl sm:border sm:border-gray-200 dark:bg-gray-900 dark:sm:border-gray-800">
        {children}
      </aside>
    </div>
  )
}

/** Icon-only close: 44px on phones, 32px from sm. */
export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" aria-label="Close" onClick={onClick} className={`${btnGhost} size-11 justify-center px-0 text-gray-500 sm:size-8`}>
      <X className="size-5" strokeWidth={1.75} />
    </button>
  )
}

/** Sticky bottom bar for the page-level primary action under md (DEC-25). */
export function BottomBar({ children }: { children: React.ReactNode }) {
  return <div className="sticky bottom-0 -mx-3 -mb-3 mt-auto flex items-center gap-2 border-t border-gray-200 bg-white/95 px-3 py-2 backdrop-blur md:hidden dark:border-gray-800 dark:bg-gray-950/95 [&>button]:min-h-11 [&>button]:flex-1 [&>button]:justify-center">{children}</div>
}

/** 4-second toast with a manual close: bottom center on phones, bottom right on desktop. */
export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onDone, 4000)
    return () => clearTimeout(t)
  }, [message, onDone])
  if (!message) return null
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:inset-x-auto md:bottom-6 md:right-6 md:px-0">
      <div className="flex items-center gap-2 rounded-lg bg-gray-900 py-1.5 pl-4 pr-1.5 text-sm font-medium text-white shadow-lg dark:bg-gray-100 dark:text-gray-900">
        {message}
        <button type="button" aria-label="Dismiss" onClick={onDone} className={`flex size-8 items-center justify-center rounded-lg text-gray-300 hover:bg-white/10 hover:text-white dark:text-gray-600 dark:hover:bg-gray-900/10 dark:hover:text-gray-900 ${focusRing}`}>
          <X className="size-4" strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  )
}
