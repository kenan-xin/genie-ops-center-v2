import { useEffect, useId } from 'react'
import { ChevronDown, Cog, Search, X } from 'lucide-react'
import { btnDanger, btnGhost, btnPrimary, btnSecondary, focusRing, initials } from './helpers'

/* Shared building blocks for this section: rounded cards, hairline borders, semantic pills, slide-over, switch, toast. */

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 ${className}`}>{children}</section>
}

export type Tone = 'gray' | 'blue' | 'green' | 'red' | 'amber'
const TONES: Record<Tone, string> = {
  gray: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  red: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  amber: 'bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
}
/** `wrap` lets a long key break inside a fixed table column instead of overrunning the next one. */
export function Pill({ tone = 'gray', children, title, mono, wrap }: { tone?: Tone; children: React.ReactNode; title?: string; mono?: boolean; wrap?: boolean }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${wrap ? 'max-w-full whitespace-normal text-left [overflow-wrap:anywhere]' : 'whitespace-nowrap'} ${mono ? 'font-mono font-medium' : ''} ${TONES[tone]}`}>
      {children}
    </span>
  )
}

/** Person monogram, or a neutral System mark (Lucide Cog) when there is no actor. */
export function Avatar({ name, size = 'md', system, anonymized }: { name?: string; size?: 'sm' | 'md' | 'lg'; system?: boolean; anonymized?: boolean }) {
  const cls = { sm: 'size-8 text-xs', md: 'size-9 text-xs', lg: 'size-12 text-sm' }[size]
  if (system || !name) {
    return (
      <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full border border-dashed border-gray-400 text-gray-500 dark:border-gray-600 ${cls}`}>
        <Cog className="size-4" strokeWidth={1.75} />
      </span>
    )
  }
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full font-bold ${anonymized ? 'bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200'} ${cls}`}>
      {anonymized ? '?' : initials(name)}
    </span>
  )
}

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 text-sm focus-within:ring-2 focus-within:ring-blue-500/60 focus-within:ring-offset-2 sm:max-w-xs dark:border-gray-700 dark:bg-gray-950 dark:focus-within:ring-offset-gray-950">
      <Search className="size-4 shrink-0 text-gray-500" strokeWidth={1.75} aria-hidden />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-gray-500" />
    </label>
  )
}

export function Select({ value, onChange, children, ariaLabel, className = '' }: { value: string; onChange: (v: string) => void; children: React.ReactNode; ariaLabel: string; className?: string }) {
  return (
    <span className={`relative ${className}`}>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-10 w-full appearance-none rounded-xl border border-gray-300 bg-white pl-3 pr-9 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 ${focusRing}`}
      >
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

/** Full-height sheet on phones (the base), a right slide-over of 480px from sm. Escape closes. */
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
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl shadow-gray-900/10 sm:inset-y-3 sm:right-3 sm:w-[480px] sm:rounded-2xl sm:border sm:border-gray-200 dark:bg-gray-900 dark:sm:border-gray-800"
      >
        {children}
      </aside>
    </div>
  )
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" aria-label="Close" onClick={onClick} className={`${btnGhost} size-11 justify-center px-0 text-gray-500 sm:size-8`}>
      <X className="size-5" strokeWidth={1.75} />
    </button>
  )
}

/** Bare switch control. Wrap it in a label or give it an aria-label. */
export function Switch({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className="h-6 w-11 rounded-full bg-gray-300 motion-safe:transition-colors peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/60 peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed dark:bg-gray-700 dark:peer-focus-visible:ring-offset-gray-950" />
      <span className="absolute left-0.5 size-5 rounded-full bg-white shadow motion-safe:transition-transform peer-checked:translate-x-5" />
    </span>
  )
}

/** Labeled switch row with a 44px touch target. */
export function SwitchRow({ label, description, checked, onChange, disabled, note }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; note?: React.ReactNode }) {
  return (
    <div className={`rounded-xl border border-gray-200 px-3.5 py-3 dark:border-gray-800 ${disabled ? 'opacity-70' : ''}`}>
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
        <span><span className="block text-sm font-semibold">{label}</span>{description ? <span className="block text-xs text-gray-600 dark:text-gray-400">{description}</span> : null}</span>
        <Switch label={label} checked={checked} onChange={onChange} disabled={disabled} />
      </label>
      {note ? <div className="mt-2 text-xs text-gray-700 dark:text-gray-300">{note}</div> : null}
    </div>
  )
}

/** Confirm dialog per tokens.md: object in the title, one sentence of consequence, Cancel focused, danger tone on a destructive action. Bottom sheet on phones. */
export function ConfirmDialog({ open, title, description, confirmLabel, danger, onConfirm, onClose }: { open: boolean; title: string; description: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
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
      <div role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`} className="relative w-full rounded-t-2xl border border-gray-200 bg-white shadow-2xl shadow-gray-900/10 sm:max-w-[480px] sm:rounded-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="px-5 pb-5 pt-5 sm:px-6">
          <h2 id={`${id}-title`} className="text-lg font-bold tracking-tight">{title}</h2>
          <p id={`${id}-body`} className="mt-2 text-sm text-gray-600 dark:text-gray-400">{description}</p>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-5 py-3 sm:flex-row sm:justify-end sm:px-6 dark:border-gray-800">
          <button type="button" autoFocus className={`${btnSecondary} h-11 justify-center sm:h-10`} onClick={onClose}>Cancel</button>
          <button type="button" className={`${danger ? btnDanger : btnPrimary} h-11 justify-center sm:h-10`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
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
      <div className="flex items-center gap-2 rounded-xl bg-gray-900 py-1.5 pl-4 pr-1.5 text-sm font-medium text-white shadow-lg dark:bg-gray-100 dark:text-gray-900">
        {message}
        <button type="button" aria-label="Dismiss" onClick={onDone} className={`flex size-8 items-center justify-center rounded-lg text-gray-300 hover:bg-white/10 hover:text-white dark:text-gray-600 dark:hover:bg-gray-900/10 dark:hover:text-gray-900 ${focusRing}`}>
          <X className="size-4" strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  )
}
