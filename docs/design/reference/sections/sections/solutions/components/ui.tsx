import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Loader2, MoreHorizontal, Search, X } from 'lucide-react'
import type { SolutionStatus } from '@/../product/sections/solutions/types'
import { STATUS_META, btnDanger, btnGhost, btnPrimary, btnSecondary, focusRing, foregroundFor, initials } from './helpers'

/* Shared building blocks: rounded cards, hairline borders, semantic pills, slide-over, dialog. */

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 ${className}`}>{children}</section>
}

export type Tone = 'gray' | 'blue' | 'emerald' | 'red' | 'amber'
// Tinted surfaces stay neutral gray (tokens, Color roles): the blue label pill is gray too, so no tint ramp is derived from the tenant color.
const TONES: Record<Tone, string> = {
  gray: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  blue: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  red: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  amber: 'bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
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
  const cls = { sm: 'size-8 rounded-lg text-xs', md: 'size-11 rounded-xl text-sm', lg: 'size-14 rounded-2xl text-base' }[size]
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center font-extrabold tracking-tight ${cls}`} style={{ backgroundColor: color, color: foregroundFor(color) }}>
      {text}
    </span>
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

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-gray-500 bg-white px-3 text-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 sm:max-w-xs dark:border-gray-500 dark:bg-gray-950 dark:focus-within:ring-blue-400 dark:focus-within:ring-offset-gray-950">
      <Search className="size-4 shrink-0 text-gray-500" strokeWidth={1.75} aria-hidden />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-gray-500" />
    </label>
  )
}

export function Select({ value, onChange, children, ariaLabel }: { value: string; onChange: (v: string) => void; children: React.ReactNode; ariaLabel: string }) {
  return (
    <span className="relative block w-full sm:inline-block sm:w-auto">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-10 w-full appearance-none rounded-xl border border-gray-500 bg-white pl-3 pr-9 text-sm text-gray-800 focus:border-blue-500 dark:border-gray-500 dark:bg-gray-950 dark:text-gray-200 ${focusRing}`}
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
    <div role="tablist" className="flex gap-1 overflow-x-auto px-2 [scrollbar-width:none]">
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
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl shadow-gray-900/10 sm:inset-y-3 sm:right-3 sm:w-[560px] sm:max-w-[calc(100vw-1.5rem)] sm:rounded-2xl sm:border sm:border-gray-200 dark:bg-gray-900 dark:sm:border-gray-800"
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
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label="Close dialog" onClick={onClose} className="absolute inset-0 bg-gray-900/30 backdrop-blur-[1px]" />
      <div role="dialog" aria-modal="true" aria-labelledby="dlg-title" className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl shadow-gray-900/10 sm:max-w-[480px] sm:rounded-2xl dark:border-gray-700 dark:bg-gray-900">
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
        <div role="menu" className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
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
